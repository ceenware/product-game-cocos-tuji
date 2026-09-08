const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { normalizeCocosExport, patchCocosBuild } = require('../lib/cocos-build-patch');
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

function makeRawCocosFixture() {
  const root = makeFixture();
  fs.mkdirSync(path.join(root, 'src', 'src', 'assets', 'uniSdk'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'assets', 'main'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'image'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'usr_Game'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'image', 'icon.png'), 'icon');
  fs.writeFileSync(path.join(root, 'src', 'externs-game.js'), 'System.import(\'./application.abc.js\');\n');
  fs.writeFileSync(path.join(root, 'src', 'application.abc.js'), "this.settingsPath = 'src/settings.abc.json';\n");
  fs.writeFileSync(path.join(root, 'src', 'src', 'settings.abc.json'), JSON.stringify({ engine: {}, assets: {} }));
  fs.writeFileSync(path.join(root, 'src', 'src', 'import-map.abc.json'), JSON.stringify({ imports: { cc: './../cocos-js/cc.abc.js' } }));
  fs.writeFileSync(path.join(root, 'src', 'src', 'system.bundle.abc.js'), 'system');
  fs.writeFileSync(path.join(root, 'src', 'src', 'polyfills.bundle.abc.js'), 'polyfills');
  fs.writeFileSync(path.join(root, 'src', 'src', 'assets', 'uniSdk', 'uniSdk.min.abc.js'), 'uniSdk');
  fs.writeFileSync(path.join(root, 'src', 'assets', 'main', 'index.abc.js'), 'main-assets');
  fs.writeFileSync(path.join(root, 'src', 'usr_Game', 'config.abc.json'), JSON.stringify({ name: 'Game' }));
  fs.writeFileSync(path.join(root, 'src', 'usr_Game', 'game.js'), 'subpackage');
  return root;
}

