# Xiaomi Runtime And Split Package Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Xiaomi mini game show privacy consent on first launch, start level 1 from the home screen, and produce an uploadable split RPKS with a main package no larger than 4 MiB and total size no larger than 30 MiB.

**Architecture:** Keep the current shared Cocos startup and UI architecture. Gate the existing home/ad startup sequence in `Init.ts` behind the stored privacy-consent flag, and bind the existing `panel/startBtn` directly in `HomeUI.ts`. Build the Cocos project as a WeChat mini-game structure, convert it with the existing `quickgame-cli` Xiaomi workflow, and retain the already proven Cocos bundle-to-`usr_*` subpackage mapping.

**Tech Stack:** Cocos Creator 3.6.2, TypeScript, Node.js, `quickgame-cli` 0.2.5, ZIP/RPK/RPKS verification tools.

---

### Task 1: Add Xiaomi Review Regression Checks

**Files:**
- Create: `scripts/test-xiaomi-review-fixes.js`
- Test: `assets/Init/InitScripts/Init.ts`
- Test: `assets/UI/HomeUI/HomeUI.ts`
- Test: `assets/UI/HomeUI/HomeUI.prefab`

- [ ] **Step 1: Write the failing source-level regression test**

```javascript
#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const initSource = fs.readFileSync(path.join(repoRoot, 'assets/Init/InitScripts/Init.ts'), 'utf8');
const homeSource = fs.readFileSync(path.join(repoRoot, 'assets/UI/HomeUI/HomeUI.ts'), 'utf8');
const homePrefab = fs.readFileSync(path.join(repoRoot, 'assets/UI/HomeUI/HomeUI.prefab'), 'utf8');

assert(
  /StorageSystem\.getData\(\)\.userSetting\.showPrivacy/.test(initSource),
  'Init must gate first launch with the stored privacy flag',
);
assert(
  /EventManager\.once\(EventTypes\.UIEvents\.PrivacyConfirm,\s*this\.showMainUI,\s*this\)/.test(initSource),
  'Init must continue only after PrivacyConfirm',
);
assert(
  /UISystem\.showUI\(UIEnum\.PrivacyUI,\s*\{\s*isLobby:\s*false\s*\}\)/.test(initSource),
  'Init must actively show the first-launch privacy UI',
);
assert(
  /private\s+showMainUI\(\)/.test(initSource),
  'The existing home/ad startup sequence must be isolated behind a one-time method',
);
assert(
  /getChildByName\(['"]startBtn['"]\)/.test(homeSource),
  'HomeUI must resolve the visible start button',
);
assert(
  /Node\.EventType\.TOUCH_END,\s*this\.onGameStartClick,\s*this/.test(homeSource),
  'HomeUI must bind startBtn directly to onGameStartClick',
);
assert(
  /\.off\(Node\.EventType\.TOUCH_END,\s*this\.onGameStartClick,\s*this\)/.test(homeSource),
  'HomeUI must remove the start button listener when hidden',
);
assert(homePrefab.includes('"_name": "startBtn"'), 'HomeUI prefab must contain panel/startBtn');

console.log('Xiaomi review regression checks passed.');
```

- [ ] **Step 2: Run the test and verify it fails before implementation**

Run: `node scripts/test-xiaomi-review-fixes.js`

Expected: non-zero exit with `Init must gate first launch with the stored privacy flag`.

- [ ] **Step 3: Commit the failing test**

```bash
git add scripts/test-xiaomi-review-fixes.js
git commit -m "test: cover Xiaomi review startup requirements"
```

### Task 2: Gate Startup Behind Privacy Consent

**Files:**
- Modify: `assets/Init/InitScripts/Init.ts`
- Test: `scripts/test-xiaomi-review-fixes.js`

- [ ] **Step 1: Replace the direct home startup in `enterGame()`**

```typescript
    protected enterGame() {
        EventManager.emit(EventTypes.GameEvents.InitLoadFinished);
        clog.log('#进入游戏');

        if (StorageSystem.getData().userSetting.showPrivacy) {
            EventManager.once(EventTypes.UIEvents.PrivacyConfirm, this.showMainUI, this);
            UISystem.showUI(UIEnum.PrivacyUI, { isLobby: false });
            return;
        }

        this.showMainUI();
    }
```

- [ ] **Step 2: Move the existing delayed home/ad startup into a one-time method**

```typescript
    private isMainUIShown = false;

    private showMainUI() {
        if (this.isMainUIShown) return;
        this.isMainUIShown = true;

        const timeout: number = setTimeout(() => {
            clearTimeout(timeout);
            UISystem.showUI(UIEnum.CustomAdUI);
            UISystem.showUI(UIEnum.HomeUI);

            setTimeout(() => {
                this.preLoadBound();
            }, 100);
        }, 100);
    }
```

- [ ] **Step 3: Run the regression test**

Run: `node scripts/test-xiaomi-review-fixes.js`

Expected: the privacy assertions pass; the command may still fail on the unimplemented HomeUI assertions.

