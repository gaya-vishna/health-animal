// In local mode the only thing that can still go to your own server is the AI question.
// Optional: list one or more server addresses at build time (none = offline estimates):
//   VITE_AI_SERVERS="http://<your-server>:8090"  VITE_APP_KEY="..."
import { getLang } from '../utils/i18n';

const SERVERS = (import.meta.env.VITE_AI_SERVERS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const APP_KEY = import.meta.env.VITE_APP_KEY || '';

async function fetchWithTimeout(url, init, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

let reachable = null; // { base, at }
async function findServer() {
  if (!SERVERS.length) return null;
  if (reachable && Date.now() - reachable.at < 5 * 60 * 1000) return reachable.base;
  // Ask every address at once and use whichever answers first.
  try {
    const base = await Promise.any(
      SERVERS.map((b) =>
        fetchWithTimeout(`${b}/api/health`, { cache: 'no-store' }, 3000).then((r) => (r.ok ? b : Promise.reject(new Error('down'))))
      )
    );
    reachable = { base, at: Date.now() };
    return base;
  } catch {
    reachable = null;
    return null;
  }
}

// Returns the server's JSON answer, or null when no server is reachable (caller falls back offline).
export async function askServer(path, body) {
  const base = await findServer();
  if (!base) return null;
  try {
    const r = await fetchWithTimeout(
      `${base}${path}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-App-Key': APP_KEY, 'X-Lang': getLang() },
        body: JSON.stringify(body),
      },
      60000
    );
    if (!r.ok) return null;
    return await r.json();
  } catch {
    reachable = null;
    return null;
  }
}
