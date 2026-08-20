#!/usr/bin/env bash
set -euo pipefail

root="${1:-build/web/game}"
web_root="$(dirname "$root")"

test -f "$root/index.html"
test -n "$(find "$root/src" -maxdepth 1 -name 'settings*.json' -print -quit 2>/dev/null)"
test -d "$root/assets"
test -d "$root/src"
rg -q '<canvas|GameCanvas|splash' "$root/index.html"

for privacy_page in "$web_root/index.html" "$web_root/privacy/index.html"; do
  test -f "$privacy_page"
  rg -q 'com\.yongzhe\.huoxiantuwei\.mini' "$privacy_page"
  rg -q 'com\.yongzhe\.huoxiantuwei\.quickapp' "$privacy_page"
done
