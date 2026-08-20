#!/usr/bin/env bash
set -euo pipefail

rpk="${1:-quickapp/dist/com.yongzhe.huoxiantuwei.quickapp.release.1.0.1.rpk}"
test -f "$rpk"
test "$(stat -f %z "$rpk")" -lt 2097152

manifest="$(unzip -p "$rpk" manifest.json)"
package_name="$(printf '%s' "$manifest" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).package))')"
version_code="$(printf '%s' "$manifest" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).versionCode))')"

test "$package_name" = "com.yongzhe.huoxiantuwei.quickapp"
test "$version_code" = "2"
