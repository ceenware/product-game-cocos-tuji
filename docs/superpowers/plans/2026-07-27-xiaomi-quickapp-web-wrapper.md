# Xiaomi Quick App Web Wrapper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the existing Cocos Web build and produce a standard signed Quick App RPK for `com.yongzhe.huoxiantuwei.quickapp`, then submit it to Xiaomi internal testing.

**Architecture:** GitHub Pages serves the existing Cocos Web Mobile build from `/game/`. A minimal Quick App uses the native `web` component to load that HTTPS URL and displays a retry state on load failure. Release verification checks the hosted game, the source manifest, the generated RPK manifest, package size, and Xiaomi form validation before submission.

**Tech Stack:** Cocos Web Mobile static build, GitHub Pages, Quick App UX, `hap-toolkit`, shell verification scripts, Xiaomi HyperOS developer console.

---

### Task 1: Prepare and verify the hosted Web game

**Files:**
- Create: `scripts/verify-web-game.sh`
- Create: `build/web/game/**` from the existing local Cocos build
- Modify: `.gitignore`

- [ ] **Step 1: Write the failing Web deployment check**

Create `scripts/verify-web-game.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

root="${1:-build/web/game}"
test -f "$root/index.html"
test -f "$root/src/settings.json"
test -d "$root/assets"
test -d "$root/src"
rg -q '<canvas|GameCanvas|splash' "$root/index.html"
```

- [ ] **Step 2: Run the check and verify it fails**

Run: `bash scripts/verify-web-game.sh`

Expected: non-zero exit because `build/web/game/index.html` does not exist.

- [ ] **Step 3: Copy the existing Web Mobile build**

Run:

```bash
mkdir -p build/web/game
rsync -a --delete /Users/vicky/Documents/Codex/2026-06-23/ni-s/work/product-game-cocos-tuji-main/build/overseas-web-mobile/ build/web/game/
```

Append generated local build noise to `.gitignore` without ignoring `build/web/game`:

```gitignore
quickapp/node_modules/
quickapp/build/
quickapp/dist/
quickapp/sign/
```

- [ ] **Step 4: Run the deployment check**

Run: `bash scripts/verify-web-game.sh`

Expected: exit code 0.

- [ ] **Step 5: Commit the hosted game preparation**

```bash
git add .gitignore scripts/verify-web-game.sh build/web/game
git commit -m "feat: add hosted web game build"
```

### Task 2: Create the standard Quick App wrapper

**Files:**
- Create: `quickapp/package.json`
- Create: `quickapp/quickapp.config.js`
- Create: `quickapp/src/manifest.json`
- Create: `quickapp/src/app.ux`
- Create: `quickapp/src/pages/game/index.ux`
- Create: `quickapp/src/common/logo.png`
- Create: `scripts/verify-quickapp-source.sh`

- [ ] **Step 1: Write the failing source validation**

Create `scripts/verify-quickapp-source.sh`:

```bash
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
```

- [ ] **Step 2: Run the validation and verify it fails**

Run: `bash scripts/verify-quickapp-source.sh`

Expected: non-zero exit because the Quick App project does not exist.

- [ ] **Step 3: Create package and build configuration**

Create `quickapp/package.json`:

```json
{
  "name": "yongzhe-huoxian-tuwei-quickapp",
  "version": "1.0.1",
  "private": true,
  "scripts": {
    "build": "hap build",
    "release": "hap release"
  },
  "dependencies": {
    "hap-toolkit": "2.0.9-beta.3"
  }
}
```

Create `quickapp/quickapp.config.js`:

```js
module.exports = {
  cli: {
    splitChunksMode: 'SMART'
  }
}
```

- [ ] **Step 4: Create the Quick App manifest**

Create `quickapp/src/manifest.json` with:

