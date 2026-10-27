import { useEffect, useState } from 'react';
import { t } from '../utils/i18n';
import { loadAiKey, setAiKey, clearAiKey, maskKey } from '../local/aiKey';
import { testKey } from '../local/geminiDirect';
import { hasAiServer } from '../local/aiRouter';

// Local mode only: lets people paste their own free Gemini key so AI estimates work with no server.
export default function AiKeySettings() {
  const [saved, setSaved] = useState('');
  const [draft, setDraft] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadAiKey().then(setSaved);
  }, []);

  const save = async () => {
    if (!draft.trim()) return;
    await setAiKey(draft);
    setSaved(draft.trim());
    setDraft('');
    setMsg('');
  };

  const test = async () => {
    const key = draft.trim() || saved;
    if (!key) return;
    setBusy(true);
    setMsg('');
    const r = await testKey(key);
    setBusy(false);
    setMsg(r === 'ok' ? t('Key works ✓') : r === 'invalid' ? t('Key not accepted') : t('No connection'));
  };

  const remove = async () => {
    await clearAiKey();
    setSaved('');
    setDraft('');
    setMsg('');
  };

  const using = saved ? t('Using: your key') : hasAiServer() ? t('Using: your server') : t('Using: offline estimates');

  return (
    <div className="pixel-box-wood p-4 rounded-2xl space-y-3">
      <h2 className="font-pixel text-xs text-amber-300 flex items-center gap-1.5">
        <span>✨</span> {t('AI ESTIMATES (OPTIONAL)')}
      </h2>
      <p className="text-[10px] font-pixel text-amber-200/70">
        {t('Paste your own free Gemini API key. It stays only on this phone; food text and photos go directly to Google.')}
      </p>
      <a
        href="https://aistudio.google.com/apikey"
        target="_blank"
        rel="noopener noreferrer"
        className="block text-[10px] font-pixel text-emerald-300 underline"
      >
        {t('Get a free key')}
      </a>
      {saved ? (
        <p className="text-[10px] font-pixel text-amber-100 break-all">🔑 {maskKey(saved)}</p>
      ) : (
        <input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="AIza..."
          className="w-full px-3 py-2 rounded-xl bg-black/30 border-2 border-amber-900/60 text-[11px] font-pixel text-amber-100"
        />
      )}
      <div className="flex gap-2">
        {!saved && (
          <button type="button" onClick={save} disabled={!draft.trim()} className="flex-1 py-2.5 rounded-xl pixel-btn-wood text-[10px] font-pixel cursor-pointer disabled:opacity-50">
            {t('SAVE KEY')}
          </button>
        )}
        <button type="button" onClick={test} disabled={busy || (!saved && !draft.trim())} className="flex-1 py-2.5 rounded-xl pixel-btn-wood text-[10px] font-pixel cursor-pointer disabled:opacity-50">
          {t('TEST KEY')}
        </button>
        {saved && (
          <button type="button" onClick={remove} className="flex-1 py-2.5 rounded-xl pixel-btn-wood text-[10px] font-pixel cursor-pointer">
            {t('REMOVE KEY')}
          </button>
        )}
      </div>
      {msg && <p className="text-[10px] font-pixel text-emerald-300">{msg}</p>}
      <p className="text-[9px] font-pixel text-amber-300/50">{using}</p>
    </div>
  );
}
