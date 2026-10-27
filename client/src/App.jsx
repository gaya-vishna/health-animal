import React, { useEffect, useState, useCallback } from 'react';
import { LogOut } from 'lucide-react';
import { BrowserRouter, Routes, Route, NavLink, Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import DashboardView from './views/DashboardView';
import RescueView from './views/RescueView';
import SettingsView from './views/SettingsView';
import HistoryView from './views/HistoryView';
import AuthView from './views/AuthView';
import { api, getToken, clearToken } from './utils/api';
import { t, getLang, setLang } from './utils/i18n';
import { unlockAudio } from './utils/audioHaptics';
import { initNativeApp, refreshReminders } from './utils/reminders';
import { LOCAL } from './local/mode';
import FirstRunRedirect from './components/FirstRunRedirect';

const LOCAL_USER = { id: 'local', username: 'local' }; // the phone app has no accounts

const NAV_ITEMS = [
  { to: '/dashboard', emoji: '🏡', label: 'GLADE', id: 'nav-dashboard' },
  { to: '/dashboard?feed=1', emoji: '🍽️', label: 'FEED', id: 'nav-feed', feed: true },
  { to: '/rescue', emoji: '🎮', label: 'RESCUE', id: 'nav-rescue' },
  { to: '/history', emoji: '📖', label: 'JOURNAL', id: 'nav-history' },
];

export default function App() {
  const [user, setUser] = useState(LOCAL ? LOCAL_USER : null);
  const [lang, setLangState] = useState(getLang());
  const toggleLang = () => {
    const next = lang === 'he' ? 'en' : 'he';
    setLang(next);
    setLangState(next);
  };
  const [checking, setChecking] = useState(!LOCAL && !!getToken());
  const [unreachable, setUnreachable] = useState(false);

  // Restore the session if a token is stored. A bad token goes to the login screen; an
  // unreachable server shows a clear message with a retry (never a blank screen).
  const checkSession = useCallback(() => {
    if (LOCAL) return;
    if (!getToken()) { setChecking(false); return; }
    setChecking(true);
    setUnreachable(false);
    api('/api/auth/me', { timeoutMs: 8000 })
      .then(async (r) => {
        if (r.ok) setUser((await r.json()).user);
        else if (r.status === 401) clearToken();
        else setUnreachable(true);
      })
      .catch(() => setUnreachable(true))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    checkSession();
    const onLogout = () => setUser(null);
    window.addEventListener('ha-logout', onLogout);
    return () => window.removeEventListener('ha-logout', onLogout);
  }, [checkSession]);

  // Android app: notification taps, back button; plan reminders once signed in
  useEffect(() => {
    initNativeApp();
  }, []);
  useEffect(() => {
    if (user) refreshReminders();
  }, [user]);

  // Unlock Web Audio API on first interaction
  useEffect(() => {
    const unlock = () => { unlockAudio(); window.removeEventListener('touchstart', unlock); };
    window.addEventListener('touchstart', unlock, { passive: true });
    return () => window.removeEventListener('touchstart', unlock);
  }, []);

  if (checking) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 bg-[#0b1912] text-amber-200">
        <div className="text-4xl animate-pulse">🦥</div>
        <div className="font-pixel text-[10px]">{t('Connecting…')}</div>
      </div>
    );
  }
  if (unreachable && !user) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 px-8 text-center bg-[#0b1912] text-[#f5f6fa]">
        <div className="text-5xl">📡</div>
        <h1 className="font-pixel text-xs text-amber-200">{t("Can't reach the server")}</h1>
        <p className="text-xs opacity-70 max-w-xs">{t('Check your Wi-Fi or network connection, then try again.')}</p>
        <button onClick={checkSession} className="px-6 py-3 rounded-xl pixel-btn-gold font-pixel text-xs text-[#2b170c]">
          {t('TRY AGAIN')}
        </button>
        <button onClick={() => { clearToken(); setUnreachable(false); }} className="text-xs text-amber-100/70 underline py-2">
          {t('Sign in again')}
        </button>
      </div>
    );
  }
  if (!user) return <AuthView key={lang} onAuthed={setUser} onToggleLang={toggleLang} />;

  return (
    <BrowserRouter key={lang}>
      <FirstRunRedirect />
      <div className="flex flex-col h-full bg-[#0b1912] select-none text-[#f5f6fa]">
        {/* Top Retro Header */}
        <header className="safe-top shrink-0 px-4 pt-2.5 pb-2 flex items-center justify-between border-b-2 border-[#162f22] bg-[#0d2117]/95">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl">🍃</span>
            <span className="font-pixel text-xs text-amber-200 tracking-wider truncate">{t('Health Animal')}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
          <NavLink
            to="/settings"
            aria-label={t('Settings')}
            title={t('Settings')}
            className={({ isActive }) =>
              `tap-area shrink-0 w-9 h-9 flex items-center justify-center rounded-full border text-base transition-colors ${
                isActive ? 'border-amber-400 bg-[#2e1b0e]' : 'border-[#235037] bg-[#132c1e]'
              }`
            }
          >
            ⚙️
          </NavLink>
          <button
            onClick={toggleLang}
            aria-label={t('Language')}
            className="tap-area shrink-0 w-9 h-9 flex items-center justify-center text-[11px] font-bold text-amber-200 rounded-full border border-[#235037] bg-[#132c1e]"
            style={{ fontFamily: "'Heebo', system-ui, sans-serif" }}
          >
            {lang === 'he' ? 'EN' : 'עב'}
          </button>
          {!LOCAL && <button
            onClick={() => { clearToken(); setUser(null); }}
            aria-label={t('SIGN OUT')}
            className="tap-area shrink-0 w-9 h-9 flex items-center justify-center rounded-full border border-[#235037] bg-[#132c1e] text-amber-100/70"
            title={`${t('SIGN OUT')} (${user.username || user.email})`}
          >
            <LogOut className="w-4 h-4" />
          </button>}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-hidden flex flex-col">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardView />} />
            <Route path="/rescue" element={<RescueView />} />
            <Route path="/history" element={<HistoryView />} />
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </main>

        {/* Bottom Arcade Action Navigation (Matching Reference Image) */}
        <nav className="shrink-0 bg-[#170d07] border-t-2 border-[#3a2212] safe-bottom">
          <div className="max-w-sm mx-auto flex items-stretch gap-1 px-2 py-1.5">
            {NAV_ITEMS.map(({ to, emoji, label, id, feed }) => feed ? (
              /* FEED looks like the other inactive tabs: only the current page is ever highlighted */
              <Link
                key={to}
                to={to}
                id={id}
                aria-label={t('Feed me: log a meal')}
                className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl text-amber-100/70 hover:text-amber-100 transition-colors"
              >
                <span className="text-xl leading-none grayscale opacity-70">{emoji}</span>
                <span className="font-pixel text-[9px] tracking-wide">{t(label)}</span>
              </Link>
            ) : (
              /* Tabs: only the current page is bright, with a bar on top */
              <NavLink
                key={to}
                to={to}
                id={id}
                className={({ isActive }) =>
                  `flex-1 relative flex flex-col items-center gap-0.5 py-2 rounded-xl transition-colors ${
                    isActive ? 'bg-[#2e1b0e] text-amber-300' : 'text-amber-100/70 hover:text-amber-100'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute top-0 inset-x-4 h-[3px] rounded-full bg-amber-400" />}
                    <span className={`text-xl leading-none ${isActive ? '' : 'grayscale opacity-70'}`}>{emoji}</span>
                    <span className={`font-pixel text-[9px] tracking-wide ${isActive ? 'font-bold' : ''}`}>{t(label)}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </BrowserRouter>
  );
}
