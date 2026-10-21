#!/usr/bin/env bash
# Generates the native Android project (Capacitor), icons/splash, and applies project settings.
set -euo pipefail
cd "$(dirname "$0")/.."
npm install --no-audit --no-fund
bash scripts/build-www.sh
[ -d android ] || npx cap add android
npx cap sync android
npx capacitor-assets generate --android
python3 - <<'PY'
import re, sys
def edit(path, fn):
    s = open(path, encoding='utf-8').read(); n = fn(s)
    if n == s: sys.exit('PATCH FAILED (no change): ' + path)
    open(path, 'w', encoding='utf-8').write(n)
m = 'android/app/src/main/AndroidManifest.xml'
if 'screenOrientation' not in open(m, encoding='utf-8').read():
    edit(m, lambda s: re.sub(r'<activity\b', '<activity android:screenOrientation="portrait"', s, count=1))
def ver(s):
    s = re.sub(r'versionCode\s*=?\s*\d+', 'versionCode = Integer.parseInt(System.getenv("VERSION_CODE") ?: "1")', s, count=1)
    return re.sub(r'versionName\s*=?\s*"[^"]*"', 'versionName = System.getenv("VERSION_NAME") ?: "1.0"', s, count=1)
edit('android/app/build.gradle', ver)
v = open('android/variables.gradle', encoding='utf-8').read()
if not re.search(r'targetSdkVersion\s*=\s*36', v): sys.exit('targetSdkVersion is not 36 in variables.gradle:\n' + v)
print('Android project patched; target SDK 36 confirmed')
PY
