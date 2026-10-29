// Decides who answers an AI question in local mode: the user's own Gemini key first,
// then their own server (if the build has one), otherwise null (caller uses offline estimates).
// Estimate answers always carry fallbackReason: null (a real AI answer) or why we fell back to the
// offline estimate: 'no_key' | 'bad_key' | 'quota' | 'network' | 'bad_reply'.
import { askServer } from './remoteAi';
import { loadAiKey } from './aiKey';
import { estimateDish, surprise } from './geminiDirect';
import { offlineEstimate } from './offlineEstimate';
import { normalizeEstimate } from '../../../shared/aiPrompts.mjs';
import { getLang } from '../utils/i18n';

export const hasAiServer = () => !!(import.meta.env.VITE_AI_SERVERS || '').trim();

const REASONS = ['no_key', 'bad_key', 'quota', 'network', 'bad_reply'];
const reasonOf = (err) => (REASONS.includes(err?.reason) ? err.reason : 'network');

export async function askAi(path, body) {
  const key = await loadAiKey();
  let reason = key ? null : 'no_key';
  if (key) {
    try {
      if (path === '/api/ai/estimate-dish') return { ...(await estimateDish(key, body, getLang())), fallbackReason: null };
      if (path === '/api/rescue/surprise') return await surprise(key, body, getLang());
    } catch (err) {
      // key rejected, quota used up, no connection or bad reply: fall through to the server
      reason = reasonOf(err);
    }
  }
  const remote = await askServer(path, body);
  if (path !== '/api/ai/estimate-dish') return remote;
  if (remote && !remote.error) {
    const fallback = offlineEstimate({ ...body, lang: getLang() });
    return { ...normalizeEstimate(remote, fallback), fallbackReason: null };
  }
  return { ...offlineEstimate({ ...body, lang: getLang() }), fallbackReason: reason || 'network' };
}
