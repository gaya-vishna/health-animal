import { Capacitor } from '@capacitor/core';

// The Android app keeps everything on the phone ("local mode"); the website talks to the server.
// For testing local mode in a desktop browser: localStorage.setItem('ha_force_local', '1').
let forced = false;
try {
  forced = localStorage.getItem('ha_force_local') === '1';
} catch {
  /* storage blocked */
}

export const LOCAL = Capacitor.isNativePlatform() || forced;
