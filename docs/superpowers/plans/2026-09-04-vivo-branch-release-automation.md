# Vivo Branch Release Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将旧 vivo 构建修补能力迁入 `vivo` 分支，并实现不依赖自托管 Runner、按 vivo 标签独立递增版本的正式 RPK GitHub Release 流水线。

**Architecture:** 所有 vivo 参数集中在 `platforms/vivo/release.json`，Node.js 模块负责配置、版本、Cocos 环境、构建修补、签名和元数据，Python 模块负责 ZIP/RPK 结构与启动验证。GitHub Actions 只负责编排：选择唯一 Windows/macOS Runner、准备工具、调用同一构建入口，并在验证全部通过后创建 `vivo-v*` Release。

**Tech Stack:** Cocos Creator 3.6.2、Node.js 18.20.8、Node `node:test`、Python 3.11 `unittest`、OpenSSL 3.x、`quickgame-cli` 0.2.5、JSZip 3.10.1、GitHub Actions、GitHub CLI。

**Spec:** `docs/superpowers/specs/2026-09-03-vivo-branch-release-automation-design.md`

## Global Constraints

- 目标仓库固定为 `/Users/vicky/Documents/Github/火线-vivo`，实现只进入 `vivo` 分支。
- vivo 包名固定为 `com.yongzhe.huoxiantuwei.vivominigame`。
- Cocos Creator 固定为 `3.6.2`；Linux 不执行 Cocos 源工程导出。
- 版本基线固定为 `1.0.10` / `versionCode` 11，首个正式自动 Release 必须为 `vivo-v1.0.11` / `versionCode` 12。
- 自动版本只增加补丁位；切换主版本或次版本必须显式修改配置基线。
- 主包限制 `4194304` 字节，总包限制 `20971520` 字节，最低平台版本固定为 `1206`。
- 默认 Runner 为 `windows-2022`；托管 macOS 为 `macos-15-intel`。
- 自托管 Windows 标签固定为 `self-hosted,Windows,X64,cocos-vivo`；自托管 macOS 标签固定为 `self-hosted,macOS,X64,cocos-vivo`。
- 私钥和证书不得写入 Git、Actions 日志、构建元数据或 Release；正式发布只读取 `VIVO_SIGN_PRIVATE_KEY_B64` 和 `VIVO_SIGN_CERTIFICATE_B64`。
- 不迁移 `node_modules`、`build`、`dist`、`dist_temp`、RPK、日志、录像或审核材料。
- 保留用户已暂存的 `README.md` 修改并单独提交，不与实现提交混合。

---

### Task 1: 提交现有 README 修改并建立可推送基线

**Files:**
- Modify: `README.md`
- Existing: `docs/superpowers/specs/2026-09-03-vivo-branch-release-automation-design.md`
- Existing: `docs/superpowers/plans/2026-09-04-vivo-branch-release-automation.md`

**Interfaces:**
- Consumes: 当前 index 中仅删除 `README.md` 的 `针对vivo` 行。
- Produces: 已推送到 `origin/vivo` 的独立 README、设计和计划提交；后续实现从干净分支开始。

- [ ] **Step 1: 核对暂存内容和当前提交边界**

Run:

```bash
git status --short --branch
git diff --cached -- README.md
git show --stat --oneline HEAD
```

Expected: `README.md` 只有删除 `针对vivo`；HEAD 是计划文档提交，前一个提交是 `9a09f63 docs: design vivo release automation`。

- [ ] **Step 2: 单独提交 README**

Run:

```bash
git commit --only README.md -m "docs: update README platform description"
```

Expected: 新提交只包含 `README.md`。

- [ ] **Step 3: 验证分支干净且没有签名文件进入历史**

Run:

```bash
git status --short
git diff HEAD~1 --name-only
git ls-files | rg '(^|/)(private|certificate)\.pem$|\.rpk$' && exit 1 || true
```

Expected: 工作区干净；最后一个提交只包含 `README.md`；仓库未跟踪 PEM 或 RPK。

- [ ] **Step 4: 推送文档基线**

Run:

```bash
git push origin vivo
```

Expected: `origin/vivo` 包含设计、计划和 README 三个独立提交。

---

### Task 2: 建立 vivo 配置、依赖和测试入口

**Files:**
- Create: `platforms/vivo/release.json`
- Create: `platforms/vivo/package.json`
- Create: `platforms/vivo/package-lock.json`
- Create: `platforms/vivo/lib/config.js`
- Create: `platforms/vivo/scripts/run-python-tests.js`
- Create: `platforms/vivo/tests/config.test.js`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: 无。
- Produces: `loadReleaseConfig(filePath): object` 和 `validateReleaseConfig(config): object`；所有后续脚本只通过该接口读取平台参数。

- [ ] **Step 1: 写配置加载失败测试**

Create `platforms/vivo/tests/config.test.js`:

```js
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { loadReleaseConfig, validateReleaseConfig } = require('../lib/config');

test('loads the committed vivo release contract', () => {
  const config = loadReleaseConfig(path.join(__dirname, '..', 'release.json'));
  assert.equal(config.branch, 'vivo');
  assert.equal(config.tagPrefix, 'vivo-v');
  assert.equal(config.packageName, 'com.yongzhe.huoxiantuwei.vivominigame');
  assert.deepEqual(config.versionBaseline, { name: '1.0.10', code: 11 });
  assert.equal(config.cocos.version, '3.6.2');
  assert.equal(config.limits.mainBytes, 4194304);
  assert.equal(config.limits.totalBytes, 20971520);
});

test('rejects duplicate subpackages and invalid version baselines', () => {
  const valid = loadReleaseConfig(path.join(__dirname, '..', 'release.json'));
  assert.throws(
    () => validateReleaseConfig({ ...valid, subpackages: ['Game', 'Game'] }),
    /duplicate subpackage Game/,
  );
  assert.throws(
    () => validateReleaseConfig({ ...valid, versionBaseline: { name: '1.0', code: 11 } }),
    /versionBaseline.name/,
  );
});
```

- [ ] **Step 2: 运行测试并确认缺少模块**

Run:

```bash
node --test platforms/vivo/tests/config.test.js
```

Expected: FAIL with `Cannot find module '../lib/config'`.

- [ ] **Step 3: 创建唯一平台配置**

Create `platforms/vivo/release.json` with these exact values:

```json
{
  "platform": "vivo",
  "branch": "vivo",
  "tagPrefix": "vivo-v",
  "packageName": "com.yongzhe.huoxiantuwei.vivominigame",
  "displayName": "勇者火线突围",
  "versionBaseline": { "name": "1.0.10", "code": 11 },
  "minPlatformVersion": 1206,
  "subpackages": ["AudioAssets", "Effect", "Game", "LevelData", "Roles", "UI"],
  "limits": { "mainBytes": 4194304, "totalBytes": 20971520 },
  "cocos": {
    "version": "3.6.2",
    "windowsUrl": "https://download.cocos.com/CocosCreator/v3.6.2/CocosCreator-v3.6.2-win-102813.zip",
    "macosUrl": "https://download.cocos.com/CocosCreator/v3.6.2/CocosCreator-v3.6.2-mac-102813.zip"
  },
  "toolchain": {
    "node": "18.20.8",
    "python": "3.11",
    "openssl": "3.x",
    "quickgameCli": "0.2.5",
    "jszip": "3.10.1"
  },
  "runners": {
    "auto": ["windows-2022"],
    "windows": ["windows-2022"],
    "macos": ["macos-15-intel"],
    "self-hosted-windows": ["self-hosted", "Windows", "X64", "cocos-vivo"],
    "self-hosted-macos": ["self-hosted", "macOS", "X64", "cocos-vivo"]
  }
}
```

- [ ] **Step 4: 实现严格配置加载器**

Create `platforms/vivo/lib/config.js` with these exports and checks:

```js
const fs = require('node:fs');

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function validateReleaseConfig(config) {
  for (const key of ['platform', 'branch', 'tagPrefix', 'packageName']) {
    if (typeof config[key] !== 'string' || !config[key]) throw new Error(`invalid ${key}`);
  }
  if (!SEMVER.test(config.versionBaseline?.name || '')) {
    throw new Error('invalid versionBaseline.name');
  }
  if (!Number.isInteger(config.versionBaseline?.code) || config.versionBaseline.code < 1) {
    throw new Error('invalid versionBaseline.code');
  }
  const seen = new Set();
  for (const name of config.subpackages || []) {
    if (seen.has(name)) throw new Error(`duplicate subpackage ${name}`);
    seen.add(name);
  }
  if (seen.size === 0) throw new Error('subpackages must not be empty');
  if (config.cocos?.version !== '3.6.2') throw new Error('cocos.version must be 3.6.2');
  return config;
}

function loadReleaseConfig(filePath) {
  return validateReleaseConfig(JSON.parse(fs.readFileSync(filePath, 'utf8')));
}

module.exports = { loadReleaseConfig, validateReleaseConfig };
```

