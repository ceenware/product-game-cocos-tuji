const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { patchCocosBuild } = require('../lib/cocos-build-patch');
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
  try {
    patchCocosBuild({ buildDir: root, config, version });
    const compile = readJson(path.join(root, 'cocos.compile.config.json'));
    const manifest = readJson(path.join(root, 'src', 'manifest.json'));
    assert.equal(compile.platform, 'vivo-mini-game');
    assert.equal(compile.packages['vivo-mini-game'].versionName, '1.0.11');
    assert.equal(compile.packages['vivo-mini-game'].versionCode, 12);
    assert.equal(manifest.package, config.packageName);
    assert.equal(manifest.minPlatformVersion, 1206);
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
