import React from 'react';
import { t } from '../utils/i18n';

// If anything crashes while drawing, show this instead of a blank screen.
export default class ErrorBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(err) {
    console.error('App crashed:', err);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 px-8 text-center bg-[#0b1912] text-[#f5f6fa]">
        <div className="text-5xl">😵</div>
        <h1 className="font-pixel text-xs text-amber-200">{t('Something went wrong')}</h1>
        <p className="text-xs opacity-70 max-w-xs">{t('The app hit a problem. Reloading usually fixes it.')}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 rounded-xl pixel-btn-gold font-pixel text-xs text-[#2b170c]"
        >
          {t('RELOAD')}
        </button>
      </div>
    );
  }
}