- [ ] **Step 5: 固定 Node 依赖和统一测试命令**

Create `platforms/vivo/package.json`:

```json
{
  "name": "yongzhe-huoxian-tuwei-vivo-release",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test:node": "node --test tests/*.test.js",
    "test:python": "node scripts/run-python-tests.js",
    "test": "npm run test:node && npm run test:python"
  },
  "dependencies": {
    "jszip": "3.10.1",
    "quickgame-cli": "0.2.5"
  }
}
```

Create `platforms/vivo/scripts/run-python-tests.js` so the same command works on Windows and macOS:

```js
#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

const candidates = [process.env.PYTHON, process.platform === 'win32' ? 'python' : 'python3', 'python'].filter(Boolean);
for (const executable of [...new Set(candidates)]) {
  const result = spawnSync(executable, ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py'], {
    cwd: require('node:path').join(__dirname, '..'),
    stdio: 'inherit',
  });
  if (!result.error) process.exit(result.status ?? 1);
  if (result.error.code !== 'ENOENT') throw result.error;
}
throw new Error('Python interpreter not found');
```

Run:

```bash
npm install --package-lock-only --ignore-scripts --prefix platforms/vivo
```

Expected: `platforms/vivo/package-lock.json` pins the complete dependency graph.

- [ ] **Step 6: 排除所有生成物**

Append to `.gitignore`:

```gitignore
# Platform release automation output
artifacts/vivo/
platforms/vivo/.cache/
platforms/vivo/.tmp/
```

- [ ] **Step 7: 运行测试并提交**

Run:

```bash
npm ci --ignore-scripts --prefix platforms/vivo
npm test --prefix platforms/vivo
git diff --check
git add .gitignore platforms/vivo/release.json platforms/vivo/package.json platforms/vivo/package-lock.json platforms/vivo/lib/config.js platforms/vivo/scripts/run-python-tests.js platforms/vivo/tests/config.test.js
git commit -m "build(vivo): add release configuration"
```

Expected: Node 和空 Python test discovery 均成功；提交不包含生成物。

---

### Task 3: 实现独立且可重跑的 vivo 版本解析器

**Files:**
- Create: `platforms/vivo/lib/version.js`
- Create: `platforms/vivo/scripts/resolve-version.js`
- Create: `platforms/vivo/tests/version.test.js`

**Interfaces:**
- Consumes: `loadReleaseConfig(filePath)`；Git 标签列表和当前提交标签列表。
- Produces: `resolveVersion(config, { allTags, headTags }): VersionInfo`，其中 `VersionInfo` 为 `{ versionName, versionCode, tag, reused }`；CLI 写入 JSON 并可写 `GITHUB_OUTPUT`。

- [ ] **Step 1: 写版本规则失败测试**

Create `platforms/vivo/tests/version.test.js`:

```js
const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveVersion } = require('../lib/version');

const config = {
  tagPrefix: 'vivo-v',
  versionBaseline: { name: '1.0.10', code: 11 },
};

test('starts vivo at 1.0.11/12 and ignores other platform tags', () => {
  assert.deepEqual(
    resolveVersion(config, { allTags: ['oppo-v9.9.9'], headTags: [] }),
    { versionName: '1.0.11', versionCode: 12, tag: 'vivo-v1.0.11', reused: false },
  );
});

test('increments only the vivo patch series', () => {
  assert.deepEqual(
    resolveVersion(config, { allTags: ['vivo-v1.0.11', 'vivo-v1.0.12'], headTags: [] }),
    { versionName: '1.0.13', versionCode: 14, tag: 'vivo-v1.0.13', reused: false },
  );
});

test('reuses the current commit tag', () => {
  assert.deepEqual(
    resolveVersion(config, { allTags: ['vivo-v1.0.11'], headTags: ['vivo-v1.0.11'] }),
    { versionName: '1.0.11', versionCode: 12, tag: 'vivo-v1.0.11', reused: true },
  );
});

test('rejects a tag from a different configured series', () => {
  assert.throws(
    () => resolveVersion(config, { allTags: ['vivo-v1.1.0'], headTags: [] }),
    /update versionBaseline before changing release series/,
  );
});

test('rejects a malformed tag using the vivo prefix', () => {
  assert.throws(
    () => resolveVersion(config, { allTags: ['vivo-v1.0.bad'], headTags: [] }),
    /invalid vivo release tag vivo-v1.0.bad/,
  );
});
```

- [ ] **Step 2: 运行测试确认缺少版本模块**

Run:

```bash
node --test platforms/vivo/tests/version.test.js
```

Expected: FAIL with `Cannot find module '../lib/version'`.

- [ ] **Step 3: 实现纯版本函数**

Create `platforms/vivo/lib/version.js` with:

```js
function parseTag(tag, prefix) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escaped}(\\d+)\\.(\\d+)\\.(\\d+)$`).exec(tag);
  return match && { tag, major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function resolveVersion(config, { allTags, headTags }) {
  const [baseMajor, baseMinor, basePatch] = config.versionBaseline.name.split('.').map(Number);
  const parsed = allTags.map((tag) => parseTag(tag, config.tagPrefix)).filter(Boolean);
  const malformed = allTags.find((tag) => tag.startsWith(config.tagPrefix) && !parseTag(tag, config.tagPrefix));
  if (malformed) throw new Error(`invalid vivo release tag ${malformed}`);
  const foreignSeries = parsed.find((item) => item.major !== baseMajor || item.minor !== baseMinor);
  if (foreignSeries) throw new Error('update versionBaseline before changing release series');
  const current = headTags.map((tag) => parseTag(tag, config.tagPrefix)).filter(Boolean);
  if (current.length > 1) throw new Error('current commit has multiple vivo release tags');
  const selected = current[0] || parsed.sort((a, b) => b.patch - a.patch)[0];
  const patch = current.length ? selected.patch : Math.max(basePatch, selected?.patch || basePatch) + 1;
  if (patch < basePatch) throw new Error('release tag precedes versionBaseline');
  const versionName = `${baseMajor}.${baseMinor}.${patch}`;
  return {
    versionName,
    versionCode: config.versionBaseline.code + patch - basePatch,
    tag: `${config.tagPrefix}${versionName}`,
    reused: current.length === 1,
  };
}

module.exports = { parseTag, resolveVersion };
```

- [ ] **Step 4: 实现 Git/Actions CLI**

Create `platforms/vivo/scripts/resolve-version.js` that:

```js
#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { loadReleaseConfig } = require('../lib/config');
const { resolveVersion } = require('../lib/version');

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const repo = path.resolve(arg('--repo', process.cwd()));
const config = loadReleaseConfig(path.resolve(arg('--config', path.join(__dirname, '..', 'release.json'))));
const output = path.resolve(arg('--output', path.join(repo, 'platforms', 'vivo', '.tmp', 'version.json')));
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const allTags = git('tag', '--list', `${config.tagPrefix}*`).split(/\r?\n/).filter(Boolean);
const headTags = git('tag', '--points-at', 'HEAD', '--list', `${config.tagPrefix}*`).split(/\r?\n/).filter(Boolean);
const version = resolveVersion(config, { allTags, headTags });
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(version, null, 2)}\n`);
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(version).map(([key, value]) => `${key}=${value}\n`).join(''));
}
console.log(JSON.stringify(version));
```

- [ ] **Step 5: 运行测试和本仓库冒烟测试**

Run:

```bash
npm run test:node --prefix platforms/vivo
tmp_version="$(mktemp)"
node platforms/vivo/scripts/resolve-version.js --repo . --output "$tmp_version"
node -e 'const v=require(process.argv[1]); if(v.tag!=="vivo-v1.0.11"||v.versionCode!==12) process.exit(1)' "$tmp_version"
rm "$tmp_version"
```

Expected: 所有测试通过，本仓库无 vivo 标签时解析为 `vivo-v1.0.11` / `12`。

- [ ] **Step 6: 提交版本器**

Run:

```bash
git add platforms/vivo/lib/version.js platforms/vivo/scripts/resolve-version.js platforms/vivo/tests/version.test.js
git commit -m "build(vivo): add independent version resolver"
```

---

### Task 4: 参数化修补 Cocos vivo 导出

**Files:**
- Create: `platforms/vivo/lib/cocos-build-patch.js`
- Create: `platforms/vivo/scripts/patch-cocos-build.js`
- Create: `platforms/vivo/tests/cocos-build-patch.test.js`

