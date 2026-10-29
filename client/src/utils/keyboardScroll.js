import { Capacitor } from '@capacitor/core';

// Safety net: after the soft keyboard opens, keep the focused field visible.
export function initKeyboardScroll() {
  if (!Capacitor.isNativePlatform()) return;
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!t || !t.tagName) return;
    const tag = t.tagName;
    const ok = tag === 'TEXTAREA' || tag === 'SELECT' ||
      (tag === 'INPUT' && t.type !== 'checkbox' && t.type !== 'radio');
    if (!ok) return;
    setTimeout(() => {
      try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* ignore */ }
    }, 350);
  });
}
