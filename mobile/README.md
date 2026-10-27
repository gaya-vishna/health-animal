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
Set `JAVA_HOME` (Android Studio ships a JDK in its `jbr` folder) and `ANDROID_HOME` (the SDK folder). Gradle
installs missing SDK packages itself if you accepted the licences (`sdkmanager --licenses`).

### 1. Choose your AI option (before building)

The app has three ways to get AI calorie estimates:

1. **Own Gemini key**: leave everything below empty and paste your key in the app under Settings. Free key:
   <https://aistudio.google.com/apikey>.
2. **Own server**: put these in an untracked `client/.env.local` (see `client/.env.example`) or export them
   before building. `VITE_APP_KEY` must equal `APP_KEY` in your server's `.env` (24+ characters):
   ```
   VITE_AI_SERVERS=http://<your-server>:8090
   VITE_APP_KEY=<APP_KEY from your server's .env>
   ```
3. **Offline**: leave both empty and set no key. The built-in estimator is used.

**Never share an APK built with your `APP_KEY` or server address.** Both are embedded in it.

### 2. Build

The same commands work on Windows (Git Bash or PowerShell), macOS and Linux, except the Gradle wrapper name.

```bash
# app screens
cd client
npm install
npx vite build

# the Android app
cd ../mobile
npm install
npx cap sync android
cd android
./gradlew assembleDebug        # macOS / Linux (run `chmod +x gradlew` once if needed)
gradlew.bat assembleDebug      # Windows (cmd / PowerShell: .gradlew.bat assembleDebug)
```

`npm run apk` in `mobile/` does the sync and the build in one go, but it calls `gradlew.bat`, so it is
Windows-only. On macOS/Linux use the commands above.

Verified: this sequence builds from a fresh clone with no `.env.local`, producing an offline / own-key APK.

### 3. Install

The APK is at `mobile/android/app/build/outputs/apk/debug/app-debug.apk`.

- Send it to the phone (cable, Drive, messaging) and open it; allow "install unknown apps" when asked, or
- `adb install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk` with USB debugging on
  (`-r` replaces an existing install and keeps its data).

## Notes

- **Debug signing key**: debug builds are signed with your machine's Android debug key
  (`~/.android/debug.keystore`, created on first build). Keep a copy. Updates must be signed with the same
  key: a different key (another computer, a wiped profile) means uninstalling first, which **deletes the
  history on the phone** (back up first). The APK and `*.keystore` files are git-ignored; never commit them.
- Uninstalling the app also deletes its data. Updating (installing a newer APK over it) keeps it.
- To test the phone mode in a desktop browser: `localStorage.setItem('ha_force_local', '1')`.
