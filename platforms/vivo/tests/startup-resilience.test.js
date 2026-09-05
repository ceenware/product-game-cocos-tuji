const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { patchUniSdkCopyrightSource, patchUniSdkSource } = require('../lib/runtime-patches');

const repoRoot = path.join(__dirname, '..', '..', '..');
const loaderSource = fs.readFileSync(path.join(repoRoot, 'assets', 'Init', 'Tools', 'Loader.ts'), 'utf8');
const gameDirectorSource = fs.readFileSync(path.join(repoRoot, 'assets', 'Init', 'InitScripts', 'GameDirector.ts'), 'utf8');
const sdkSystemSource = fs.readFileSync(path.join(repoRoot, 'assets', 'Init', 'SystemSDK', 'SDKSystem.ts'), 'utf8');
const uniSdkSource = fs.readFileSync(path.join(repoRoot, 'assets', 'uniSdk', 'uniSdk.min.js'), 'utf8');
const releaseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'release.json'), 'utf8'));
const scene = JSON.parse(fs.readFileSync(path.join(repoRoot, 'assets', 'mainScene.scene'), 'utf8'));

test('vivo startup displays verified copyright details on both startup layers', () => {
  assert.deepEqual(releaseConfig.copyright, {
    owner: '巴中宜辰网络科技有限公司',
    softwareRegistration: '软著认000494301号',
  });
  const publishedUniSdkSource = patchUniSdkCopyrightSource(uniSdkSource, releaseConfig.copyright);
  assert.match(publishedUniSdkSource, /巴中宜辰网络科技有限公司/);
  assert.match(publishedUniSdkSource, /软著认000494301号/);
  assert.doesNotMatch(publishedUniSdkSource, /__COPY_RIGHT_TEXT_/);

  const ownerLabels = scene.filter((item) => item.__type__ === 'cc.Node' && item._name === 'OwnerLabel');
  assert.equal(ownerLabels.length, 2);
  assert.deepEqual(ownerLabels.map((item) => item._parent.__id__).sort((a, b) => a - b), [5, 107]);
});

test('subpackage failures finish the queue and release loading state', () => {
  assert.match(loaderSource, /\.loadFail\(err\)/);
  assert.match(loaderSource, /BundleLoadTimeoutMs/);
  assert.match(loaderSource, /private static runTimedLoad\(/);
  assert.match(loaderSource, /加载超时: \$\{label\}/);
  assert.match(loaderSource, /private static loadNextSubpackage\(\)/);
  assert.match(loaderSource, /if \(err\) \{[\s\S]*?\.loadFail\(err\)/s);
  assert.match(loaderSource, /this\.hideSubpackageProgress\(\);\s*this\.loadNextSubpackage\(\)/s);
  assert.match(loaderSource, /public loadFail\(err/);
  assert.match(loaderSource, /case LoadState\.failed/);
});

test('required loading callbacks propagate failures instead of hanging or dereferencing null', () => {
  assert.match(loaderSource, /if \(!!err\)[\s\S]*?cb\(null\);[\s\S]*?return;/);
  assert.match(gameDirectorSource, /if \(error\) \{[\s\S]*?cb && cb\(error\);[\s\S]*?return;/);
  assert.match(gameDirectorSource, /if \(!prefabs\) \{[\s\S]*?loadPerfabFinish\(bound, new Error/);
  assert.match(sdkSystemSource, /InitializationTimeoutMs/);
});

test('vivo SDK platform checks tolerate runtimes without getProvider', () => {
  const patched = patchUniSdkSource([
    '2 == i.Global.engineType ? "XIAOMI_QUICK_GAME" == window.cc.sys.platform : void 0 !== window.qg;',
    'void 0!==window.qg&&-1<window.qg.getProvider().toLowerCase().indexOf("vivo")',
    'void 0!==window.qg&&-1<window.qg.getProvider().toLowerCase().indexOf("oppo")',
  ].join('\n'));
  assert.match(patched, /window\.qg\.getProvider&&-1<window\.qg\.getProvider\(\)\.toLowerCase\(\)\.indexOf\("vivo"\)/);
  assert.match(patched, /window\.qg\.getProvider&&-1<window\.qg\.getProvider\(\)\.toLowerCase\(\)\.indexOf\("oppo"\)/);
  assert.match(sdkSystemSource, /private static getProviderName\(platform: any\)/);
  assert.doesNotMatch(sdkSystemSource, /window\['qg'\]\.getProvider\(\)\.toLowerCase\(\)/);
});
