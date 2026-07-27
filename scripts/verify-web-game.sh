#!/usr/bin/env bash
set -euo pipefail

root="${1:-build/web/game}"
test -f "$root/index.html"
test -n "$(find "$root/src" -maxdepth 1 -name 'settings*.json' -print -quit 2>/dev/null)"
test -d "$root/assets"
test -d "$root/src"
rg -q '<canvas|GameCanvas|splash' "$root/index.html"
