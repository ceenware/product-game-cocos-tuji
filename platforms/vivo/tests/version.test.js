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
