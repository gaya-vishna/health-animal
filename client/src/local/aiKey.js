// The user's own Gemini API key, kept only on this phone (Capacitor Preferences).
// It is deliberately NOT one of store.js COLLECTIONS, so it never lands in a backup file
// and survives a restore.
import { Preferences } from '@capacitor/preferences';

const KEY = 'ha_gemini_api_key';
let cached = null; // null = not loaded yet, '' = loaded and empty

export async function loadAiKey() {
  if (cached !== null) return cached;
  try {
    const { value } = await Preferences.get({ key: KEY });
    cached = value || '';
  } catch {
    cached = '';
  }
  return cached;
}

export const getAiKey = () => cached || '';

export async function setAiKey(k) {
  const v = String(k || '').trim();
  if (!v) return clearAiKey();
  await Preferences.set({ key: KEY, value: v });
  cached = v;
}

export async function clearAiKey() {
  try {
    await Preferences.remove({ key: KEY });
  } catch { /* nothing stored */ }
  cached = '';
}

export const maskKey = (k) => (k ? `••••${String(k).slice(-4)}` : '');
