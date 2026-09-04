const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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

test('rejects a non-canonical tag with leading-zero components', () => {
  assert.throws(
    () => resolveVersion(config, { allTags: ['vivo-v01.0.11'], headTags: ['vivo-v01.0.11'] }),
    /invalid vivo release tag vivo-v01.0.11/,
  );
});

test('rejects a head tag from a different configured series', () => {
  assert.throws(
    () => resolveVersion(config, { allTags: [], headTags: ['vivo-v1.1.11'] }),
    /update versionBaseline before changing release series/,
  );
});

test('rejects a malformed head tag', () => {
  assert.throws(
    () => resolveVersion(config, { allTags: [], headTags: ['vivo-v1.0.bad'] }),
    /invalid vivo release tag vivo-v1.0.bad/,
  );
});

test('CLI reads Git tags and writes JSON and GITHUB_OUTPUT', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'vivo-version-test-'));
  const script = path.join(__dirname, '..', 'scripts', 'resolve-version.js');
  const output = path.join(repo, 'version.json');
  const githubOutput = path.join(repo, 'github-output');
  const git = (args) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });

  try {
    git(['init', '--quiet']);
    git(['config', 'user.email', 'vivo-version-test@example.com']);
    git(['config', 'user.name', 'vivo-version-test']);
    git(['commit', '--quiet', '--allow-empty', '-m', 'baseline']);
    git(['tag', 'vivo-v1.0.11']);
    git(['commit', '--quiet', '--allow-empty', '-m', 'current']);
    git(['tag', 'vivo-v1.0.12']);

    const result = spawnSync(
      process.execPath,
      [script, '--repo', repo, '--output', output],
      { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: githubOutput } },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), {
      versionName: '1.0.12',
      versionCode: 13,
      tag: 'vivo-v1.0.12',
      reused: true,
    });
    assert.equal(
      fs.readFileSync(githubOutput, 'utf8'),
      'versionName=1.0.12\nversionCode=13\ntag=vivo-v1.0.12\nreused=true\n',
    );
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