```json
{
  "package": "com.yongzhe.huoxiantuwei.quickapp",
  "name": "勇者火线突围",
  "versionName": "1.0.1",
  "versionCode": 2,
  "minPlatformVersion": 1100,
  "icon": "/common/logo.png",
  "features": [{"name": "system.webview"}],
  "permissions": [{"origin": "https://ceenware.github.io"}],
  "config": {
    "logLevel": "error",
    "network": {
      "connectTimeout": 15000,
      "readTimeout": 30000,
      "writeTimeout": 15000
    }
  },
  "router": {
    "entry": "pages/game",
    "pages": {
      "pages/game": {"component": "index"}
    }
  },
  "display": {
    "orientation": "portrait",
    "titleBar": false,
    "pages": {
      "pages/game": {"titleBar": false}
    }
  },
  "trustedSslDomains": ["ceenware.github.io"]
}
```

- [ ] **Step 5: Create the application and game page**

Create `quickapp/src/app.ux`:

```html
<script>
export default {
  onError(error) {
    console.error(error.message)
  }
}
</script>
```

Create `quickapp/src/pages/game/index.ux`:

```html
<template>
  <div class="page">
    <web if="{{!loadFailed}}" id="gameWeb" class="game-web" src="{{gameUrl}}" onpagefinish="onPageFinish" onerror="onWebError"></web>
    <div if="{{loadFailed}}" class="error-state">
      <text class="error-title">游戏加载失败</text>
      <text class="error-text">请检查网络连接后重试</text>
      <input class="retry-button" type="button" value="重新加载" onclick="retry" />
    </div>
  </div>
</template>

<script>
export default {
  data: {
    gameUrl: 'https://ceenware.github.io/product-game-cocos-tuji/game/',
    loadFailed: false
  },
  onPageFinish() {
    this.loadFailed = false
  },
  onWebError() {
    this.loadFailed = true
  },
  retry() {
    this.loadFailed = false
    this.gameUrl = `https://ceenware.github.io/product-game-cocos-tuji/game/?retry=${Date.now()}`
  }
}
</script>

