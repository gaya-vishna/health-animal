import { Preferences } from '@capacitor/preferences';
import { sanitizeRestoredConfig } from './configSanitize';

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

const MAX_ROWS = 50000;
const ARRAYS = ['recipes', 'logs', 'workouts', 'checkins'];
const OBJECTS = ['config', 'avatar'];
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export class BackupError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BackupError';
    this.code = code;
  }
}

// Deep copy of parsed JSON without the keys that could poison prototypes. Depth-limited.
function clean(v, depth = 0) {
  if (depth > 12) return null;
  if (Array.isArray(v)) return v.map((x) => clean(x, depth + 1));
  if (isPlain(v)) {
    const out = {};
    for (const k of Object.keys(v)) if (!UNSAFE_KEYS.has(k)) out[k] = clean(v[k], depth + 1);
    return out;
  }
  return v;
}

// Validates a whole backup before anything is written; returns { name: value } for every collection.
function validate(backup) {
  const notBackup = () => new BackupError('not-a-backup', "This file isn't a Health Animal backup");
  if (!isPlain(backup) || backup.app !== 'health-animal' || !isPlain(backup.data)) throw notBackup();
  const src = backup.data;
  // A backup with neither settings nor history would wipe the phone for nothing.
  if (!isPlain(src.config) && !Array.isArray(src.logs)) throw notBackup();
  const out = {};
  for (const name of COLLECTIONS) {
    const raw = Object.prototype.hasOwnProperty.call(src, name) ? src[name] : null;
    if (raw == null) {
      out[name] = null;
    } else if (OBJECTS.includes(name)) {
      out[name] = isPlain(raw) ? (name === 'config' ? sanitizeRestoredConfig(clean(raw)) : clean(raw)) : null;
    } else {
      if (!Array.isArray(raw)) {
        out[name] = null;
      } else {
        if (raw.length > MAX_ROWS) throw new BackupError('too-large', 'Backup file is too large');
        out[name] = raw.filter((r) => isPlain(r) && typeof r.id === 'string' && r.id).map((r) => clean(r));
      }
    }
  }
  return out;
}

export async function restore(backup) {
  const next = validate(backup);
  const prev = {};
  for (const name of COLLECTIONS) prev[name] = data[name] ?? null;
  const done = [];
  try {
    for (const name of COLLECTIONS) {
      await write(name, next[name]);
      done.push(name);
    }
  } catch (err) {
    for (const name of done.concat(COLLECTIONS.filter((n) => !done.includes(n)))) {
      try { await write(name, prev[name]); } catch {}
    }
    throw new BackupError('write-failed', 'Backup is damaged: nothing was changed');
  }
}

export const newId = () =>
  (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