**Interfaces:**
- Consumes: `config`, `VersionInfo`, Cocos `vivo-mini-game` 导出目录。
- Produces: `patchCocosBuild({ buildDir, config, version }): { compileConfigPath, manifestPath }`；只改导出副本。

- [ ] **Step 1: 写临时目录修补测试**

Create `platforms/vivo/tests/cocos-build-patch.test.js` using `fs.mkdtempSync()` and these assertions:

```js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const config = require('../release.json');
const version = { versionName: '1.0.11', versionCode: 12, tag: 'vivo-v1.0.11', reused: false };

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function makeFixture({ platform = 'vivo-mini-game', engineFile = 'cc.8e5b4.js' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vivo-cocos-patch-'));
  fs.mkdirSync(path.join(root, 'src', 'cocos-js'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'runtime-adapter'), { recursive: true });
  fs.writeFileSync(path.join(root, 'cocos.compile.config.json'), JSON.stringify({
    platform,
    buildEngineParam: { platform: platform === 'vivo-mini-game' ? 'VIVO' : 'XIAOMI' },
    packages: { 'vivo-mini-game': {} },
    appTemplateData: {},
  }));
  fs.writeFileSync(path.join(root, 'src', 'manifest.json'), '{}');
  fs.writeFileSync(path.join(root, 'src', 'cocos-js', engineFile), 'CC_VIVO');
  fs.writeFileSync(path.join(root, 'src', 'game.js'), "require('externs-game.js')");
  fs.writeFileSync(path.join(root, 'src', 'runtime-adapter', 'engine-adapter.js'), 'ral.fsUtils');
  fs.writeFileSync(path.join(root, 'minigame.config.js'), 'runtime-adapter/ral.js');
  return root;
}

test('patches vivo compile config and manifest without fixed filenames', () => {
  const root = makeFixture({ engineFile: 'cc.8e5b4.js' });
  patchCocosBuild({ buildDir: root, config, version });
  const compile = readJson(path.join(root, 'cocos.compile.config.json'));
  const manifest = readJson(path.join(root, 'src', 'manifest.json'));
  assert.equal(compile.platform, 'vivo-mini-game');
  assert.equal(compile.packages['vivo-mini-game'].versionName, '1.0.11');
  assert.equal(compile.packages['vivo-mini-game'].versionCode, 12);
  assert.equal(manifest.package, config.packageName);
  assert.equal(manifest.minPlatformVersion, 1206);
});

test('fails rather than patching an export for another platform', () => {
  const root = makeFixture({ platform: 'xiaomi-quick-game' });
  assert.throws(() => patchCocosBuild({ buildDir: root, config, version }), /expected vivo-mini-game export/);
});
```

The fixture must create `cocos.compile.config.json`, `src/manifest.json`, `src/cocos-js/cc.8e5b4.js`, `src/game.js`, `src/runtime-adapter/engine-adapter.js`, and `minigame.config.js`.

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
node --test platforms/vivo/tests/cocos-build-patch.test.js
```

Expected: FAIL with missing `../lib/cocos-build-patch`.

- [ ] **Step 3: 实现 JSON 修补和动态文件发现**

Create `platforms/vivo/lib/cocos-build-patch.js` with:

```js
function findExactlyOne(directory, pattern) {
  const matches = fs.readdirSync(directory).filter((name) => pattern.test(name));
  if (matches.length !== 1) throw new Error(`${directory}: expected one ${pattern}, found ${matches.length}`);
  return path.join(directory, matches[0]);
}

function patchCocosBuild({ buildDir, config, version }) {
  const compileConfigPath = path.join(buildDir, 'cocos.compile.config.json');
  const manifestPath = path.join(buildDir, 'src', 'manifest.json');
  const compile = readJson(compileConfigPath);
  if (compile.platform !== 'vivo-mini-game' || compile.buildEngineParam?.platform !== 'VIVO') {
    throw new Error('expected vivo-mini-game export');
  }
  const options = compile.packages?.['vivo-mini-game'];
  if (!options) throw new Error('missing packages.vivo-mini-game');
  Object.assign(options, {
    package: config.packageName,
    versionName: version.versionName,
    versionCode: version.versionCode,
    minPlatformVersion: config.minPlatformVersion,
  });
  if (compile.appTemplateData) compile.appTemplateData.customVersion = version.versionName;
  writeJson(compileConfigPath, compile);
  const manifest = readJson(manifestPath);
  Object.assign(manifest, {
    package: config.packageName,
    versionName: version.versionName,
    versionCode: version.versionCode,
    minPlatformVersion: config.minPlatformVersion,
  });
  writeJson(manifestPath, manifest);
  findExactlyOne(path.join(buildDir, 'src', 'cocos-js'), /^cc(?:\.[^.]+)?\.js$/);
  return { compileConfigPath, manifestPath };
}
```

Include local `readJson()` and `writeJson()` helpers that preserve a trailing newline.

- [ ] **Step 4: 添加 CLI 包装**

Create `platforms/vivo/scripts/patch-cocos-build.js` accepting exact arguments:

```bash
node platforms/vivo/scripts/patch-cocos-build.js \
  --build-dir /absolute/path/to/vivo-mini-game \
  --config platforms/vivo/release.json \
  --version-file /absolute/path/to/version.json
```

The CLI resolves all paths, loads JSON, calls `patchCocosBuild`, and exits nonzero with the original error message.

- [ ] **Step 5: 验证并提交**

Run:

```bash
npm run test:node --prefix platforms/vivo
git diff --check
git add platforms/vivo/lib/cocos-build-patch.js platforms/vivo/scripts/patch-cocos-build.js platforms/vivo/tests/cocos-build-patch.test.js
git commit -m "build(vivo): parameterize Cocos export patching"
```

---

### Task 5: 迁移运行时、分包和 quickgame-cli 修补

**Files:**
- Create: `platforms/vivo/lib/runtime-patches.js`
- Create: `platforms/vivo/scripts/patch-runtime.js`
- Create: `platforms/vivo/scripts/patch-min-platform.js`
- Create: `platforms/vivo/tests/runtime-patches.test.js`
- Reference only: `/Users/vicky/Documents/勇者火线突围/tmp/vivo_rebuild/scripts/patch-vivo-runtime.js`
- Reference only: `/Users/vicky/Documents/勇者火线突围/tmp/vivo_rebuild/scripts/patch-vivo-min-platform.js`

**Interfaces:**
- Consumes: Cocos 导出目录、Cocos adapter 根目录、平台配置、版本文件和已安装 `quickgame-cli` 目录。
- Produces: `patchRuntimeProject({ projectDir, adapterRoot, config, version })`、`patchMinPlatform({ quickgameRoot, minPlatformVersion })`，以及可独立测试的纯字符串函数。

- [ ] **Step 1: 写纯转换与幂等性测试**

Create tests covering these exact exports:

```js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function makeBundleFixture(names) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vivo-bundles-'));
  for (const name of names) {
    const directory = path.join(root, 'assets', name);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'config.json'), '{}');
    fs.writeFileSync(path.join(directory, 'index.js'), 'export default {};\n');
  }
  return root;
}

const {
  normalizeStartupRequirePaths,
  patchMainSource,
  patchCocosEngineSource,
  patchUniSdkSource,
  patchManifest,
  prepareSubpackages,
} = require('../lib/runtime-patches');

test('normalizes adapter requires and is idempotent', () => {
  const once = normalizeStartupRequirePaths("require('./ral.min');require('./web-adapter');require('./engine-adapter')");
  assert.equal(once, 'require("./ral.min.js");require("./web-adapter.js");require("./engine-adapter.js")');
  assert.equal(normalizeStartupRequirePaths(once), once);
});

test('switches compiled engine from Xiaomi to vivo and fixes traversal loader', () => {
  const source = '"CC_XIAOMI",!0;"CC_VIVO",!1;x=P.XIAOMI_QUICK_GAME;var a={};b=qg,Object.keys(b).forEach;require("../../"+("src/"+t))';
  const patched = patchCocosEngineSource(source, 'cc.hash.js');
  assert.match(patched, /"CC_XIAOMI",!1/);
  assert.match(patched, /"CC_VIVO",!0/);
  assert.match(patched, /P\.VIVO_MINI_GAME/);
  assert.match(patched, /require\("src\/"\+t\)/);
  assert.equal(patchCocosEngineSource(patched, 'cc.hash.js'), patched);
});

