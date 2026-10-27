import { getLang } from './i18n';
import { LOCAL } from '../local/mode';
import { localApi } from '../local/localApi';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const TOKEN_KEY = 'ha_token';

// Private browsing / blocked storage makes localStorage throw; the app must still start.
let memoryToken = null;
export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY) || memoryToken; } catch { return memoryToken; }
};
export const setToken = (tok) => {
  memoryToken = tok;
  try { localStorage.setItem(TOKEN_KEY, tok); } catch { /* keep the in-memory token */ }
};
export const clearToken = () => {
  memoryToken = null;
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
};

// AI calls can legitimately take a while; everything else should answer quickly.
const defaultTimeout = (path) => (/\/api\/(ai|rescue)|ai-analyze/.test(path) ? 60000 : 20000);

// fetch wrapper: attaches the session token, never hangs forever, and a 401 signs the user out.
export async function api(path, opts = {}) {
  if (LOCAL) return localApi(path, opts); // Android app: data lives on the phone
  const { timeoutMs = defaultTimeout(path), ...init } = opts;
  const token = getToken();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { ...(init.headers || {}), 'X-Lang': getLang(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    clearToken();
    window.dispatchEvent(new Event('ha-logout'));
  }
  return res;
}
