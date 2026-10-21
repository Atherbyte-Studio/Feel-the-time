# Stop The Timer — Android build (branch `android-app`)

The web game in the repo root is **unchanged** and still works on GitHub Pages. This branch only *adds*:

- `android-kit/` – Capacitor 8 wrapper (config, icons, splash, Android-only tweaks, build scripts)
- `.github/workflows/android.yml` – cloud build (no Android Studio needed)
- `.github/workflows/create-upload-key.yml` – one-time helper to create your Play signing key

App id: `io.github.waseem391.stopthetimer` (**permanent once published on Google Play** – change it in
`android-kit/capacitor.config.json` and `.github/workflows/android.yml` *before* the first upload if you want another).
Target SDK: **36** (Google Play requirement for new apps/updates since 2026-08-31). The workflow fails if the APK does not target 36.

## 1. Build the APK (no setup)
1. Every push to `android-app` builds automatically. Or: **Actions → Android build → Run workflow** (branch `android-app`).
2. Open the finished run (green ✔). Scroll to **Artifacts**.
3. Download **stop-the-timer-debug-apk** (a zip containing `stop-the-timer-debug.apk`).
4. Red ✖? Open the failed step, copy the first error line and send it to Claude.

## 2. Install on your phone
1. Send the unzipped `stop-the-timer-debug.apk` to the phone (Drive, email, USB).
2. Open it. Android asks to allow "Install unknown apps" for that app – allow once.
3. Install and open **Stop The Timer**. (Debug APKs are for testing only; Play needs the AAB below.)

## 3. Signed release bundle (.aab) for Google Play
Without signing secrets the build still produces `stop-the-timer-release-UNSIGNED.aab` (cannot be uploaded to Play).
To get `...-SIGNED.aab` (do this once; you never paste secrets in chat):

1. **Recommended:** make the repository private first (Settings → General → Danger zone → Change visibility). Artifacts of public repos can be downloaded by any GitHub user, and the keystore file is an artifact.
2. **Settings → Secrets and variables → Actions → New repository secret**: name `ANDROID_KEYSTORE_PASSWORD`, value = a long random password (**at least 16 characters**, save it in a password manager).
3. **Actions → Create upload keystore (one-time) → Run workflow** (if the repo is public you must type `YES` and accept the risk).
4. Open the run → Artifacts → download **upload-keystore-KEEP-PRIVATE** (deleted automatically after 1 day). Keep `upload-keystore.jks` in a safe backup (losing it is painful).
5. Open `upload-keystore.jks.base64.txt`, copy its whole content, and add it as secret `ANDROID_KEYSTORE_BASE64`.
6. Optional secret `ANDROID_KEY_ALIAS` (default `upload`).
7. Delete the artifact from the run page. Re-run **Android build** → artifact **stop-the-timer-release** now has `stop-the-timer-release-SIGNED.aab` and `...-SIGNED.apk`.

Never commit `.jks` / `.keystore` files or passwords (they are in `.gitignore`).

## 4. Publish (you do this, Claude never will)
Google Play Console → create app → Production/Internal testing → upload the **SIGNED .aab**. Enroll in **Play App Signing** (default). Fill the store listing, content rating, data safety (the game collects no data and uses no network), and privacy policy if requested.

## What the Android build does
- Copies the web files to `android-kit/www` (offline, all assets bundled), injects `android.css` (system-bar insets, no text selection) and `android-shim.js` (back button: results→menu, menu→exit, ignored mid-round; leaving the app mid-round cancels that round).
- Portrait lock, Capacitor splash + generated icons (rabbit), edge-to-edge handled for API 36.
- `versionCode` = workflow run number, `versionName` = `1.0.<run number>`.
- Steps: web checks → unit tests → debug APK + release APK + release AAB → verification (package id, versionCode, target SDK 36, game files inside APK) → optional signing → upload.

## Local checks you can skip
Nothing needs installing locally. Developers can run `cd android-kit && npm install && npm run prepare:android`-style steps themselves, but the cloud build is the supported path.
