const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { ensureCocos, ensureOpenSsl, buildCocosArguments, writeGitHubOutput } = require('../lib/cocos-toolchain');

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
    inspectVersion: async (file) => (file.includes('toolcache') ? '3.6.2' : '3.5.0'),
    install: async () => {
      installed = true;
      return 'C:\\toolcache\\CocosCreator.exe';
    },
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
    install: async () => {
      installCount += 1;
      return '/opt/homebrew/opt/openssl@3/bin/openssl';
    },
  });

  assert.equal(result.version.startsWith('3.'), true);
  assert.equal(installCount, 0);
});

test('buildCocosArguments uses absolute project and build paths', () => {
  const projectRoot = path.join(os.tmpdir(), 'project-root');
  const buildRoot = path.join(os.tmpdir(), 'build-root');
  const args = buildCocosArguments(projectRoot, buildRoot);

  assert.deepEqual(args, [
    '--project',
    path.resolve(projectRoot),
    '--build',
    `platform=vivo-mini-game;debug=false;md5Cache=false;buildPath=${path.resolve(buildRoot)}`,
  ]);
});

test('writes exact GITHUB_OUTPUT fields', () => {
  const output = path.join(os.tmpdir(), `cocos-output-${Date.now()}.txt`);
  const original = process.env.GITHUB_OUTPUT;
  process.env.GITHUB_OUTPUT = output;

  try {
    writeGitHubOutput({
      executable: '/opt/CocosCreator.app/Contents/MacOS/CocosCreator',
      adapterRoot: '/opt/CocosCreator.app/Contents/Resources/3.6.2/engine/bin/adapter',
      version: '3.6.2',
      installed: false,
      openssl: '/usr/local/bin/openssl',
    });
    assert.match(fs.readFileSync(output, 'utf8'), /executable=.*\nadapter_root=.*\nversion=3\.6\.2\ninstalled=false\nopenssl=.*/);
  } finally {
    if (original === undefined) delete process.env.GITHUB_OUTPUT;
    else process.env.GITHUB_OUTPUT = original;
    fs.rmSync(output, { force: true });
  }
});