test('creates configured usr subpackages with main.js entries', () => {
  const root = makeBundleFixture(['AudioAssets', 'Game']);
  prepareSubpackages(root, ['AudioAssets', 'Game']);
  assert.equal(fs.readFileSync(path.join(root, 'subpackages', 'Game', 'main.js'), 'utf8'), "import './index.js';\n");
});
```

Also test that `patchUniSdkSource` adds a guarded Xiaomi provider check and that `patchManifest` writes `buildType: 'release'`, the current version, and `usr_*` entries in config order.

- [ ] **Step 2: 运行测试确认缺少模块**

Run:

```bash
node --test platforms/vivo/tests/runtime-patches.test.js
```

Expected: FAIL with missing `../lib/runtime-patches`.

- [ ] **Step 3: 提取纯函数并保持旧审核修复行为**

Implement `runtime-patches.js` by moving the old script behavior into exports. The implementation must contain these concrete transformations:

```js
function patchManifest(manifest, config, version) {
  return {
    ...manifest,
    package: config.packageName,
    versionName: version.versionName,
    versionCode: version.versionCode,
    minPlatformVersion: config.minPlatformVersion,
    buildType: 'release',
    config: { ...(manifest.config || {}), debug: false, logLevel: manifest.config?.logLevel || 'log' },
    subpackages: config.subpackages.map((name) => ({ name: `usr_${name}`, root: `subpackages/${name}/` })),
  };
}

function patchSettings(settings, config) {
  return {
    ...settings,
    engine: { ...(settings.engine || {}), platform: 'vivo-mini-game', debug: false },
    assets: { ...(settings.assets || {}), subpackages: [...config.subpackages] },
  };
}
```

`patchMainSource` must preserve all old verified fixes: add `ral.min.js` before `web-adapter.js`, install the vivo canvas bridge, use `getRuntimeCanvas()` for sizing/error drawing, install startup error diagnostics, force `cc.sys.Platform.VIVO_MINI_GAME`, inline the import map, and reject missing expected anchors. `patchCocosEngineSource` and `patchUniSdkSource` must use required-anchor checks and return unchanged content on a second call.

- [ ] **Step 4: 实现只修改导出副本的文件编排**

`patchRuntimeProject({ projectDir, adapterRoot, config, version })` must:

```js
const vivoRuntime = path.join(adapterRoot, 'runtime', 'vivo-mini-game');
const commonRuntime = path.join(adapterRoot, 'runtime');
const runtimeTarget = path.join(projectDir, 'src', 'runtime-adapter');
fs.mkdirSync(runtimeTarget, { recursive: true });
copyRequired(path.join(vivoRuntime, 'ral.min.js'), path.join(runtimeTarget, 'ral.js'));
copyRequired(path.join(commonRuntime, 'web-adapter.min.js'), path.join(runtimeTarget, 'web-adapter.js'));
copyRequired(path.join(vivoRuntime, 'engine-adapter.min.js'), path.join(runtimeTarget, 'engine-adapter.js'));
```

Discover hashed files with directory scans, not fixed names. Apply the patch to the source tree and to an existing `build/` mirror only when that mirror exists. Never write under `adapterRoot`. Move configured bundles from `assets/<name>` to `subpackages/<name>` only in the temporary project, validate `config.json` and `index.js`, then create `main.js`.

- [ ] **Step 5: 实现 quickgame-cli 最低平台补丁**

Create `patch-min-platform.js` to accept `--quickgame-root` and `--min-platform-version`. It must verify `quickgame-cli/package.json` is exactly `0.2.5`, replace the known `1308` floor with `1206`, accept an already-patched file, and fail if neither anchor is present.

- [ ] **Step 6: 添加运行时 CLI 并运行全套测试**

`patch-runtime.js` accepts `--project-dir`, `--adapter-root`, `--config`, and `--version-file`, then invokes `patchRuntimeProject`.

Run:

```bash
npm run test:node --prefix platforms/vivo
node platforms/vivo/scripts/patch-min-platform.js \
  --quickgame-root platforms/vivo/node_modules/quickgame-cli \
  --min-platform-version 1206
npm ci --ignore-scripts --prefix platforms/vivo
```

Expected: tests pass; patch succeeds; reinstall restores a clean dependency tree for subsequent tests.

- [ ] **Step 7: 提交运行时迁移**

Run:

```bash
git add platforms/vivo/lib/runtime-patches.js platforms/vivo/scripts/patch-runtime.js platforms/vivo/scripts/patch-min-platform.js platforms/vivo/tests/runtime-patches.test.js
git commit -m "build(vivo): migrate runtime and subpackage patches"
```

---

### Task 6: 实现动态 Cocos/RPK 验证与机器可读报告

**Files:**
- Create: `platforms/vivo/scripts/vivo_verify.py`
- Create: `platforms/vivo/scripts/verify-cocos-build.py`
- Create: `platforms/vivo/scripts/verify-startup-entry.py`
- Create: `platforms/vivo/scripts/verify-release-rpk.py`
- Create: `platforms/vivo/tests/test_vivo_verify.py`
- Reference only: `/Users/vicky/Documents/勇者火线突围/tmp/vivo_rebuild/scripts/verify-vivo-cocos-build.py`
- Reference only: `/Users/vicky/Documents/勇者火线突围/tmp/vivo_rebuild/scripts/verify-vivo-startup-entry.py`
- Reference only: `/Users/vicky/Documents/勇者火线突围/tmp/vivo_rebuild/verify_release_rpk.sh`

**Interfaces:**
- Consumes: `release.json`, `version.json`, Cocos 导出目录或最终 RPK。
- Produces: `verify_cocos_build(root: Path, config: dict, version: dict) -> list[dict]`、`verify_startup_entry(rpk_path: Path, config: dict, version: dict) -> list[dict]`、`verify_release_rpk(rpk_path: Path, config: dict, version: dict) -> list[dict]`；三个 CLI 在失败时返回非零，并可写 `validation-report.json` / `.txt`。

- [ ] **Step 1: 写最小嵌套 RPK fixture 测试**

Create Python tests that generate ZIP bytes in memory instead of committing binaries:

```python
import io
import json
import os
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from typing import Dict, Optional, Set, Union

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
import vivo_verify

def make_cocos_fixture(engine_name: str) -> Path:
    root = Path(tempfile.mkdtemp(prefix="vivo-cocos-verify-"))
    (root / "src" / "cocos-js").mkdir(parents=True)
    (root / "src" / "runtime-adapter").mkdir(parents=True)
    write_json(root / "cocos.compile.config.json", valid_compile_config())
    write_json(root / "src" / "manifest.json", valid_manifest())
    (root / "src" / "cocos-js" / engine_name).write_text(valid_cocos_source(), encoding="utf-8")
    (root / "src" / "game.js").write_text("require('externs-game.js')", encoding="utf-8")
    (root / "src" / "runtime-adapter" / "engine-adapter.js").write_text("cc.assetManager.fsUtils = ral.fsUtils", encoding="utf-8")
    (root / "minigame.config.js").write_text(valid_minigame_config(), encoding="utf-8")
    return root

def make_outer_rpk(omit: Optional[Set[str]] = None, cocos_source: Optional[str] = None, main_padding: int = 0) -> Path:
    """Build main.rpk plus configured usr_*.rpk files in a temporary outer ZIP."""
    omit = omit or set()
    main_entries = {
        "main.js": "require('game.js')",
        "game.js": "require('externs-game.js')",
        "externs-game.js": valid_startup_source(),
        "manifest.json": json.dumps(valid_manifest()),
        "src/settings.json": json.dumps({"assets": {"subpackages": CONFIG["subpackages"]}}),
        "src/cocos-js/cc.8e5b4.js": cocos_source or valid_cocos_source(),
    }
    if main_padding:
        main_entries["padding.bin"] = os.urandom(main_padding)
    outer_entries = {"main.rpk": zip_bytes(main_entries)}
    for name in CONFIG["subpackages"]:
        archive_name = f"usr_{name}.rpk"
        if archive_name not in omit:
            outer_entries[archive_name] = zip_bytes({
                f"subpackages/{name}/main.js": "import './index.js';",
                f"subpackages/{name}/index.js": "export default {};",
                f"subpackages/{name}/config.json": "{}",
            })
    descriptor, filename = tempfile.mkstemp(prefix="vivo-release-", suffix=".rpk")
    os.close(descriptor)
    output = Path(filename)
    output.write_bytes(zip_bytes(outer_entries))
    return output