test('patches vivo compile config and manifest without fixed filenames', () => {
  const root = makeFixture({ engineFile: 'cc.8e5b4.js' });
  try {
    patchCocosBuild({ buildDir: root, config, version });
    const compile = readJson(path.join(root, 'cocos.compile.config.json'));
    const manifest = readJson(path.join(root, 'src', 'manifest.json'));
    assert.equal(compile.platform, 'vivo-mini-game');
    assert.equal(compile.packages['vivo-mini-game'].versionName, '1.0.11');
    assert.equal(compile.packages['vivo-mini-game'].versionCode, 12);
    assert.equal(manifest.package, config.packageName);
    assert.equal(manifest.name, config.displayName);
    assert.equal(manifest.minPlatformVersion, 1206);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('normalizes the raw Cocos 3.6 export for quickgame packaging', () => {
  const root = makeRawCocosFixture();
  const rawConfig = { ...config, subpackages: ['Game'] };
  try {
    normalizeCocosExport({ buildDir: root, config: rawConfig, version });

    const manifest = readJson(path.join(root, 'manifest.json'));
    assert.equal(manifest.package, rawConfig.packageName);
    assert.equal(manifest.name, rawConfig.displayName);
    assert.deepEqual(manifest.subpackages, [{ name: 'usr_Game', root: 'usr_Game/' }]);
    assert.equal(fs.readFileSync(path.join(root, 'main.js'), 'utf8'), 'require("game.js");\n');
    assert.equal(fs.readFileSync(path.join(root, 'game.js'), 'utf8'), "require('externs-game.js')");
    assert.equal(fs.existsSync(path.join(root, 'externs-game.js')), true);
    assert.equal(fs.existsSync(path.join(root, 'src', 'settings.json')), true);
    assert.equal(fs.existsSync(path.join(root, 'src', 'import-map.js')), true);
    assert.equal(fs.existsSync(path.join(root, 'src', 'system.bundle.js')), true);
    assert.equal(fs.existsSync(path.join(root, 'src', 'application.js')), true);
    assert.equal(fs.existsSync(path.join(root, 'assets', 'main', 'index.abc.js')), true);
    assert.equal(fs.existsSync(path.join(root, 'usr_Game', 'config.json')), true);
    assert.equal(fs.existsSync(path.join(root, 'usr_Game', 'index.js')), true);
    assert.equal(fs.readFileSync(path.join(root, 'usr_Game', 'main.js'), 'utf8'), "require('./index.js');\n");
    assert.equal(fs.existsSync(path.join(root, 'src', 'src')), false);
    assert.equal(fs.existsSync(path.join(root, 'src', 'usr_Game')), false);
    assert.equal(fs.existsSync(path.join(root, 'subpackages', 'Game')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails rather than patching an export for another platform', () => {
  const root = makeFixture({ platform: 'xiaomi-quick-game' });
  try {
    assert.throws(() => patchCocosBuild({ buildDir: root, config, version }), /expected vivo-mini-game export/);
    assert.deepEqual(readJson(path.join(root, 'cocos.compile.config.json')), {
      platform: 'xiaomi-quick-game',
      buildEngineParam: { platform: 'XIAOMI' },
      packages: { 'vivo-mini-game': {} },
      appTemplateData: {},
    });
    assert.equal(fs.readFileSync(path.join(root, 'src', 'manifest.json'), 'utf8'), '{}');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CLI resolves paths, loads inputs, and patches the export', () => {
  const root = makeFixture();
  const versionFile = path.join(root, 'version.json');
  const script = path.join(__dirname, '..', 'scripts', 'patch-cocos-build.js');
  fs.writeFileSync(versionFile, `${JSON.stringify(version)}\n`);

  try {
    const result = spawnSync(
      process.execPath,
      [
        script,
        '--build-dir', root,
        '--config', path.join(__dirname, '..', 'release.json'),
        '--version-file', versionFile,
      ],
      { encoding: 'utf8' },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      compileConfigPath: path.join(root, 'cocos.compile.config.json'),
      manifestPath: path.join(root, 'src', 'manifest.json'),
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('does not mutate compile config when manifest JSON is malformed', () => {
  const root = makeFixture();
  const compilePath = path.join(root, 'cocos.compile.config.json');
  const manifestPath = path.join(root, 'src', 'manifest.json');
  const compileBefore = fs.readFileSync(compilePath);
  fs.writeFileSync(manifestPath, '{ malformed');
  const manifestBefore = fs.readFileSync(manifestPath);

  try {
    assert.throws(() => patchCocosBuild({ buildDir: root, config, version }), SyntaxError);
    assert.deepEqual(fs.readFileSync(compilePath), compileBefore);
    assert.deepEqual(fs.readFileSync(manifestPath), manifestBefore);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('does not mutate JSON files when no Cocos engine bundle matches', () => {
  const root = makeFixture({ engineFile: 'engine.js' });
  const compilePath = path.join(root, 'cocos.compile.config.json');
  const manifestPath = path.join(root, 'src', 'manifest.json');
  const compileBefore = fs.readFileSync(compilePath);
  const manifestBefore = fs.readFileSync(manifestPath);

  try {
    assert.throws(() => patchCocosBuild({ buildDir: root, config, version }), /expected one .*found 0/);
    assert.deepEqual(fs.readFileSync(compilePath), compileBefore);
    assert.deepEqual(fs.readFileSync(manifestPath), manifestBefore);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('does not mutate JSON files when multiple Cocos engine bundles match', () => {
  const root = makeFixture({ engineFile: 'cc.first.js' });
  const compilePath = path.join(root, 'cocos.compile.config.json');
  const manifestPath = path.join(root, 'src', 'manifest.json');
  fs.writeFileSync(path.join(root, 'src', 'cocos-js', 'cc.second.js'), 'CC_VIVO');
  const compileBefore = fs.readFileSync(compilePath);
  const manifestBefore = fs.readFileSync(manifestPath);

  try {
    assert.throws(() => patchCocosBuild({ buildDir: root, config, version }), /expected one .*found 2/);
    assert.deepEqual(fs.readFileSync(compilePath), compileBefore);
    assert.deepEqual(fs.readFileSync(manifestPath), manifestBefore);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
