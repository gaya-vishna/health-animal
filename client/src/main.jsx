import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/press-start-2p/400.css';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/600.css';
import '@fontsource/heebo/400.css';
import '@fontsource/heebo/600.css';
import '@fontsource/heebo/700.css';
import './index.css';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import App from './App.jsx';
import { applyLang } from './utils/i18n';
import { LOCAL } from './local/mode';
import { initStore } from './local/store';

applyLang(); // set <html lang/dir> before first paint

const start = () =>
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );

// The Android app keeps its data on the phone: load it before showing anything.
(LOCAL ? initStore().catch((err) => console.error('Could not load saved data', err)) : Promise.resolve()).then(start);
