const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { loadReleaseConfig, validateReleaseConfig } = require('../lib/config');

test('loads the committed vivo release contract', () => {
  const config = loadReleaseConfig(path.join(__dirname, '..', 'release.json'));
  assert.equal(config.branch, 'vivo');
  assert.equal(config.tagPrefix, 'vivo-v');
  assert.equal(config.packageName, 'com.yongzhe.huoxiantuwei.vivominigame');
  assert.deepEqual(config.versionBaseline, { name: '1.0.12', code: 13 });
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

test('requires verified copyright metadata for vivo releases', () => {
  const valid = loadReleaseConfig(path.join(__dirname, '..', 'release.json'));
  assert.throws(
    () => validateReleaseConfig({ ...valid, copyright: undefined }),
    /copyright\.owner/,
  );
  assert.throws(
    () => validateReleaseConfig({ ...valid, copyright: { owner: valid.copyright.owner } }),
    /copyright\.softwareRegistration/,
  );
});