def zip_bytes(entries: Dict[str, Union[str, bytes]]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, data in entries.items():
            archive.writestr(name, data)
    return buffer.getvalue()

class VivoVerifyTests(unittest.TestCase):
    def test_accepts_dynamic_cocos_hash_names(self):
        root = make_cocos_fixture(engine_name="cc.8e5b4.js")
        checks = vivo_verify.verify_cocos_build(root, CONFIG, VERSION)
        self.assertTrue(all(item["ok"] for item in checks))

    def test_rejects_missing_subpackage(self):
        rpk = make_outer_rpk(omit={"usr_UI.rpk"})
        with self.assertRaisesRegex(vivo_verify.VerificationError, "missing split archive.*usr_UI.rpk"):
            vivo_verify.verify_release_rpk(rpk, CONFIG, VERSION)

    def test_rejects_traversal_loader_and_oversized_main(self):
        rpk = make_outer_rpk(cocos_source='require("../../src/"+t)', main_padding=4194305)
        with self.assertRaises(vivo_verify.VerificationError):
            vivo_verify.verify_release_rpk(rpk, CONFIG, VERSION)
```

Define `CONFIG`, `VERSION`, `valid_compile_config()`, `valid_manifest()`, `valid_cocos_source()`, `valid_startup_source()`, `valid_minigame_config()`, and `write_json()` in the same test file with the exact package/version/config constants. `make_outer_rpk()` includes `main.rpk`, all six configured `usr_*.rpk`, `manifest.json`, `src/settings.json`, and startup files; `omit`, `cocos_source`, and `main_padding` directly control the negative cases above.

- [ ] **Step 2: 运行测试确认缺少验证模块**

Run:

```bash
python3 -m unittest platforms/vivo/tests/test_vivo_verify.py -v
```

Expected: FAIL with import error for `vivo_verify`.

- [ ] **Step 3: 实现公共验证模块**

`vivo_verify.py` must define `VerificationError(RuntimeError)` plus these exact functions: `verify_cocos_build(root: Path, config: dict, version: dict) -> list[dict]`, `verify_startup_entry(rpk_path: Path, config: dict, version: dict) -> list[dict]`, `verify_release_rpk(rpk_path: Path, config: dict, version: dict) -> list[dict]`, and `write_reports(checks: list[dict], json_path: Path, text_path: Path) -> None`.

Use `Path.glob('cc*.js')`, `Path.glob('system.bundle*.js')`, and equivalent dynamic discovery. Validate exact package/version/min-platform values, outer and nested ZIP integrity, configured archive set, subpackage declarations, startup requires, traversal-loader absence, `main.rpk <= 4194304`, outer RPK `<= 20971520`, and SHA-256.

- [ ] **Step 4: 实现三个薄 CLI**

Each CLI accepts `--config`, `--version-file`, the target path, and optional `--report-json` / `--report-text`. It loads common data, calls one verifier, writes reports, prints one summary, and returns 1 on `VerificationError`.

- [ ] **Step 5: 运行 Python 和统一测试**

Run:

```bash
python3 -m unittest discover -s platforms/vivo/tests -p 'test_*.py' -v
npm test --prefix platforms/vivo
```

Expected: all fixture checks pass and negative cases fail only inside their assertions.

- [ ] **Step 6: 提交验证器**

Run:

```bash
git add platforms/vivo/scripts/vivo_verify.py platforms/vivo/scripts/verify-cocos-build.py platforms/vivo/scripts/verify-startup-entry.py platforms/vivo/scripts/verify-release-rpk.py platforms/vivo/tests/test_vivo_verify.py
git commit -m "test(vivo): add Cocos and RPK release validation"
```

---

### Task 7: 实现临时密钥签名和正式 RPK 生成

**Files:**
- Create: `platforms/vivo/lib/rpk-signing.js`
- Create: `platforms/vivo/scripts/sign-rpk.js`
- Create: `platforms/vivo/scripts/package-rpk.js`
- Create: `platforms/vivo/tests/rpk-signing.test.js`
- Reference only: `/Users/vicky/Documents/勇者火线突围/tmp/vivo_rebuild/scripts/resign-vivo-rpk-with-online-cert.js`

**Interfaces:**
- Consumes: `dist_temp`、配置分包列表、私钥路径、证书路径和输出路径。
- Produces: `assertKeyMatchesCertificate(privatePem, certificatePem)`、`assertSignedByCertificate(rpkBuffer, certificatePem)`、`signRpkSet(options): Promise<{ buffer: Buffer, certificateFingerprint: string }>`、最终正式 RPK。

- [ ] **Step 1: 写运行时生成测试证书的失败测试**

Create `rpk-signing.test.js`. In `before()` run OpenSSL into a temporary directory:

```js
execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
  '-subj', '/CN=vivo-release-test', '-keyout', keyPath, '-out', certPath]);
```

Then assert:

```js
test('rejects a mismatched private key and certificate', () => {
  assert.throws(() => assertKeyMatchesCertificate(keyA, certB), /do not match/);
});

test('signs configured inner packages and embeds the test certificate', async () => {
  const result = await signRpkSet({ distTempDir, config, privateKeyPath: keyA, certificatePath: certA });
  assert.equal(result.buffer.includes(Buffer.from('RPK Sig Block 42')), true);
  assert.equal(result.buffer.includes(pemToDer(certA)), true);
  assert.match(result.certificateFingerprint, /^([A-F0-9]{2}:){31}[A-F0-9]{2}$/);
  assert.doesNotThrow(() => assertSignedByCertificate(result.buffer, fs.readFileSync(certA)));
});
```

At the top of the test, define `openssl` by resolving `openssl` through `which`/`where`, define `keyA`, `certA`, `keyB`, `certB`, and `distTempDir` under one `fs.mkdtempSync()` directory, and define `pemToDer(file)` by removing PEM armor and Base64-decoding the body. Generate all inner unsigned ZIP fixtures during the test; do not add test PEM files to Git.

- [ ] **Step 2: 运行测试确认缺少签名模块**

Run:

```bash
node --test platforms/vivo/tests/rpk-signing.test.js
```

Expected: FAIL with missing `../lib/rpk-signing`.

- [ ] **Step 3: 参数化迁移签名实现**

Implement `rpk-signing.js` using direct dependencies from `platforms/vivo/node_modules`:

```js
const JSZip = require('jszip');
const { signZip, getBufferDigest } = require('quickgame-cli/lib/sign');

function expectedArchiveNames(config) {
  return ['main.rpk', ...config.subpackages.map((name) => `usr_${name}.rpk`)];
}
```

Read each unsigned archive from `dist_temp`, remove an existing `META-INF/CERT`, regenerate its hash metadata, sign inner archives, add the full package, then sign the outer archive. Derive all names from `config`; do not retain `/tmp`, `/Users`, `old-cert`, fixed versions, or a hardcoded archive list.

- [ ] **Step 4: 验证密钥配对和嵌入证书**

Use `crypto.createPrivateKey`, `crypto.createPublicKey`, and DER SPKI exports to compare key material before signing. Convert the PEM certificate to DER and require the final signed output to contain those bytes and `RPK Sig Block 42`; return the SHA-256 certificate fingerprint with the signing result. `assertSignedByCertificate()` performs the same checks without needing a private key and is exposed through `sign-rpk.js --verify --rpk <path> --certificate <path>` for downloaded Release validation.

- [ ] **Step 5: 实现 quickgame 编译包装**

`package-rpk.js` must invoke `quickgame-cli/lib/commands/compile` programmatically with:

```js
await compile({
  cocosWxGame: true,
  disableSubpackages: false,
  disableStreamPack: false,
  includeFileExt: '.pem,.pkm,.webp',
}, 'prod');
```

Run it with the temporary project as `cwd`, require `dist_temp` to contain every configured archive, then call `signRpkSet`. Never pass the private key body on the command line.

- [ ] **Step 6: 运行签名测试和提交**

Run:

```bash
npm test --prefix platforms/vivo
git diff --check
git add platforms/vivo/lib/rpk-signing.js platforms/vivo/scripts/sign-rpk.js platforms/vivo/scripts/package-rpk.js platforms/vivo/tests/rpk-signing.test.js
git commit -m "build(vivo): add deterministic release signing"
```

---

### Task 8: 实现 Windows/macOS Cocos 检测、安装和构建入口

**Files:**
- Create: `platforms/vivo/lib/cocos-toolchain.js`
- Create: `platforms/vivo/scripts/ensure-cocos.js`
- Create: `platforms/vivo/scripts/build.js`
- Create: `platforms/vivo/tests/cocos-toolchain.test.js`

**Interfaces:**
- Consumes: `RUNNER_OS`、`COCOS_CREATOR`、Runner tool cache、`release.json`、版本文件、项目根目录、签名模式。
- Produces: `ensureCocos(options): Promise<{ executable, adapterRoot, version, installed }>`、`ensureOpenSsl(options): Promise<{ executable, version, installed }>` 和统一构建命令 `build.js`。

- [ ] **Step 1: 写候选路径和构建参数失败测试**

Create tests for injected filesystem/process functions:

```js
test('uses a matching explicit COCOS_CREATOR without installing', async () => {
  const result = await ensureCocos({
    runnerOS: 'macOS',
    explicitPath: '/opt/CocosCreator.app/Contents/MacOS/CocosCreator',
    expectedVersion: '3.6.2',
    inspectVersion: async () => '3.6.2',
    install: async () => assert.fail('install must be skipped'),
  });
  assert.equal(result.installed, false);
});

