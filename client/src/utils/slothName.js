import { useSyncExternalStore } from 'react';
import { t } from './i18n';

// The user's name for their sloth. Kept outside React so reminders (built off-screen) can read it too.
let stored = null;
const listeners = new Set();

export function setSlothName(v) {
  const next = v || null;
  if (next === stored) return;
  stored = next;
  listeners.forEach((fn) => fn());
}

// Falls back to the default name in the current language, computed per call so a language switch just works.
export const getSlothName = () => stored || t('Slomo');

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Re-renders the component when the name is saved. The stored value is the snapshot; the language
// fallback is resolved on render.
export function useSlothName() {
  useSyncExternalStore(subscribe, () => stored);
  return getSlothName();
}
