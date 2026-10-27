import { Preferences } from '@capacitor/preferences';

// On-phone database for local mode. Each collection is one JSON value in Capacitor Preferences
// (Android SharedPreferences: durable app storage that is not cleared like browser storage).
// Everything is held in memory after initStore() and written through on every change.

export const COLLECTIONS = ['config', 'avatar', 'recipes', 'logs', 'workouts', 'checkins'];
const KEY = (name) => `ha_local_${name}`;
const data = {};

// Collections whose Preferences.get threw: held in memory only and never written, so a
// transient read failure can't overwrite the real stored data with defaults.
const failed = new Set();

export async function initStore() {
  for (const name of COLLECTIONS) {
    let raw;
    try {
      ({ value: raw } = await Preferences.get({ key: KEY(name) }));
    } catch (err) {
      console.error('store read failed', name, err);
      failed.add(name);
      continue;
    }
    try {
      data[name] = raw ? JSON.parse(raw) : null;
    } catch {
      // Keep the unreadable value aside before it gets seeded over.
      try {
        await Preferences.set({ key: `${KEY(name)}_corrupt_${Date.now()}`, value: raw });
      } catch {}
      data[name] = null;
    }
  }
}

export const read = (name) => data[name];
export const isFailed = (name) => failed.has(name);

// Sets the in-memory value only (defaults for a collection that could not be loaded).
export function setMemory(name, value) {
  data[name] = value;
}

export async function write(name, value) {
  if (failed.has(name)) throw new Error(`store-unavailable:${name}`);
  const prev = data[name];
  data[name] = value; // memory first, so quick back-to-back writes build on each other
  try {
    await Preferences.set({ key: KEY(name), value: JSON.stringify(value) });
  } catch (err) {
    if (data[name] === value) data[name] = prev; // only if no newer write landed since
    throw err;
  }
}

export function snapshot() {
  return { app: 'health-animal', version: 1, exportedAt: new Date().toISOString(), data: { ...data } };
}

export async function restore(backup) {
  if (!backup || backup.app !== 'health-animal' || !backup.data) throw new Error('not-a-backup');
  for (const name of COLLECTIONS) await write(name, backup.data[name] ?? null);
}

export const newId = () =>
  (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
