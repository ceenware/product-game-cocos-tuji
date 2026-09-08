const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  normalizeStartupRequirePaths,
  patchMainSource,
  patchCocosEngineSource,
  patchUniSdkSource,
  patchManifest,
  patchSettings,
  prepareSubpackages,
  patchRuntimeProject,
} = require('../lib/runtime-patches');
const { patchMinPlatform, patchMinPlatformSource } = require('../scripts/patch-min-platform');

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

function mainSource() {
  return [
    "const importMap=require('./src/import-map.js').default;",
    "require('./web-adapter');",
    "System.import('./src/application.js').then(() => {}).catch((err) => {",
    '    console.error(err);',
    '});',
    'function onApplicationCreated(application) {',
    "    return System.import('cc').then((cc) => {",
    "        require('./engine-adapter');",
    '        return application.init(cc);',
    '    });',
    '}',
  ].join('\n');
}

function cocosEngineSource() {
  return '"CC_XIAOMI",!0;"CC_VIVO",!1;x=P.XIAOMI_QUICK_GAME;var a={};b=qg,Object.keys(b).forEach;require("../../"+("src/"+t))';
}

function modernCocosEngineSource() {
  return [
    "tryDefineGlobal('CC_XIAOMI', false);",
    "tryDefineGlobal('CC_VIVO', true);",
    'currentPlatform = Platform.VIVO_MINI_GAME;',
    'function loadJsFile(path) { return require("" + path); }',
  ].join('\n');
}

function uniSdkSource() {
  return '2 == i.Global.engineType ? "XIAOMI_QUICK_GAME" == window.cc.sys.platform : void 0 !== window.qg; e.setOwnerNameLabel=function(t){t.string="游戏著作权人: __COPY_RIGHT_TEXT_"};';
}

