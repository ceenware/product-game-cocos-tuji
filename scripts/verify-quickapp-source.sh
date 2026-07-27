#!/usr/bin/env bash
set -euo pipefail

manifest=quickapp/src/manifest.json
page=quickapp/src/pages/game/index.ux

test "$(node -p "require('./$manifest').package")" = "com.yongzhe.huoxiantuwei.quickapp"
test "$(node -p "require('./$manifest').versionName")" = "1.0.1"
test "$(node -p "require('./$manifest').versionCode")" = "2"
rg -q 'system.webview' "$manifest"
rg -q 'ceenware.github.io' "$manifest"
rg -q 'https://ceenware.github.io/product-game-cocos-tuji/game/' "$page"
rg -q 'onerror="onWebError"' "$page"
