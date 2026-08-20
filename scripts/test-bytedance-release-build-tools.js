#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const patchScript = path.join(repoRoot, 'scripts', 'patch-bytedance-release-build.js');
const verifyScript = path.join(repoRoot, 'scripts', 'verify-bytedance-release-build.js');
const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bytedance-release-tools-'));

function write(file, source) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
}

const appFile = path.join(buildDir, 'application.abcde.js');
const settingsFile = path.join(buildDir, 'src', 'settings.abcde.json');
const projectConfigFile = path.join(buildDir, 'project.config.json');
const engineFile = path.join(buildDir, 'cocos-js', 'cc.abcde.js');

write(appFile, [
  'class Application {',
  '  constructor() {',
  '    this.showFPS = true;',
  '  }',
  '  start(cc) {',
  '    return { debugMode: true ? cc.DebugMode.INFO : cc.DebugMode.ERROR, };',
  '  }',
  '}',
  '',
].join('\n'));
write(settingsFile, `${JSON.stringify({ engine: { debug: true } })}\n`);
write(projectConfigFile, `${JSON.stringify({ appid: 'testappId' })}\n`);

let repeatedSource = '';
for (let index = 0; index < 200; index += 1) {
  repeatedSource += [
    `// synthetic engine block ${index}`,
    `function syntheticEngineBlock${index}(input) {`,
    '  const base = input + 1;',
    '  const doubled = base * 2;',
    '  return doubled + base;',
    '}',
    '',
  ].join('\n');
}
write(engineFile, repeatedSource);

const missingSidebarResult = spawnSync(process.execPath, [verifyScript, buildDir], {
  cwd: repoRoot,
  encoding: 'utf8',
});
assert.notStrictEqual(missingSidebarResult.status, 0, 'verify should fail when sidebar revisit navigation is missing');
assert(
  (missingSidebarResult.stderr + missingSidebarResult.stdout).includes('tt.navigateToScene'),
  'verify should explain that tt.navigateToScene is missing',
);

const beforeSize = fs.statSync(engineFile).size;
const result = spawnSync(process.execPath, [patchScript, buildDir], {
  cwd: repoRoot,
  encoding: 'utf8',
});

assert.strictEqual(result.status, 0, result.stderr || result.stdout);

const appSource = fs.readFileSync(appFile, 'utf8');
const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
const projectConfig = JSON.parse(fs.readFileSync(projectConfigFile, 'utf8'));
const afterSize = fs.statSync(engineFile).size;

assert(!appSource.includes('this.showFPS = true'), 'showFPS should be disabled');
assert(!appSource.includes('debugMode: true ? cc.DebugMode.INFO : cc.DebugMode.ERROR'), 'debug mode should be forced to ERROR');
assert.strictEqual(settings.engine.debug, false, 'engine debug flag should be false');
assert.strictEqual(projectConfig.appid, 'ttf83e8e83665b0a4302', 'appid should be patched');
assert(afterSize < beforeSize * 0.6, `engine should be minified: ${beforeSize} -> ${afterSize}`);

const rerunResult = spawnSync(process.execPath, [patchScript, buildDir], {
  cwd: repoRoot,
  encoding: 'utf8',
});
assert.strictEqual(rerunResult.status, 0, rerunResult.stderr || rerunResult.stdout);
assert.strictEqual(fs.statSync(engineFile).size, afterSize, 'already minified engine should not be minified again');
assert(
  rerunResult.stdout.includes('Kept minified'),
  'patch rerun should report that the already minified engine was kept',
);

const sidebarResult = spawnSync(process.execPath, [verifyScript, buildDir], {
  cwd: repoRoot,
  encoding: 'utf8',
});
assert.strictEqual(sidebarResult.status, 0, sidebarResult.stderr || sidebarResult.stdout);

const ttSdkSource = fs.readFileSync(path.join(repoRoot, 'assets', 'Init', 'SystemSDK', 'TTSDK.ts'), 'utf8');
assert(
  /\btt\s*\.\s*navigateToScene\s*\(\s*\{(?=[\s\S]{0,1000}?\bscene\s*:\s*['"]sidebar['"])/.test(ttSdkSource),
  'TTSDK should call tt.navigateToScene with sidebar scene',
);

console.log('Bytedance release build tools test passed.');