test('installs when the discovered version is wrong', async () => {
  let installed = false;
  const result = await ensureCocos({
    runnerOS: 'Windows',
    candidates: ['C:\\Cocos\\Creator.exe'],
    expectedVersion: '3.6.2',
    inspectVersion: async (file) => file.includes('toolcache') ? '3.6.2' : '3.5.0',
    install: async () => { installed = true; return 'C:\\toolcache\\CocosCreator.exe'; },
  });
  assert.equal(installed, true);
  assert.equal(result.version, '3.6.2');
});

test('rejects Linux for Cocos export', async () => {
  await assert.rejects(() => ensureCocos({ runnerOS: 'Linux' }), /Windows or macOS/);
});

test('reuses OpenSSL 3 and installs it only when missing', async () => {
  let installCount = 0;
  const result = await ensureOpenSsl({
    runnerOS: 'macOS',
    candidates: ['/usr/local/bin/openssl'],
    inspectVersion: async () => 'OpenSSL 3.2.1',
    install: async () => { installCount += 1; return '/opt/homebrew/opt/openssl@3/bin/openssl'; },
  });
  assert.equal(result.version.startsWith('3.'), true);
  assert.equal(installCount, 0);
});
```

Also assert that `buildCocosArguments(projectRoot, buildRoot)` returns `--project`, the absolute project path, and `--build platform=vivo-mini-game;debug=false;md5Cache=false;buildPath=<absolute build root>`.

- [ ] **Step 2: 运行测试确认缺少工具链模块**

Run:

```bash
node --test platforms/vivo/tests/cocos-toolchain.test.js
```

Expected: FAIL with missing `../lib/cocos-toolchain`.

- [ ] **Step 3: 实现精确版本检测**

Candidate order must be:

1. `COCOS_CREATOR`.
2. Under `${RUNNER_TOOL_CACHE}/cocos-creator/3.6.2`, recursively locate `CocosCreator.app/Contents/MacOS/CocosCreator` or `CocosCreator.exe`.
3. macOS `/Applications/CocosCreator.app/Contents/MacOS/CocosCreator` and `$HOME/Applications/CocosCreator.app/Contents/MacOS/CocosCreator`.
4. Windows `%ProgramFiles%\CocosCreator\CocosCreator.exe`, `%LOCALAPPDATA%\Programs\CocosCreator\CocosCreator.exe`, then recursively search `%LOCALAPPDATA%\cocos-dashboard\editors\3.6.2`.

On macOS read `CFBundleShortVersionString` with `plutil`; on Windows inspect file version with PowerShell. Accept only exact `3.6.2`.

Implement `ensureOpenSsl({ runnerOS, candidates, inspectVersion, install })` with the same skip-or-install contract. Accept only `OpenSSL 3.x`; on macOS install missing OpenSSL with `brew install openssl@3`, and on Windows use `choco install openssl.light --yes --no-progress`. Search the Homebrew prefix and Git for Windows `usr/bin/openssl.exe` after installation. The returned `openssl` path is used for ephemeral validation certificates and is never written to metadata.

- [ ] **Step 4: 实现用户目录安装**

For macOS, download `config.cocos.macosUrl` to the cache, run `ditto -x -k`, locate `CocosCreator.app`, and validate its plist. For Windows, download `config.cocos.windowsUrl`, run `Expand-Archive`, locate the packaged installer or executable, run an NSIS installer with `/S` and `/D=<tool cache>` when present, then locate and validate `CocosCreator.exe`. A corrupt ZIP, empty extraction, nonzero installer status, or wrong post-install version must fail.

`ensure-cocos.js` writes these exact outputs when `GITHUB_OUTPUT` exists:

```text
executable=<absolute path>
adapter_root=<absolute path ending in engine/bin/adapter>
version=3.6.2
installed=true|false
openssl=<absolute path>
```

- [ ] **Step 5: 实现统一构建入口**

`build.js` accepts:

```text
--project-root <absolute path>
--workspace <absolute temporary path>
--artifacts <absolute artifacts/vivo path>
--version-file <absolute version.json path>
--cocos <absolute executable path>
--adapter-root <absolute adapter root>
--openssl <absolute OpenSSL executable path>
--signing-mode test|release
--private-key <path, required for release>
--certificate <path, required for release>
```

It removes and recreates only `workspace`, invokes Cocos with `spawnSync(cocosExecutable, buildCocosArguments(projectRoot, buildRoot), { stdio: 'inherit' })`, requires `<build root>/vivo-mini-game`, then calls Tasks 4-7 in this order: patch Cocos config, verify Cocos export, patch runtime, patch quickgame-cli, package/sign, verify final RPK. In `test` mode it generates a one-day temporary certificate with the `--openssl` executable and marks metadata `signingMode: 'test'`; in `release` mode missing key/cert paths fail before Cocos starts.

- [ ] **Step 6: 运行工具链单元测试和本机检测**

Run:

```bash
npm test --prefix platforms/vivo
COCOS_CREATOR=/Applications/CocosCreator.app/Contents/MacOS/CocosCreator \
  node platforms/vivo/scripts/ensure-cocos.js \
  --config platforms/vivo/release.json \
  --tool-cache "$HOME/Library/Caches/cocos-release-tools"
```

Expected: tests pass; local Cocos reports `3.6.2` and `installed=false`.

- [ ] **Step 7: 提交工具链**

Run:

```bash
git add platforms/vivo/lib/cocos-toolchain.js platforms/vivo/scripts/ensure-cocos.js platforms/vivo/scripts/build.js platforms/vivo/tests/cocos-toolchain.test.js
git commit -m "build(vivo): add cross-platform Cocos toolchain"
```

---

### Task 9: 生成 Release 元数据、校验和和完整附件目录

**Files:**
- Create: `platforms/vivo/lib/artifacts.js`
- Create: `platforms/vivo/scripts/write-build-metadata.js`
- Create: `platforms/vivo/scripts/write-release-notes.js`
- Create: `platforms/vivo/tests/artifacts.test.js`

**Interfaces:**
- Consumes: 最终 RPK、版本、Runner/toolchain 信息、证书公开指纹、验证 checks。
- Produces: `assembleArtifacts(options)`，以及五个固定 Release 附件。

- [ ] **Step 1: 写产物命名与 checksum 失败测试**

```js
test('assembles the exact vivo release asset set', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vivo-artifacts-'));
  const inputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vivo-artifact-input-'));
  const inputRpk = path.join(inputDir, 'input.rpk');
  fs.writeFileSync(inputRpk, Buffer.from('signed-rpk-fixture'));
  const config = require('../release.json');
  const version = { versionName: '1.0.11', versionCode: 12, tag: 'vivo-v1.0.11' };
  const result = assembleArtifacts({
    inputRpk, outputDir, config, version,
    metadata: { sourceSha: 'abc123', signingMode: 'release', certificateFingerprint: 'AA:BB' },
    checks: [{ name: 'outer-size', ok: true, actual: 1024 }],
  });
  assert.deepEqual(result.files.map((file) => path.basename(file)).sort(), [
    'SHA256SUMS',
    'build-metadata.json',
    'com.yongzhe.huoxiantuwei.vivominigame-v1.0.11.rpk',
    'validation-report.json',
    'validation-report.txt',
  ]);
  assert.match(fs.readFileSync(path.join(outputDir, 'SHA256SUMS'), 'utf8'), /^[a-f0-9]{64}  com\./);
});
```

- [ ] **Step 2: 运行测试确认缺少模块**

Run:

```bash
node --test platforms/vivo/tests/artifacts.test.js
```

Expected: FAIL with missing `../lib/artifacts`.

- [ ] **Step 3: 实现固定附件集合**

`assembleArtifacts()` must clean only its provided output directory, copy the RPK to `${config.packageName}-v${version.versionName}.rpk`, write SHA-256 in standard two-space format, and write stable sorted JSON with a trailing newline. Metadata must include:

```js
{
  platform: 'vivo',
  versionName: '1.0.11',
  versionCode: 12,
  tag: 'vivo-v1.0.11',
  sourceSha,
  trigger,
  runnerOS,
  runnerArch,
  cocosVersion: '3.6.2',
  nodeVersion,
  pythonVersion,
  signingMode,
  certificateFingerprint,
  builtAt,
}
```

Never serialize private-key paths, certificate contents, environment dumps, or GitHub Secrets.

`write-release-notes.js --metadata <path> --output <path>` reads only `build-metadata.json` and writes the tag, version, source SHA, runner and validation summary as plain public text for the GitHub Release body.

- [ ] **Step 4: 将产物组装接入 `build.js`**

After final verification, call `assembleArtifacts`; require exactly five files and re-read `SHA256SUMS` to compare it with the copied RPK before returning success.

- [ ] **Step 5: 运行测试并提交**

Run:

```bash
npm test --prefix platforms/vivo
git diff --check
git add platforms/vivo/lib/artifacts.js platforms/vivo/scripts/write-build-metadata.js platforms/vivo/scripts/write-release-notes.js platforms/vivo/tests/artifacts.test.js platforms/vivo/scripts/build.js
git commit -m "build(vivo): assemble verified release assets"
```

---

### Task 10: 添加只手动验证的跨 Runner GitHub 工作流

**Files:**
- Create: `.github/workflows/release-vivo.yml`
- Create: `platforms/vivo/tests/workflow.test.js`

**Interfaces:**
- Consumes: Tasks 2-9 的 CLI、GitHub 托管或可选自托管 Runner。
- Produces: `workflow_dispatch` 的 `validate` 构建；此阶段不创建标签或 Release。

- [ ] **Step 1: 写工作流契约失败测试**

Create `workflow.test.js` that reads the workflow as text and asserts:

```js
test('vivo workflow has one selected build runner and no Linux Cocos build', () => {
  const yaml = fs.readFileSync(path.join(__dirname, '..', '..', '..', '.github', 'workflows', 'release-vivo.yml'), 'utf8');
  assert.match(yaml, /workflow_dispatch:/);
  assert.match(yaml, /windows-2022/);
  assert.match(yaml, /macos-15-intel/);
  assert.match(yaml, /self-hosted-windows/);
  assert.match(yaml, /self-hosted-macos/);
  assert.match(yaml, /runs-on: \$\{\{ fromJSON\(needs\.select-runner\.outputs\.runner\) \}\}/);
  assert.doesNotMatch(yaml, /matrix:/);
  assert.doesNotMatch(yaml, /gh release create/);
});
```

- [ ] **Step 2: 运行测试确认工作流缺失**

Run:

```bash
node --test platforms/vivo/tests/workflow.test.js
```

Expected: FAIL with `ENOENT` for `release-vivo.yml`.

- [ ] **Step 3: 创建 Runner 选择任务**

The workflow starts with:

```yaml
name: Release Vivo