- [ ] **Step 4: Commit the privacy fix**

```bash
git add assets/Init/InitScripts/Init.ts
git commit -m "fix: require privacy consent before Xiaomi startup"
```

### Task 3: Bind The Home Start Button Directly

**Files:**
- Modify: `assets/UI/HomeUI/HomeUI.ts`
- Test: `scripts/test-xiaomi-review-fixes.js`

- [ ] **Step 1: Resolve and register `panel/startBtn` in `onEvents()`**

```typescript
    private get startBtn(): Node {
        return this.panel ? this.panel.getChildByName('startBtn') : null;
    }

    protected onEvents() {
        this.on(EventTypes.TouchEvents.TouchStart, this.onGameStartClick, this);
        this.on(EventTypes.GameEvents.EnterChooseLv, this.onEnterChooseLv, this);
        this.on(EventTypes.UIEvents.PrivacyConfirm, this.onPrivacyConfirm, this);
        this.startBtn?.on(Node.EventType.TOUCH_END, this.onGameStartClick, this);
    }
```

- [ ] **Step 2: Remove the node listener when HomeUI hides or is destroyed**

```typescript
    public offEvents() {
        this.startBtn?.off(Node.EventType.TOUCH_END, this.onGameStartClick, this);
        super.offEvents();
    }
```

- [ ] **Step 3: Run the complete regression test**

Run: `node scripts/test-xiaomi-review-fixes.js`

Expected: `Xiaomi review regression checks passed.`

- [ ] **Step 4: Transpile the changed files with the Cocos-bundled TypeScript compiler API**

Run:

```bash
node -e "const fs=require('fs');const ts=require('/Applications/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');for(const f of ['assets/Init/InitScripts/Init.ts','assets/UI/HomeUI/HomeUI.ts']){const r=ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2018,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}});if(r.diagnostics&&r.diagnostics.length)throw new Error(r.diagnostics.map(d=>d.messageText).join('\\n'));console.log('transpiled',f)}"
```

Expected: both paths print with no exception. Full `tsc --noEmit` is not the acceptance command because the repository already has unrelated engine declaration and `BtnsLayer.ts` errors.

- [ ] **Step 5: Commit the start-button fix**

```bash
git add assets/UI/HomeUI/HomeUI.ts
git commit -m "fix: start level from the visible home button"
```

### Task 4: Build The Updated Cocos WeChat Structure

**Files:**
- Generated: `/Users/vicky/Documents/勇者火线突围/tmp/xiaomi_review_fixed/cocos-wechatgame/`
- Source: `assets/Init/InitScripts/Init.ts`
- Source: `assets/UI/HomeUI/HomeUI.ts`

- [ ] **Step 1: Remove only the dedicated generated build directory**

Run: `rm -rf /Users/vicky/Documents/勇者火线突围/tmp/xiaomi_review_fixed/cocos-wechatgame`

Expected: existing source and other platform builds remain untouched.

- [ ] **Step 2: Build with the installed Cocos Creator 3.6.2 CLI**

Run:

```bash
/Applications/CocosCreator.app/Contents/MacOS/CocosCreator \
  --project /Users/vicky/Documents/勇者火线突围/tmp/product-game-cocos-tuji-source \
  --build "platform=wechatgame;debug=false;md5Cache=true;buildPath=/Users/vicky/Documents/勇者火线突围/tmp/xiaomi_review_fixed/cocos-wechatgame"
```

Expected: Cocos exits successfully and creates a WeChat mini-game build containing `game.js`, `game.json`, `src/`, `cocos-js/`, and Cocos bundle directories.

- [ ] **Step 3: Verify the changed code is present in the generated project bundle**

Run: `rg -n "PrivacyConfirm|startBtn|showMainUI" /Users/vicky/Documents/勇者火线突围/tmp/xiaomi_review_fixed/cocos-wechatgame`

Expected: generated JavaScript contains the privacy gate and direct start-button binding.

### Task 5: Convert And Sign The Xiaomi Split Package

**Files:**
- Create: `/Users/vicky/Documents/勇者火线突围/tmp/xiaomi_review_fixed/quickgame/package.json`
- Generated: `/Users/vicky/Documents/勇者火线突围/tmp/xiaomi_review_fixed/quickgame/dist/`
- Reuse signing configuration and dependencies from: `/Users/vicky/Documents/勇者火线突围/tmp/xiaomi_rebuild/`

- [ ] **Step 1: Copy the fresh Cocos output into a dedicated Quick Game work directory**

Run: `rsync -a --delete /Users/vicky/Documents/勇者火线突围/tmp/xiaomi_review_fixed/cocos-wechatgame/ /Users/vicky/Documents/勇者火线突围/tmp/xiaomi_review_fixed/quickgame/`

Expected: the dedicated Quick Game directory contains only the new Cocos output.

- [ ] **Step 2: Restore the proven Quick Game toolchain files**

Run:

