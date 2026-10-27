import React, { useState } from 'react';
import { api, setToken } from '../utils/api';
import { t, getLang } from '../utils/i18n';

export default function AuthView({ onAuthed, onToggleLang }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api(`/api/auth/${mode === 'login' ? 'login' : 'register'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, lang: getLang() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      setToken(data.token);
      onAuthed(data.user);
    } catch (err) {
      setError(t(err.message));
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full px-3 py-2.5 rounded-xl bg-[#132c1e] border border-[#235037] text-sm outline-none focus:border-amber-300';

  return (
    <div className="h-full flex items-center justify-center px-6 bg-[#0b1912] text-[#f5f6fa]">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3">
        <div className="text-center mb-4">
          <button type="button" onClick={onToggleLang} className="tap-area float-end text-[12px] font-bold text-amber-200 px-3 py-1.5 rounded-full border border-[#235037] bg-[#132c1e]" style={{ fontFamily: "'Heebo', system-ui, sans-serif" }}>
            {getLang() === 'he' ? 'EN' : 'עב'}
          </button>
          <div className="text-5xl mb-2">🍃</div>
          <h1 className="font-pixel text-sm text-amber-200 tracking-wider">{t('Health Animal')}</h1>
        </div>
        <input className={input} type="text" placeholder={t('Your name')} autoComplete="username" required
          autoCapitalize="none" autoCorrect="off" spellCheck={false}
          value={username} onChange={(e) => setUsername(e.target.value)} />
        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
        <button disabled={busy} className="w-full py-2.5 rounded-xl pixel-btn-gold font-pixel text-xs text-[#2b170c] disabled:opacity-60">
          {busy ? '…' : mode === 'login' ? t('Sign in') : t('Create account')}
        </button>
        <button type="button" className="w-full text-xs text-amber-100/70 underline py-3"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
          {mode === 'login' ? t('New here? Create an account') : t('Have an account? Sign in')}
        </button>
      </form>
    </div>
  );
}