on:
  workflow_dispatch:
    inputs:
      runner:
        description: Build runner
        type: choice
        default: auto
        options: [auto, windows, macos, self-hosted-windows, self-hosted-macos]

permissions:
  contents: read

concurrency:
  group: release-vivo
  cancel-in-progress: false
```

`select-runner` runs on `ubuntu-latest`, reads `release.json`, validates the input key, and writes the selected runner array as compact JSON. No Cocos command runs in this job. The build job gives the version-resolution step id `version`, exposes `versionName`, `versionCode`, `tag`, and `versionFile` as step outputs, and passes the version file path to `build.js`.

- [ ] **Step 4: 创建唯一构建任务**

The build job must use:

```yaml
needs: select-runner
runs-on: ${{ fromJSON(needs.select-runner.outputs.runner) }}
env:
  COCOS_CACHE_DIR: ${{ runner.tool_cache }}/cocos-creator/3.6.2
```

Steps: checkout with `fetch-depth: 0` and tags, setup Node `18.20.8`, setup Python `3.11`, cache Cocos by `${{ runner.os }}-cocos-3.6.2`, `npm ci --ignore-scripts --prefix platforms/vivo`, run all tests, resolve version, ensure Cocos, invoke `build.js --signing-mode test`, and upload `artifacts/vivo` through `actions/upload-artifact@v4` as `vivo-validation-${{ runner.os }}-${{ github.sha }}`.

- [ ] **Step 5: 静态验证并提交手动工作流**

Run:

```bash
npm test --prefix platforms/vivo
git diff --check
git add .github/workflows/release-vivo.yml platforms/vivo/tests/workflow.test.js
git commit -m "ci(vivo): add hosted runner validation workflow"
git push origin vivo
```

Expected: push 不自动构建，因为工作流只有 `workflow_dispatch`。

---

### Task 11: 在 GitHub 托管 Windows 和 macOS 验证实际构建

**Files:**
- Modify conditionally after a reproducing test: `platforms/vivo/scripts/ensure-cocos.js`
- Modify conditionally after a reproducing test: `platforms/vivo/lib/cocos-toolchain.js`
- Modify conditionally after a reproducing test: `platforms/vivo/scripts/build.js`
- Modify conditionally after a reproducing test: `.github/workflows/release-vivo.yml`
- Test: corresponding `platforms/vivo/tests/*.test.js` or `test_*.py`

**Interfaces:**
- Consumes: 手动 `validate` 工作流。
- Produces: 两个成功 Actions run 和各自完整的五文件测试签名 artifact；不创建 Release。

- [ ] **Step 1: 触发并观察 Windows 托管构建**

Run:

```bash
gh workflow run release-vivo.yml --ref vivo -f runner=windows
windows_run="$(gh run list --workflow release-vivo.yml --branch vivo --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch "$windows_run" --exit-status
```

Expected: `windows-2022` 检测或安装 Cocos 3.6.2，构建成功，未创建 `vivo-v*` 标签。

- [ ] **Step 2: 对真实失败执行系统化修复**

For each failure, first add a reproducing test using captured path/layout metadata without committing downloaded applications or build output. Run the focused test to see it fail, make the smallest platform-specific correction, run the full suite, and use a commit message that names the reproduced condition, such as `fix(vivo): support Windows Creator installer layout` or `fix(vivo): locate macOS Creator adapter root`; push and re-run Windows until green.

- [ ] **Step 3: 下载并验证 Windows artifact**

Run:

```bash
rm -rf /tmp/vivo-windows-artifact
gh run download "$windows_run" --dir /tmp/vivo-windows-artifact
find /tmp/vivo-windows-artifact -type f -maxdepth 3 -print | sort
```

Expected: exactly one RPK, `SHA256SUMS`, `build-metadata.json`, and JSON/text validation reports; metadata says `runnerOS: Windows` and `signingMode: test`.

- [ ] **Step 4: 触发并观察 macOS Intel 托管构建**

Run:

```bash
gh workflow run release-vivo.yml --ref vivo -f runner=macos
macos_run="$(gh run list --workflow release-vivo.yml --branch vivo --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch "$macos_run" --exit-status
```

Expected: `macos-15-intel` 检测或安装 Cocos 3.6.2，构建成功，未创建 `vivo-v*` 标签。

- [ ] **Step 5: 下载并比较 macOS artifact**

Run:

```bash
rm -rf /tmp/vivo-macos-artifact
gh run download "$macos_run" --dir /tmp/vivo-macos-artifact
find /tmp/vivo-macos-artifact -type f -maxdepth 3 -print | sort
```

Expected: same five attachment types; metadata says `runnerOS: macOS`, Cocos `3.6.2`, and `signingMode: test`. If RPK hashes differ, compare metadata and ZIP member lists and document only timestamp/compression-order differences; functional validation must be identical.

- [ ] **Step 6: 记录双系统验证结果并提交必要修复**

Add the two run IDs and outcomes to the implementation commit message body or PR notes, not to `release.json`. Ensure:

```bash
npm test --prefix platforms/vivo
git status --short
git push origin vivo
```

Expected: all corrections are committed and both hosted runs are green.

---

### Task 12: 配置正式签名 Secrets 并启用自动 Release

**Files:**
- Modify: `.github/workflows/release-vivo.yml`
- Modify: `platforms/vivo/tests/workflow.test.js`

**Interfaces:**
- Consumes: 本机已验证的旧 vivo release 私钥/证书、绿色双系统验证工作流。
- Produces: push 到 `vivo` 自动使用 `windows-2022` 创建 `vivo-v1.0.11` 正式 Release；手动仍可选择五种 Runner。

- [ ] **Step 1: 验证本地私钥和证书配对但不打印内容**

Run:

```bash
private_key='/Users/vicky/Documents/勇者火线突围/tmp/vivo_rebuild/sign/release/private.pem'
certificate='/Users/vicky/Documents/勇者火线突围/tmp/vivo_rebuild/sign/release/certificate.pem'
test -s "$private_key"
test -s "$certificate"
key_fp="$(openssl pkey -in "$private_key" -pubout -outform DER 2>/dev/null | shasum -a 256 | awk '{print $1}')"
cert_fp="$(openssl x509 -in "$certificate" -pubkey -noout | openssl pkey -pubin -outform DER 2>/dev/null | shasum -a 256 | awk '{print $1}')"
test "$key_fp" = "$cert_fp"
```

Expected: exit 0 and no private material printed.

- [ ] **Step 2: 写入 GitHub Actions Secrets**

Run:

```bash
openssl base64 -A -in "$private_key" | gh secret set VIVO_SIGN_PRIVATE_KEY_B64 --repo ceenware/product-game-cocos-tuji
openssl base64 -A -in "$certificate" | gh secret set VIVO_SIGN_CERTIFICATE_B64 --repo ceenware/product-game-cocos-tuji
gh secret list --repo ceenware/product-game-cocos-tuji | rg '^VIVO_SIGN_(PRIVATE_KEY|CERTIFICATE)_B64\b'
```

Expected: both secret names exist; values are never displayed.

- [ ] **Step 3: 扩展工作流契约测试**

Update `workflow.test.js` to require:

```js
assert.match(yaml, /push:\s*\n\s*branches: \[vivo\]/);
assert.match(yaml, /paths-ignore:/);
assert.match(yaml, /VIVO_SIGN_PRIVATE_KEY_B64/);
assert.match(yaml, /VIVO_SIGN_CERTIFICATE_B64/);
assert.match(yaml, /gh release create/);
assert.match(yaml, /gh release upload/);
assert.match(yaml, /cancel-in-progress: false/);
```

Run the focused test before editing and confirm it fails because push/release behavior is absent.

- [ ] **Step 4: 启用 push 和正式签名分支**

Add:

```yaml
on:
  push:
    branches: [vivo]
    paths-ignore:
      - '**/*.md'
      - 'docs/**'
  workflow_dispatch:
    inputs:
      runner:
        type: choice
        default: auto
        options: [auto, windows, macos, self-hosted-windows, self-hosted-macos]
      mode:
        type: choice
        default: validate
        options: [validate, release]