```bash
rsync -a /Users/vicky/Documents/勇者火线突围/tmp/xiaomi_rebuild/package.json /Users/vicky/Documents/勇者火线突围/tmp/xiaomi_rebuild/package-lock.json /Users/vicky/Documents/勇者火线突围/tmp/xiaomi_rebuild/node_modules /Users/vicky/Documents/勇者火线突围/tmp/xiaomi_review_fixed/quickgame/
```

Expected: `quickgame-cli` 0.2.5 is available without altering the source repository.

- [ ] **Step 3: Run the Xiaomi conversion with stream packaging enabled**

Run:

```bash
node -e "const compile=require('./node_modules/quickgame-cli/lib/commands/compile');compile({cocosWxGame:true,disableSubpackages:false,disableStreamPack:false,includeFileExt:'.pem,.pkm,.webp'},'prod')"
```

Working directory: `/Users/vicky/Documents/勇者火线突围/tmp/xiaomi_review_fixed/quickgame`

Expected: `dist/com.yongzhe.huoxiantuwei.mini.release.rpk` is an outer stream-package ZIP containing `main.rpk`, all six `usr_*` RPK files, and one duplicate full-package RPK. Calling the compiler programmatically is required because the CLI's optional boolean parser turns the text `false` into a truthy string.

- [ ] **Step 4: Assemble the upload RPKS without the duplicate full-package member**

Run:

```bash
rm -rf /Users/vicky/Documents/勇者火线突围/tmp/xiaomi_review_fixed/split-members
mkdir -p /Users/vicky/Documents/勇者火线突围/tmp/xiaomi_review_fixed/split-members
unzip /Users/vicky/Documents/勇者火线突围/tmp/xiaomi_review_fixed/quickgame/dist/com.yongzhe.huoxiantuwei.mini.release.rpk -d /Users/vicky/Documents/勇者火线突围/tmp/xiaomi_review_fixed/split-members
mkdir -p /Users/vicky/Documents/勇者火线突围/小米重新提交材料_v5/01_RPK
cd /Users/vicky/Documents/勇者火线突围/tmp/xiaomi_review_fixed/split-members
zip -0 -j /Users/vicky/Documents/勇者火线突围/小米重新提交材料_v5/01_RPK/勇者火线突围_1.0.1_小米分包发布.rpks main.rpk usr_Game.rpk usr_AudioAssets.rpk usr_Effect.rpk usr_LevelData.rpk usr_Roles.rpk usr_UI.rpk
```

Expected: the outer archive contains exactly seven entries and excludes the duplicate `com.yongzhe.huoxiantuwei.mini.rpk` member that inflated prior output.

### Task 6: Verify Package Limits And Runtime Flow

**Files:**
- Reuse verifier: `/Users/vicky/Documents/勇者火线突围/tmp/xiaomi_resubmission_v4/verify_rpks.py`
- Reuse tests: `/Users/vicky/Documents/勇者火线突围/tmp/xiaomi_resubmission_v4/test_verify_rpks.py`
- Verify: `/Users/vicky/Documents/勇者火线突围/小米重新提交材料_v5/01_RPK/勇者火线突围_1.0.1_小米分包发布.rpks`
- Create report: `/Users/vicky/Documents/勇者火线突围/小米重新提交材料_v5/01_RPK/RPKS校验结果.json`

- [ ] **Step 1: Run the existing verifier unit tests**

Run:

```bash
python3 -m unittest -v /Users/vicky/Documents/勇者火线突围/tmp/xiaomi_resubmission_v4/test_verify_rpks.py
```

Expected: all verifier tests pass before checking the new artifact.

- [ ] **Step 2: Run the verifier against the new artifact**

Run:

```bash
python3 /Users/vicky/Documents/勇者火线突围/tmp/xiaomi_resubmission_v4/verify_rpks.py \
  --input /Users/vicky/Documents/勇者火线突围/小米重新提交材料_v5/01_RPK/勇者火线突围_1.0.1_小米分包发布.rpks \
  --output /Users/vicky/Documents/勇者火线突围/小米重新提交材料_v5/01_RPK/RPKS校验结果.json
```

Expected: exit code 0; report confirms exactly seven outer members, package `com.yongzhe.huoxiantuwei.mini`, version `1.0.1`/`2`, six matching `usr_*` subpackages, main no larger than `4194304` bytes, and total no larger than `31457280` bytes.

- [ ] **Step 3: Run a cold-start manual acceptance check in the Xiaomi-compatible debugger/device**

Expected sequence:

```text
clear local storage
launch game
privacy policy appears before HomeUI and CustomAdUI
cancel/decline does not enter the game
launch again and confirm privacy
HomeUI appears
tap the visible start area once
level 1 starts and responds to gameplay touch
relaunch preserves consent and the lobby privacy button can reopen the policy
```

- [ ] **Step 4: Record generated artifact checksums outside Git**

```bash
shasum -a 256 /Users/vicky/Documents/勇者火线突围/小米重新提交材料_v5/01_RPK/勇者火线突围_1.0.1_小米分包发布.rpks
```
