import he from './strings.he';

const LANG_KEY = 'ha_lang';

function detect() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'he' || saved === 'en') return saved;
  } catch {}
  return (navigator.language || '').toLowerCase().startsWith('he') ? 'he' : 'en';
}

let lang = detect();

export const getLang = () => lang;
export const isRtl = () => lang === 'he';

// Sets <html lang/dir> so layout, fonts and native controls follow the language.
export function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
}

export function setLang(next) {
  lang = next;
  try { localStorage.setItem(LANG_KEY, next); } catch {}
  applyLang();
}

// t('English text', { n: 3 }) -> Hebrew when the language is Hebrew, else the English text.
// `{n}` placeholders are filled from the second argument.
export function t(text, vars) {
  let out = lang === 'he' && he[text] !== undefined ? he[text] : text;
  if (vars) out = out.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
  return out;
}