function makeQuickgameFixture({ version = '0.2.5', source = 't=(e.quickGameCliVersion=getCliVersion(),1308)' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vivo-quickgame-'));
  fs.mkdirSync(path.join(root, 'lib', 'plugin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'quickgame-cli', version }));
  fs.writeFileSync(path.join(root, 'lib', 'plugin', 'resource-plugin.js'), source);
  return root;
}

function makeProjectFixture({ withBuild = true } = {}) {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vivo-runtime-project-'));
  const adapterRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vivo-adapter-'));
  const config = {
    packageName: 'com.example.vivo',
    minPlatformVersion: 1206,
    copyright: {
      owner: '巴中宜辰网络科技有限公司',
      softwareRegistration: '软著认000494301号',
    },
    subpackages: ['Game', 'AudioAssets'],
  };
  const version = { versionName: '1.0.11', versionCode: 12 };
  const writeTree = (tree) => {
    fs.mkdirSync(path.join(tree, 'src', 'cocos-js'), { recursive: true });
    fs.mkdirSync(path.join(tree, 'src', 'assets', 'uniSdk'), { recursive: true });
    fs.mkdirSync(path.join(tree, 'src', 'runtime-adapter'), { recursive: true });
    fs.mkdirSync(path.join(tree, 'assets', 'Game'), { recursive: true });
    fs.mkdirSync(path.join(tree, 'assets', 'AudioAssets'), { recursive: true });
    fs.writeFileSync(path.join(tree, 'main.js'), mainSource());
    fs.writeFileSync(path.join(tree, 'src', 'import-map.js'), 'module.exports = { default: { imports: { cc: "cc.js" } } };\n');
    fs.writeFileSync(path.join(tree, 'src', 'settings.json'), '{}');
    fs.writeFileSync(path.join(tree, 'manifest.json'), '{"config":{"logLevel":"debug"}}');
    fs.writeFileSync(path.join(tree, 'src', 'cocos-js', 'cc.abc123.js'), cocosEngineSource());
    fs.writeFileSync(path.join(tree, 'src', 'assets', 'uniSdk', 'uniSdk.min.js'), uniSdkSource());
    for (const name of config.subpackages) {
      fs.writeFileSync(path.join(tree, 'assets', name, 'config.json'), '{}');
      fs.writeFileSync(path.join(tree, 'assets', name, 'index.js'), 'export default {};\n');
    }
  };

  writeTree(projectDir);
  if (withBuild) {
    const buildDir = path.join(projectDir, 'build');
    fs.mkdirSync(buildDir, { recursive: true });
    writeTree(buildDir);
  }

  fs.mkdirSync(path.join(adapterRoot, 'runtime', 'vivo-mini-game'), { recursive: true });
  fs.writeFileSync(path.join(adapterRoot, 'runtime', 'vivo-mini-game', 'ral.min.js'), 'ral adapter');
  fs.writeFileSync(path.join(adapterRoot, 'runtime', 'vivo-mini-game', 'engine-adapter.min.js'), 'engine adapter');
  fs.mkdirSync(path.join(adapterRoot, 'runtime'), { recursive: true });
  fs.writeFileSync(path.join(adapterRoot, 'runtime', 'web-adapter.min.js'), 'web adapter');

  return { projectDir, adapterRoot, config, version };
}

function makeNormalizedProjectFixture() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vivo-normalized-project-'));
  const adapterRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vivo-normalized-adapter-'));
  const config = {
    packageName: 'com.example.vivo',
    minPlatformVersion: 1206,
    copyright: {
      owner: '巴中宜辰网络科技有限公司',
      softwareRegistration: '软著认000494301号',
    },
    subpackages: ['Game'],
  };
  const version = { versionName: '1.0.11', versionCode: 12 };
  fs.mkdirSync(path.join(projectDir, 'src', 'cocos-js'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'src', 'assets', 'uniSdk'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'usr_Game'), { recursive: true });
  const normalizedStartup = mainSource()
    .replace(/require\('\.\/web-adapter'\)/, "require('runtime-adapter/web-adapter.js')")
    .replace(/require\('\.\/engine-adapter'\)/, "require('runtime-adapter/engine-adapter.js')");
  fs.writeFileSync(path.join(projectDir, 'main.js'), 'require("game.js");\n');
  fs.writeFileSync(path.join(projectDir, 'game.js'), "require('externs-game.js');\n");
  fs.writeFileSync(path.join(projectDir, 'externs-game.js'), normalizedStartup);
  fs.writeFileSync(path.join(projectDir, 'manifest.json'), '{"config":{"logLevel":"debug"}}');
  fs.writeFileSync(path.join(projectDir, 'src', 'import-map.js'), 'module.exports = { default: { imports: { cc: "cc.js" } } };\n');
  fs.writeFileSync(path.join(projectDir, 'src', 'settings.json'), '{}');
  fs.writeFileSync(path.join(projectDir, 'src', 'cocos-js', 'cc.abc123.js'), cocosEngineSource());
  fs.writeFileSync(path.join(projectDir, 'src', 'assets', 'uniSdk', 'uniSdk.min.abc123.js'), uniSdkSource());
  fs.writeFileSync(path.join(projectDir, 'usr_Game', 'config.json'), '{}');
  fs.writeFileSync(path.join(projectDir, 'usr_Game', 'index.js'), 'export default {};\n');

  fs.mkdirSync(path.join(adapterRoot, 'runtime', 'vivo-mini-game'), { recursive: true });
  fs.writeFileSync(path.join(adapterRoot, 'runtime', 'vivo-mini-game', 'ral.min.js'), 'ral adapter');
  fs.writeFileSync(path.join(adapterRoot, 'runtime', 'vivo-mini-game', 'engine-adapter.min.js'), 'engine adapter');
  fs.mkdirSync(path.join(adapterRoot, 'runtime'), { recursive: true });
  fs.writeFileSync(path.join(adapterRoot, 'runtime', 'web-adapter.min.js'), 'web adapter');
  return { projectDir, adapterRoot, config, version };
}

test('normalizes adapter requires and is idempotent', () => {
  const once = normalizeStartupRequirePaths("require('./ral.min');require('./web-adapter');require('./engine-adapter')");
  assert.equal(once, 'require("./ral.min.js");require("./web-adapter.js");require("./engine-adapter.js")');
  assert.equal(normalizeStartupRequirePaths(once), once);
});

test('switches compiled engine from Xiaomi to vivo and fixes traversal loader', () => {
  const patched = patchCocosEngineSource(cocosEngineSource(), 'cc.hash.js');
  assert.match(patched, /"CC_XIAOMI",!1/);
  assert.match(patched, /"CC_VIVO",!0/);
  assert.match(patched, /P\.VIVO_MINI_GAME/);
  assert.match(patched, /require\("src\/"\+t\)/);
  assert.equal(patchCocosEngineSource(patched, 'cc.hash.js'), patched);
});

test('accepts the unminified Cocos 3.6 vivo engine loader', () => {
  const patched = patchCocosEngineSource(modernCocosEngineSource(), 'cc.js');
  assert.match(patched, /CC_XIAOMI', false/);
  assert.match(patched, /CC_VIVO', true/);
  assert.match(patched, /Platform\.VIVO_MINI_GAME/);
  assert.match(patched, /require\("" \+ path\)/);
  assert.equal(patchCocosEngineSource(patched, 'cc.js'), patched);
});

test('creates configured usr subpackages with main.js entries', () => {
  const root = makeBundleFixture(['AudioAssets', 'Game']);
  try {
    prepareSubpackages(root, ['AudioAssets', 'Game']);
    assert.equal(fs.readFileSync(path.join(root, 'usr_Game', 'main.js'), 'utf8'), "import './index.js';\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('adds a guarded Xiaomi provider check to uniSdk and is idempotent', () => {
  const patched = patchUniSdkSource(uniSdkSource(), 'uniSdk.min.js');
  assert.match(patched, /window\.qg\.getProvider/);
  assert.match(patched, /indexOf\("xiaomi"\)/);
  assert.equal(patchUniSdkSource(patched, 'uniSdk.min.js'), patched);
});

test('accepts an already-guarded compact uniSdk predicate with a local receiver', () => {
  const source = '2==i.Global.engineType?"XIAOMI_QUICK_GAME"==e.cc.sys.platform:void 0!==e.qg&&e.qg.getProvider&&-1<e.qg.getProvider().toLowerCase().indexOf("xiaomi")';
  assert.equal(patchUniSdkSource(source, 'uniSdk.min.js'), source);
});

test('rejects a uniSdk provider predicate with different guard and call receivers', () => {
  const source = '2==i.Global.engineType?"XIAOMI_QUICK_GAME"==e.cc.sys.platform:void 0!==e.qg&&e.qg.getProvider&&-1<window.qg.getProvider().toLowerCase().indexOf("xiaomi")';
  assert.throws(
    () => patchUniSdkSource(source, 'uniSdk.min.js'),
    /missing uniSdk Xiaomi platform predicate/,
  );
});

test('patches manifest metadata and preserves configured subpackage order', () => {
  const config = {
    packageName: 'com.example.release',
    minPlatformVersion: 1206,
    subpackages: ['Game', 'AudioAssets'],
  };
  const manifest = patchManifest({ config: { logLevel: 'warn' }, display: { orientation: 'portrait' } }, config, {
    versionName: '2.3.4',
    versionCode: 27,
  });

  assert.deepEqual(manifest, {
    config: { logLevel: 'warn', debug: false },
    display: { orientation: 'portrait' },
    package: 'com.example.release',
    versionName: '2.3.4',
    versionCode: 27,
    minPlatformVersion: 1206,
    buildType: 'release',
    subpackages: [
      { name: 'usr_Game', root: 'usr_Game/' },
      { name: 'usr_AudioAssets', root: 'usr_AudioAssets/' },
    ],
  });
});

test('patches settings without mutating the input object', () => {
  const settings = { engine: { customLayers: [] }, assets: { server: '' } };
  const patched = patchSettings(settings, { subpackages: ['Game', 'AudioAssets'] });
  assert.deepEqual(patched.engine, { customLayers: [], platform: 'vivo-mini-game', debug: false });
  assert.deepEqual(patched.assets, { server: '', subpackages: ['Game', 'AudioAssets'] });
  assert.deepEqual(settings, { engine: { customLayers: [] }, assets: { server: '' } });
});

test('patches main startup behavior and is idempotent', () => {
  const patched = patchMainSource(mainSource(), { imports: { cc: 'cc.js' } }, 'main.js');
  assert.ok(patched.indexOf('require("./ral.min.js")') < patched.indexOf('require("./web-adapter.js")'));
  assert.match(patched, /installVivoCanvasBridge/);
  assert.match(patched, /getRuntimeCanvas/);
  assert.match(patched, /installStartupDiagnostics/);
  assert.match(patched, /forceVivoPlatform/);
  assert.match(patched, /cc\.sys\.Platform\.VIVO_MINI_GAME/);
  assert.match(patched, /var importMap=\{"imports":\{"cc":"cc\.js"\}\};/);
  assert.doesNotMatch(patched, /require\(['"]\.\/src\/import-map\.js['"]\)/);
  assert.equal(patchMainSource(patched, { imports: { cc: 'cc.js' } }, 'main.js'), patched);
});

test('installs the canvas bridge before the first runtime-canvas sizing call', () => {
  const patched = patchMainSource(mainSource(), { imports: { cc: 'cc.js' } }, 'main.js');
  const bridgeIndex = patched.indexOf('installVivoCanvasBridge();');
  const sizingIndex = patched.indexOf('const startupCanvasForSizing = getRuntimeCanvas();');
  assert.ok(bridgeIndex >= 0);
  assert.ok(sizingIndex >= 0);
  assert.ok(bridgeIndex < sizingIndex);
});

test('keeps compact main startup source syntactically valid', () => {
  const source = 'require("./web-adapter"),System.import("./src/application.js").then(n=>n).catch(n=>{console.error(n)});function onApplicationCreated(n){return System.import("cc").then(t=>(require("./engine-adapter"),n.init(t)))}var importMap=require("./src/import-map.js").default;';
  const patched = patchMainSource(source, { imports: { cc: 'cc.js' } }, 'compact-main.js');
  assert.doesNotThrow(() => new Function(patched));
  assert.match(patched, /getRuntimeCanvas/);
  assert.match(patched, /showStartupError/);
});

test('adds runtime-canvas sizing when screen compatibility already exists', () => {
  const source = [
    "require('./web-adapter');",
    "if (typeof window !== 'undefined' && window.screen) { screen = window.screen; }",
    "System.import('./src/application.js').then(() => {}).catch((err) => { console.error(err); });",
    'function onApplicationCreated(application) {',
    "    return System.import('cc').then((cc) => {",
    "        require('./engine-adapter');",
    '        return application.init(cc);',
    '    });',
    '}',
    "var importMap=require('./src/import-map.js').default;",
  ].join('\n');
  const patched = patchMainSource(source, { imports: { cc: 'cc.js' } }, 'main.js');
  assert.match(patched, /startupCanvasForSizing/);
});

test('rejects main source with missing expected anchors', () => {
  assert.throws(
    () => patchMainSource("require('./engine-adapter');", { imports: {} }, 'main.js'),
    /missing web-adapter require|missing application import|missing platform initialization/,
  );
});

test('rejects engine and uniSdk sources with missing required anchors', () => {
  assert.throws(() => patchCocosEngineSource('CC_VIVO', 'cc.js'), /missing CC_XIAOMI constant/);
  assert.throws(() => patchUniSdkSource('window.qg', 'uniSdk.min.js'), /missing uniSdk Xiaomi platform predicate/);
});

test('patches only the temporary project and its existing build mirror', () => {
  const fixture = makeProjectFixture();
  const adapterBefore = fs.readFileSync(path.join(fixture.adapterRoot, 'runtime', 'vivo-mini-game', 'ral.min.js'));
  try {
    patchRuntimeProject(fixture);

    for (const tree of [fixture.projectDir, path.join(fixture.projectDir, 'build')]) {
      assert.equal(fs.readFileSync(path.join(tree, 'src', 'runtime-adapter', 'ral.js'), 'utf8'), 'ral adapter');
      assert.equal(fs.readFileSync(path.join(tree, 'src', 'runtime-adapter', 'web-adapter.js'), 'utf8'), 'web adapter');
      assert.equal(fs.readFileSync(path.join(tree, 'src', 'runtime-adapter', 'engine-adapter.js'), 'utf8'), 'engine adapter');
      assert.equal(fs.existsSync(path.join(tree, 'assets', 'Game')), false);
      assert.equal(fs.readFileSync(path.join(tree, 'usr_Game', 'main.js'), 'utf8'), "import './index.js';\n");
      assert.equal(JSON.parse(fs.readFileSync(path.join(tree, 'manifest.json'), 'utf8')).buildType, 'release');
      assert.match(fs.readFileSync(path.join(tree, 'src', 'cocos-js', 'cc.abc123.js'), 'utf8'), /VIVO_MINI_GAME/);
      assert.match(fs.readFileSync(path.join(tree, 'src', 'assets', 'uniSdk', 'uniSdk.min.js'), 'utf8'), /getProvider/);
    }

    assert.deepEqual(fs.readFileSync(path.join(fixture.adapterRoot, 'runtime', 'vivo-mini-game', 'ral.min.js')), adapterBefore);
  } finally {
    fs.rmSync(fixture.projectDir, { recursive: true, force: true });
    fs.rmSync(fixture.adapterRoot, { recursive: true, force: true });
  }
});

test('patches the normalized Cocos export layout used by quickgame-cli', () => {
  const fixture = makeNormalizedProjectFixture();
  try {
    patchRuntimeProject(fixture);
    assert.equal(fs.readFileSync(path.join(fixture.projectDir, 'runtime-adapter', 'ral.js'), 'utf8'), 'ral adapter');
    assert.equal(fs.readFileSync(path.join(fixture.projectDir, 'runtime-adapter', 'web-adapter.js'), 'utf8'), 'web adapter');
    assert.equal(fs.readFileSync(path.join(fixture.projectDir, 'runtime-adapter', 'engine-adapter.js'), 'utf8'), 'engine adapter');
    assert.equal(JSON.parse(fs.readFileSync(path.join(fixture.projectDir, 'manifest.json'), 'utf8')).buildType, 'release');
    assert.equal(JSON.parse(fs.readFileSync(path.join(fixture.projectDir, 'src', 'settings.json'), 'utf8')).engine.debug, false);
    assert.equal(fs.readFileSync(path.join(fixture.projectDir, 'usr_Game', 'main.js'), 'utf8'), "import './index.js';\n");
    assert.match(fs.readFileSync(path.join(fixture.projectDir, 'externs-game.js'), 'utf8'), /runtime-adapter\/ral\.js/);
  } finally {
    fs.rmSync(fixture.projectDir, { recursive: true, force: true });
    fs.rmSync(fixture.adapterRoot, { recursive: true, force: true });
  }
});

test('validates configured bundles before mutating the export', () => {
  const fixture = makeProjectFixture({ withBuild: false });
  const paths = [
    path.join(fixture.projectDir, 'main.js'),
    path.join(fixture.projectDir, 'src', 'settings.json'),
    path.join(fixture.projectDir, 'manifest.json'),
    path.join(fixture.projectDir, 'src', 'cocos-js', 'cc.abc123.js'),
    path.join(fixture.projectDir, 'src', 'assets', 'uniSdk', 'uniSdk.min.js'),
  ];
  const before = paths.map((filePath) => fs.readFileSync(filePath));
  fs.rmSync(path.join(fixture.projectDir, 'assets', 'AudioAssets'), { recursive: true, force: true });
  try {
    assert.throws(() => patchRuntimeProject(fixture), /Missing Cocos asset bundle/);
    for (let index = 0; index < paths.length; index += 1) {
      assert.deepEqual(fs.readFileSync(paths[index]), before[index]);
    }
    assert.equal(fs.existsSync(path.join(fixture.projectDir, 'src', 'runtime-adapter', 'ral.js')), false);
  } finally {
    fs.rmSync(fixture.projectDir, { recursive: true, force: true });
    fs.rmSync(fixture.adapterRoot, { recursive: true, force: true });
  }
});

test('patches the quickgame-cli floor and is idempotent', () => {
  const once = patchMinPlatformSource('t=(e.quickGameCliVersion=getCliVersion(),1308)', '1206');
  assert.equal(once, 't=(e.quickGameCliVersion=getCliVersion(),1206)');
  assert.equal(patchMinPlatformSource(once, '1206'), once);
});

test('patches quickgame-cli files only when the package version is exact', () => {
  const root = makeQuickgameFixture();
  const pluginPath = path.join(root, 'lib', 'plugin', 'resource-plugin.js');
  try {
    patchMinPlatform({ quickgameRoot: root, minPlatformVersion: '1206' });
    assert.equal(fs.readFileSync(pluginPath, 'utf8'), 't=(e.quickGameCliVersion=getCliVersion(),1206)');
    patchMinPlatform({ quickgameRoot: root, minPlatformVersion: '1206' });
    assert.equal(fs.readFileSync(pluginPath, 'utf8'), 't=(e.quickGameCliVersion=getCliVersion(),1206)');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects an unsupported quickgame-cli version and a missing floor anchor', () => {
  const wrongVersionRoot = makeQuickgameFixture({ version: '0.2.4' });
  const missingAnchorRoot = makeQuickgameFixture({ source: 'getCliVersion()' });
  try {
    assert.throws(() => patchMinPlatform({ quickgameRoot: wrongVersionRoot, minPlatformVersion: '1206' }), /expected quickgame-cli 0\.2\.5/);
    assert.throws(() => patchMinPlatform({ quickgameRoot: missingAnchorRoot, minPlatformVersion: '1206' }), /missing minPlatformVersion floor anchor/);
  } finally {
    fs.rmSync(wrongVersionRoot, { recursive: true, force: true });
    fs.rmSync(missingAnchorRoot, { recursive: true, force: true });
  }
});

test('quickgame-cli patch CLI accepts the required flags', () => {
  const root = makeQuickgameFixture();
  const script = path.join(__dirname, '..', 'scripts', 'patch-min-platform.js');
  try {
    const result = spawnSync(process.execPath, [
      script,
      '--quickgame-root', root,
      '--min-platform-version', '1206',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /1206/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runtime patch CLI loads config and version files', () => {
  const fixture = makeProjectFixture({ withBuild: false });
  const configPath = path.join(fixture.projectDir, 'release.json');
  const versionPath = path.join(fixture.projectDir, 'version.json');
  const script = path.join(__dirname, '..', 'scripts', 'patch-runtime.js');
  fs.writeFileSync(configPath, JSON.stringify({
    ...require('../release.json'),
    packageName: fixture.config.packageName,
    subpackages: fixture.config.subpackages,
  }));
  fs.writeFileSync(versionPath, JSON.stringify(fixture.version));
  try {
    const result = spawnSync(process.execPath, [
      script,
      '--project-dir', fixture.projectDir,
      '--adapter-root', fixture.adapterRoot,
      '--config', configPath,
      '--version-file', versionPath,
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(path.join(fixture.projectDir, 'src', 'runtime-adapter', 'ral.js'), 'utf8'), 'ral adapter');
  } finally {
    fs.rmSync(fixture.projectDir, { recursive: true, force: true });
    fs.rmSync(fixture.adapterRoot, { recursive: true, force: true });
  }
});
