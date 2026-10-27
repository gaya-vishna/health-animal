# Health Animal – Android app

The Android app is **fully on the phone**: no login, no server needed for everyday use.
The screens are the normal web app (`client/`), bundled into the APK. In the app, `client/src/local/`
answers every `/api/...` request from on-phone storage (Capacitor Preferences) instead of a server.

Only **AI calorie estimates** (and "Surprise dish") need the internet. There are three ways to get them:

1. **Your own Gemini key** – paste it in the app under Settings. No server at all; food text and photos go
   straight from the phone to Google Gemini.
2. **Your own server** – build the APK with `VITE_AI_SERVERS` and `VITE_APP_KEY` (see below). The app asks
   your server, which asks Gemini.
3. **Neither** – the built-in offline estimator, so logging always works.

History lives only on the phone → **Settings → Data on this phone → Backup to file** (share it to Drive /
WhatsApp). Restore from file on a new phone.

Reminders: `@capacitor/local-notifications`, scheduled on the phone (`client/src/utils/reminders.js`).

## Build the APK

Any change to the app's screens needs a new APK (nothing loads from a server).

Requirements: Node 20+, a JDK 17+ and the Android SDK (installing Android Studio covers both).
Point `JAVA_HOME` and `ANDROID_HOME` at them (paths differ per OS).

Optional server settings go in an untracked `client/.env.local` (see `client/.env.example`), or pass them as
environment variables at build time:

```bash
VITE_AI_SERVERS="http://<your-server>:8090"   # comma-separated list is fine
VITE_APP_KEY="<APP_KEY from your server's .env>"
```

Skip both if you use your own Gemini key or offline estimates.

```bash
# 1. app screens
cd client
npm install
npx vite build

# 2. the Android app
cd ../mobile
npm install
npx cap sync android
cd android && ./gradlew assembleDebug    # gradlew.bat on Windows
# -> app/build/outputs/apk/debug/app-debug.apk
```

## Notes

- **Never publish an APK built with your `VITE_APP_KEY` or server address**: they are embedded in it. Share the
  source and let people build their own.
- Debug builds are signed with your machine's Android **debug key** (`~/.android/debug.keystore`). Updates must
  use the same key – a different key means uninstalling, which **deletes the history on the phone** (back up first).
- Uninstalling the app also deletes its data. Updating (installing a newer APK over it) keeps it.
- To test the phone mode in a desktop browser: `localStorage.setItem('ha_force_local', '1')`.
