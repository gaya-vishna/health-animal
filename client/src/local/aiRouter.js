// Decides who answers an AI question in local mode: the user's own Gemini key first,
// then their own server (if the build has one), otherwise null (caller uses offline estimates).
import { askServer } from './remoteAi';
import { loadAiKey } from './aiKey';
import { estimateDish, surprise } from './geminiDirect';
import { getLang } from '../utils/i18n';

export const hasAiServer = () => !!(import.meta.env.VITE_AI_SERVERS || '').trim();

export async function askAi(path, body) {
  const key = await loadAiKey();
  if (key) {
    try {
      if (path === '/api/ai/estimate-dish') return await estimateDish(key, body, getLang());
      if (path === '/api/rescue/surprise') return await surprise(key, body, getLang());
    } catch {
      // key rejected, no connection or bad reply: fall through to the server
    }
  }
  return askServer(path, body);
}