```

Push events force runner `auto` and mode `release`; manual dispatch defaults to `validate`. Release mode decodes both Base64 secrets into `$RUNNER_TEMP/vivo-sign`, passes only file paths to `build.js`, and removes that directory in an `if: always()` cleanup step.

- [ ] **Step 5: 创建或恢复 Release 并核对附件**

After build success, grant `contents: write` and run a release step with `GH_TOKEN: ${{ github.token }}` and `TAG: ${{ steps.version.outputs.tag }}` that:

```bash
git fetch --tags origin
if gh release view "$TAG" >/dev/null 2>&1; then
  existing_target="$(gh release view "$TAG" --json targetCommitish --jq .targetCommitish)"
  test "$existing_target" = "$GITHUB_SHA" || test "$(git rev-parse "$TAG^{commit}")" = "$GITHUB_SHA"
else
  node platforms/vivo/scripts/write-release-notes.js --metadata artifacts/vivo/build-metadata.json --output "$RUNNER_TEMP/vivo-release-notes.txt"
  gh release create "$TAG" --target "$GITHUB_SHA" --title "$TAG" --notes-file "$RUNNER_TEMP/vivo-release-notes.txt"
fi
PACKAGE_ASSET="$(find artifacts/vivo -maxdepth 1 -type f -name '*.rpk' -print -quit)"
test -n "$PACKAGE_ASSET"
gh release upload "$TAG" \
  "$PACKAGE_ASSET" \
  artifacts/vivo/SHA256SUMS \
  artifacts/vivo/build-metadata.json \
  artifacts/vivo/validation-report.json \
  artifacts/vivo/validation-report.txt \
  --clobber
```

Create `platforms/vivo/scripts/write-release-notes.js` as a small public-metadata formatter before this step; it must never read the private key or certificate. Query the Release assets through `gh api` and require the exact five names from Task 9.

- [ ] **Step 6: 运行全部静态测试并提交启用变更**

Run:

```bash
npm test --prefix platforms/vivo
git diff --check
git add .github/workflows/release-vivo.yml platforms/vivo/tests/workflow.test.js
git commit -m "ci(vivo): enable automatic signed releases"
git push origin vivo
```

Expected: this push triggers the default `windows-2022` release job.

- [ ] **Step 7: 观察首个正式 Release**

Run:

```bash
release_run="$(gh run list --workflow release-vivo.yml --branch vivo --event push --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch "$release_run" --exit-status
gh release view vivo-v1.0.11 --json tagName,targetCommitish,assets --jq '{tagName,targetCommitish,assets:[.assets[].name]}'
```

Expected: tag is exactly `vivo-v1.0.11`; metadata contains `versionCode: 12`; Release contains exactly the signed RPK, `SHA256SUMS`, `build-metadata.json`, `validation-report.json`, and `validation-report.txt`.

- [ ] **Step 8: 下载正式附件并做最终独立校验**

Run:

```bash
rm -rf /tmp/vivo-v1.0.11-release
mkdir -p /tmp/vivo-v1.0.11-release
gh release download vivo-v1.0.11 --dir /tmp/vivo-v1.0.11-release
cd /tmp/vivo-v1.0.11-release
shasum -a 256 -c SHA256SUMS
node -e 'const fs=require("fs");const m=require("./build-metadata.json");fs.writeFileSync("version.json",JSON.stringify({versionName:m.versionName,versionCode:m.versionCode,tag:m.tag,reused:true},null,2)+"\\n")'
python3 /Users/vicky/Documents/Github/火线-vivo/platforms/vivo/scripts/verify-release-rpk.py \
  --config /Users/vicky/Documents/Github/火线-vivo/platforms/vivo/release.json \
  --version-file /tmp/vivo-v1.0.11-release/version.json \
  com.yongzhe.huoxiantuwei.vivominigame-v1.0.11.rpk
node /Users/vicky/Documents/Github/火线-vivo/platforms/vivo/scripts/sign-rpk.js \
  --verify \
  --rpk /tmp/vivo-v1.0.11-release/com.yongzhe.huoxiantuwei.vivominigame-v1.0.11.rpk \
  --certificate /Users/vicky/Documents/勇者火线突围/tmp/vivo_rebuild/sign/release/certificate.pem
```

Expected: checksum and all RPK checks pass on the downloaded Release asset, not only on the pre-upload local file.

---

### Task 13: 最终安全与分支隔离审计

**Files:**
- Modify only if audit finds a tracked mistake: `.gitignore`, `platforms/vivo/**`, `.github/workflows/release-vivo.yml`

**Interfaces:**
- Consumes: 完成的 vivo Release 流水线。
- Produces: 可证明没有秘密泄露、平台标签冲突或生成物入库的最终状态。

- [ ] **Step 1: 扫描绝对路径、旧版本和错误平台标识**

Run:

```bash
rg -n '/Users/|/tmp/|/Applications/CocosCreator|1\.0\.(9|10)|versionCode\s*[=:]\s*(10|11)|xiaomi-build' platforms/vivo .github/workflows/release-vivo.yml
```

Expected: only `release.json` 中允许的 `1.0.10` / 11 基线和测试断言命中；脚本无绝对本机路径，包描述无 Xiaomi 身份。

- [ ] **Step 2: 扫描秘密和生成物**

Run:

```bash
git ls-files | rg '(^|/)(private|certificate)\.pem$|\.rpk$|(^|/)node_modules/|(^|/)(dist|dist_temp)/' && exit 1 || true
git grep -n 'BEGIN .*PRIVATE KEY' && exit 1 || true
git status --short
```

Expected: no tracked secret/generated file and clean worktree.

- [ ] **Step 3: 运行最终测试与工作流状态检查**

Run:

```bash
npm ci --ignore-scripts --prefix platforms/vivo
npm test --prefix platforms/vivo
gh run list --workflow release-vivo.yml --branch vivo --limit 5
git log --oneline --decorate -12
git status --short --branch
```

Expected: all tests pass; latest push release run succeeds; `vivo` 与 `origin/vivo` 同步。

- [ ] **Step 4: 验证平台标签隔离**

Run:

```bash
git fetch --tags origin
git tag --list 'vivo-v*' --sort=v:refname
git tag --list 'oppo-v*' --sort=v:refname
git tag --list 'huawei-v*' --sort=v:refname
```

Expected: vivo 解析只使用 `vivo-v*`；其他平台标签即使存在也不影响下一 vivo 版本。
