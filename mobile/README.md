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
WhatsApp). Restore from file on a new phone. Android's own cloud backup and device transfer are **off** for this
app, so this file is your only backup. The Gemini key is not included in it.

Reminders: `@capacitor/local-notifications`, scheduled on the phone (`client/src/utils/reminders.js`).

## Build the APK

Any change to the app's screens needs a new APK (nothing loads from a server).

Requirements: Node 20+, a JDK 17+ and the Android SDK (installing Android Studio covers both).
Set `JAVA_HOME` (Android Studio ships a JDK in its `jbr` folder) and `ANDROID_HOME` (the SDK folder). Gradle
installs missing SDK packages itself if you accepted the licences.

Windows (PowerShell), with Android Studio in its default place. Adjust the paths if yours differ, then **open a
new terminal** (`setx` only affects terminals opened afterwards):

```powershell
setx JAVA_HOME "C:\Program Files\Android\Android Studio\jbr"
setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
& "$env:LOCALAPPDATA\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat" --licenses   # answer y to each
```

(If `cmdline-tools` is missing, install "Android SDK Command-line Tools" in Android Studio's SDK Manager.)

macOS / Linux: export `JAVA_HOME` and `ANDROID_HOME` in your shell profile, then run `sdkmanager --licenses`.

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

The app only allows unencrypted `http://` traffic to `localhost`, `127.0.0.1`, `10.0.2.2` (the emulator host) and the
`http://` hosts in `VITE_AI_SERVERS`. The build script (`mobile/tools/gen-nsc.mjs`, run by `npm run sync` and
`npm run apk`) reads `client/.env.local` and writes that list into the Android network security config. After
changing `VITE_AI_SERVERS`, rebuild the APK.

### 2. Build

Run everything **from the repository root**. The commands are the same on Windows (Git Bash or PowerShell),
macOS and Linux, except the last step.

```bash
# 1. app screens
cd client
npm install
npx vite build

# 2. sync into the Android project (also regenerates the network security config)
cd ../mobile
npm install
npm run sync
```

Then build:

```bash
# macOS / Linux (run `chmod +x gradlew` once if needed)
cd android
./gradlew assembleDebug
```

```powershell
# Windows (cmd or PowerShell)
cd android
.\gradlew.bat assembleDebug
```

`npm run apk` in `mobile/` does the sync and the build in one go, but it calls `gradlew.bat`, so it is
Windows-only. On macOS/Linux use the commands above. The first build downloads Gradle and SDK pieces and can take
several minutes.

Verified: this sequence builds from a fresh clone with no `.env.local`, producing an offline / own-key APK.

### 3. Install

The APK is at `mobile/android/app/build/outputs/apk/debug/app-debug.apk`.

- Send it to the phone (cable, Drive, messaging) and open it; allow "install unknown apps" when asked. Google Play
  Protect may warn that the app is from an unknown developer (it is a debug-signed build you made yourself); choose
  "Install anyway" / "More details", or
- `adb install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk` with USB debugging on
  (`-r` replaces an existing install and keeps its data).

## Notes

- **Debug-signed**: this is a debug build, signed with your own debug key. It is not a release build and is not
  meant for the Play Store.
- **Debug signing key**: debug builds are signed with your machine's Android debug key
  (`~/.android/debug.keystore`, created on first build). Keep a copy. Updates must be signed with the same
  key: a different key (another computer, a wiped profile) means uninstalling first, which **deletes the
  history on the phone** (back up first). The APK and `*.keystore` files are git-ignored; never commit them.
- Uninstalling the app also deletes its data. Updating (installing a newer APK over it) keeps it.
- To test the phone mode in a desktop browser: `localStorage.setItem('ha_force_local', '1')`.