<style>
.page { width: 100%; height: 100%; background-color: #000000; }
.game-web { width: 100%; height: 100%; }
.error-state { width: 100%; height: 100%; flex-direction: column; justify-content: center; align-items: center; background-color: #101318; }
.error-title { color: #ffffff; font-size: 36px; margin-bottom: 20px; }
.error-text { color: #c7ccd4; font-size: 26px; margin-bottom: 32px; }
.retry-button { width: 280px; height: 72px; color: #ffffff; background-color: #2878ff; border-radius: 8px; }
</style>
```

Copy the existing 512px-compatible logo:

```bash
mkdir -p quickapp/src/common
cp /Users/vicky/Documents/Codex/2026-06-23/ni-s/work/product-game-cocos-tuji-main/settings/logo.png quickapp/src/common/logo.png
```

- [ ] **Step 6: Run source validation**

Run: `bash scripts/verify-quickapp-source.sh`

Expected: exit code 0.

- [ ] **Step 7: Commit the Quick App source**

```bash
git add quickapp scripts/verify-quickapp-source.sh
git commit -m "feat: add quick app web wrapper"
```

### Task 3: Build and verify the signed RPK

**Files:**
- Create: `scripts/verify-quickapp-rpk.sh`
- Local only: `quickapp/sign/release/private.pem`
- Local only: `quickapp/sign/release/certificate.pem`

- [ ] **Step 1: Write the failing RPK validation**

Create `scripts/verify-quickapp-rpk.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

rpk="${1:-quickapp/dist/com.yongzhe.huoxiantuwei.quickapp.release.rpk}"
test -f "$rpk"
test "$(stat -f %z "$rpk")" -lt 2097152
manifest="$(unzip -p "$rpk" manifest.json)"
test "$(printf '%s' "$manifest" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).package))')" = "com.yongzhe.huoxiantuwei.quickapp"
test "$(printf '%s' "$manifest" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).versionCode))')" = "2"
```

- [ ] **Step 2: Run validation and verify it fails**

Run: `bash scripts/verify-quickapp-rpk.sh`

Expected: non-zero exit because no RPK exists.

- [ ] **Step 3: Install dependencies and prepare release signing**

```bash
cd quickapp
npm install
mkdir -p sign/release
cp /Users/vicky/Documents/Codex/2026-06-23/ni-s/work/product-game-cocos-tuji-main/build-templates/xiaomi-quick-game/sign/release/private.pem sign/release/private.pem
cp /Users/vicky/Documents/Codex/2026-06-23/ni-s/work/product-game-cocos-tuji-main/build-templates/xiaomi-quick-game/sign/release/certificate.pem sign/release/certificate.pem
```

- [ ] **Step 4: Build the release package**

Run: `npm run release`

Expected: a signed `.release.rpk` in `quickapp/dist/`.

- [ ] **Step 5: Run RPK validation**

Run: `bash scripts/verify-quickapp-rpk.sh quickapp/dist/com.yongzhe.huoxiantuwei.quickapp.release.rpk`

Expected: exit code 0 and package size below 2 MB.

- [ ] **Step 6: Commit the RPK verification script**

```bash
git add scripts/verify-quickapp-rpk.sh quickapp/package-lock.json
git commit -m "test: verify quick app release package"
```

### Task 4: Deploy and verify GitHub Pages

**Files:**
- Push existing commits to `origin/main`

- [ ] **Step 1: Verify repository state before push**

Run: `git status --short && git log --oneline -4`

Expected: clean worktree and the design, Web game, Quick App source, and verification commits present.

- [ ] **Step 2: Push deployment**

Run: `git push origin main`

Expected: push succeeds using the configured GitHub credentials.

- [ ] **Step 3: Verify GitHub Pages**

Run:

```bash
curl -fIL https://ceenware.github.io/product-game-cocos-tuji/game/
curl -fsSL https://ceenware.github.io/product-game-cocos-tuji/game/ | rg -q '<canvas|GameCanvas|splash'
curl -fIL https://ceenware.github.io/product-game-cocos-tuji/privacy/
```

Expected: HTTP 200 for game and privacy pages; game HTML contains its startup marker.

### Task 5: Submit Xiaomi internal testing

**Files:**
- Upload: verified release RPK from Task 3
- Upload: `/Users/vicky/Documents/勇者火线突围/游戏出版审批申请材料/A03_软件著作权认证证书.jpg`

- [ ] **Step 1: Upload and verify package parsing**

Upload the verified RPK to the Xiaomi Quick App release page. Confirm the parsed values are:

```text
应用名称: 勇者火线突围
应用包名: com.yongzhe.huoxiantuwei.quickapp
版本名称: 1.0.1
版本号: 2
RPK类型: 应用
```

- [ ] **Step 2: Fill release information**

Use these values:

```text
兼容设备: 手机
联网类型: 应用需有网络才可正常游玩
应用分类: 游戏 / 动作射击
年龄分级: 12+
关键词: 勇者 火线 突围 射击 闯关
跳转页面: /pages/game
是否涉及用户隐私数据: 涉及
隐私协议链接: https://ceenware.github.io/product-game-cocos-tuji/privacy/
一句话简介: 指挥勇者小队火线突围
应用介绍: 《勇者火线突围》是一款卡通风格动作射击闯关游戏。玩家带领勇者小队在道路关卡中前进，通过提升队伍人数、金币加成和火力技能应对敌袭，清理火线并完成突围挑战。游戏包含关卡推进、技能选择、队伍成长和火力战斗等内容。
更新日志: 首次提交快应用版本，包含核心闯关玩法、基础关卡、队伍成长、技能选择、火力战斗和移动端适配。
辅助发布信息: 游戏无需账号，可直接进入体验。快应用通过 HTTPS Web 页面加载游戏内容，需要保持网络连接。测试路径：启动应用后进入首页，等待资源加载完成，体验首关移动、技能选择和战斗流程。
```

- [ ] **Step 3: Upload software copyright certificate**

Upload the certificate image and confirm the page displays the uploaded state. Leave special qualifications empty unless Xiaomi marks them required.

- [ ] **Step 4: Validate the entire form**

Click `提交内测` once. If validation errors appear, do not confirm any submission dialog; correct every visible required-field error and re-check the parsed package details.

- [ ] **Step 5: Submit internal testing**

After the page has no validation errors, click `提交内测` and accept the final submission confirmation. Confirm a success toast, status change, or navigation to the version/test page.

- [ ] **Step 6: Record final evidence**

Record the final URL, displayed status, submitted version, and any test QR code or device-binding requirement shown by Xiaomi.
