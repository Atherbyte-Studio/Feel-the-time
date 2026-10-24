#!/usr/bin/env bash
# Copies the unmodified web game from the repo root into android-kit/www and injects the Android-only extras.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf www && mkdir www
tar -C .. --exclude='./.git' --exclude='./.github' --exclude='./android-kit' --exclude='./node_modules' --exclude='*.md' --exclude='./.gitignore' -cf - . | tar -C www -xf -
cp www-extra/android.css www-extra/android-shim.js www/
python3 - <<'PY'
import re, os, sys
p = 'www/index.html'; h = open(p, encoding='utf-8').read()
assert '</head>' in h and '</body>' in h, 'index.html has no </head> or </body>'
h = h.replace('</head>', '<link rel="stylesheet" href="android.css">\n</head>', 1)
h = h.replace('</body>', '<script src="android-shim.js"></script>\n</body>', 1)
open(p, 'w', encoding='utf-8').write(h)
missing = [u for u in re.findall(r'(?:src|href)="([^"#?]+)', h) if not u.startswith(('http', 'data:')) and not os.path.exists('www/' + u)]
if missing: sys.exit('Referenced files missing from www: %s' % missing)
print('www ready:', sorted(os.listdir('www')))
PY
for f in www/*.js; do node --check "$f"; done && echo "JS syntax OK"
