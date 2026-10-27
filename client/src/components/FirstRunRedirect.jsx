import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { setSlothName } from '../utils/slothName';

// Checked once per app launch (module-level, so a language switch that remounts the router
// doesn't re-run it). New accounts are sent to Settings to set their goals first.
let checked = false;

export default function FirstRunRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    if (checked) return;
    checked = true;
    api('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (s) setSlothName(s.slothName);
        if (s && s.setupDone === false && window.location.pathname !== '/settings') {
          navigate('/settings', { replace: true });
        }
      })
      .catch(() => {});
  }, []);
  return null;
}
