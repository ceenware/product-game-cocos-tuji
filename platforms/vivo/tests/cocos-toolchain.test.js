const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  ensureCocos,
  ensureOpenSsl,
  buildCocosArguments,
  writeGitHubOutput,
  inspectCocosVersion,
  findAdapterRoot,
  installCocos,
  defaultOpenSslCandidates,
} = require('../lib/cocos-toolchain');

const { pythonCandidates, runPythonVerifier, cleanupTemporarySigningDirectory } = require('../scripts/build');

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

test('reads the macOS plist beside the executable Contents directory', () => {
  const executable = '/opt/CocosCreator.app/Contents/MacOS/CocosCreator';
  let args;
  const version = inspectCocosVersion(executable, 'macOS', (command, commandArgs) => {
    args = [command, commandArgs];
    return '3.6.2\n';
  });

  assert.equal(version, '3.6.2');
  assert.deepEqual(args, [
    'plutil',
    ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', '/opt/CocosCreator.app/Contents/Info.plist'],
  ]);
});

test('derives the macOS adapter root from Contents', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-app-'));
  const executable = path.join(root, 'CocosCreator.app', 'Contents', 'MacOS', 'CocosCreator');
  const adapterRoot = path.join(root, 'CocosCreator.app', 'Contents', 'Resources', '3.6.2', 'engine', 'bin', 'adapter');
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.mkdirSync(adapterRoot, { recursive: true });
  fs.writeFileSync(executable, '');

  try {
    assert.equal(findAdapterRoot(executable, '3.6.2'), adapterRoot);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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

test('includes Chocolatey and Git for Windows OpenSSL locations', () => {
  const candidates = defaultOpenSslCandidates('Windows');
  assert.ok(candidates.includes('C:\\ProgramData\\chocolatey\\bin\\openssl.exe'));
  assert.ok(candidates.includes('C:\\Program Files\\Git\\usr\\bin\\openssl.exe'));
});

test('finds Git for Windows OpenSSL after Chocolatey installation', async () => {
  const gitOpenSsl = 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe';
  const commands = [];
  const result = await ensureOpenSsl({
    runnerOS: 'Windows',
    candidates: [],
    inspectVersion: (candidate) => candidate === gitOpenSsl ? 'OpenSSL 3.3.0' : '',
    execFileSyncImpl: (command, args) => {
      commands.push([command, args]);
      return '';
    },
  });

  assert.equal(result.executable, gitOpenSsl);
  assert.deepEqual(commands, [['choco', ['install', 'openssl.light', '--yes', '--no-progress']]]);
});

test('installs Cocos from a macOS archive through injected dependencies', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-install-mac-'));
  const toolCache = path.join(root, 'cache');
  let executable;

  try {
    const result = await installCocos({
      runnerOS: 'macOS',
      expectedVersion: '3.6.2',
      toolCache,
      cocosConfig: { macosUrl: 'https://example.test/cocos.zip' },
      download: async (_url, destination) => fs.writeFileSync(destination, 'zip-fixture'),
      extract: async (_archive, destination) => {
        executable = path.join(destination, 'CocosCreator.app', 'Contents', 'MacOS', 'CocosCreator');
        fs.mkdirSync(path.dirname(executable), { recursive: true });
        fs.writeFileSync(executable, '');
        fs.writeFileSync(path.join(destination, 'CocosCreator.app', 'Contents', 'Info.plist'), 'plist-fixture');
      },
      inspectVersion: (candidate) => candidate === executable ? '3.6.2' : '',
    });

    assert.match(result, /cocos-creator[\\/]3\.6\.2[\\/]CocosCreator\.app[\\/]Contents[\\/]MacOS[\\/]CocosCreator$/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('installs Cocos from a Windows archive with an NSIS installer', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-install-win-'));
  const toolCache = path.join(root, 'cache');
  const versionRoot = path.join(toolCache, 'cocos-creator', '3.6.2');
  const executable = path.join(versionRoot, 'CocosCreator', 'CocosCreator.exe');
  let installerArgs;

  try {
    const result = await installCocos({
      runnerOS: 'Windows',
      expectedVersion: '3.6.2',
      toolCache,
      cocosConfig: { windowsUrl: 'https://example.test/cocos.zip' },
      download: async (_url, destination) => fs.writeFileSync(destination, 'zip-fixture'),
      extract: async (_archive, destination) => {
        fs.mkdirSync(destination, { recursive: true });
        fs.writeFileSync(path.join(destination, 'CocosCreator-3.6.2-setup.exe'), 'installer');
      },
      runInstaller: async (_installer, args) => {
        installerArgs = args;
        fs.mkdirSync(path.dirname(executable), { recursive: true });
        fs.writeFileSync(executable, '');
        return { status: 0 };
      },
      inspectVersion: (candidate) => candidate === executable ? '3.6.2' : '',
    });

    assert.equal(result, executable);
    assert.deepEqual(installerArgs, ['/S', `/D=${versionRoot}`]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('uses the default Windows installer runner with an injected process', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-install-default-'));
  const toolCache = path.join(root, 'cache');
  const versionRoot = path.join(toolCache, 'cocos-creator', '3.6.2');
  const executable = path.join(versionRoot, 'CocosCreator.exe');
  let installerPath;
  let installerArgs;

  try {
    const result = await installCocos({
      runnerOS: 'Windows',
      expectedVersion: '3.6.2',
      toolCache,
      cocosConfig: { windowsUrl: 'https://example.test/cocos.zip' },
      download: async (_url, destination) => fs.writeFileSync(destination, 'zip-fixture'),
      extract: async (_archive, destination) => {
        fs.mkdirSync(destination, { recursive: true });
        fs.writeFileSync(path.join(destination, 'CocosCreator-3.6.2-setup.exe'), 'installer');
      },
      spawn: (installer, args) => {
        installerPath = installer;
        installerArgs = [installer, args];
        fs.writeFileSync(executable, '');
        return { status: 0 };
      },
      inspectVersion: (candidate) => candidate === executable ? '3.6.2' : '',
    });

    assert.equal(result, executable);
    assert.equal(installerPath && path.basename(installerPath), 'CocosCreator-3.6.2-setup.exe');
    assert.deepEqual(installerArgs && installerArgs[1], ['/S', `/D=${versionRoot}`]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails when the default Windows installer is terminated by a signal', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-install-signal-'));

  try {
    await assert.rejects(() => installCocos({
      runnerOS: 'Windows',
      expectedVersion: '3.6.2',
      toolCache: path.join(root, 'cache'),
      cocosConfig: { windowsUrl: 'https://example.test/cocos.zip' },
      download: async (_url, destination) => fs.writeFileSync(destination, 'zip-fixture'),
      extract: async (_archive, destination) => {
        fs.mkdirSync(destination, { recursive: true });
        fs.writeFileSync(path.join(destination, 'CocosCreator-3.6.2-setup.exe'), 'installer');
      },
      spawn: () => ({ status: null, signal: 'SIGTERM' }),
    }), /terminated by signal SIGTERM/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails when the Cocos download is empty', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-install-empty-'));

  try {
    await assert.rejects(() => installCocos({
      runnerOS: 'macOS',
      expectedVersion: '3.6.2',
      toolCache: path.join(root, 'cache'),
      cocosConfig: { macosUrl: 'https://example.test/cocos.zip' },
      download: async () => {},
    }), /download is empty/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails when archive extraction returns a nonzero status', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-install-extract-'));

  try {
    await assert.rejects(() => installCocos({
      runnerOS: 'macOS',
      expectedVersion: '3.6.2',
      toolCache: path.join(root, 'cache'),
      cocosConfig: { macosUrl: 'https://example.test/cocos.zip' },
      download: async (_url, destination) => fs.writeFileSync(destination, 'zip-fixture'),
      extract: async () => ({ status: 1 }),
    }), /archive extraction exited with status 1/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails when the Windows Cocos installer exits nonzero', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-install-fail-'));

  try {
    await assert.rejects(() => installCocos({
      runnerOS: 'Windows',
      expectedVersion: '3.6.2',
      toolCache: path.join(root, 'cache'),
      cocosConfig: { windowsUrl: 'https://example.test/cocos.zip' },
      download: async (_url, destination) => fs.writeFileSync(destination, 'zip-fixture'),
      extract: async (_archive, destination) => {
        fs.mkdirSync(destination, { recursive: true });
        fs.writeFileSync(path.join(destination, 'CocosCreator-3.6.2-setup.exe'), 'installer');
      },
      runInstaller: async () => ({ status: 1 }),
    }), /installer exited with status 1/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails when the installed Cocos version is wrong', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-install-version-'));
  const toolCache = path.join(root, 'cache');
  const executable = path.join(toolCache, 'cocos-creator', '3.6.2', 'CocosCreator.exe');

  try {
    await assert.rejects(() => installCocos({
      runnerOS: 'Windows',
      expectedVersion: '3.6.2',
      toolCache,
      cocosConfig: { windowsUrl: 'https://example.test/cocos.zip' },
      download: async (_url, destination) => fs.writeFileSync(destination, 'zip-fixture'),
      extract: async (_archive, destination) => {
        fs.mkdirSync(destination, { recursive: true });
        fs.writeFileSync(path.join(destination, 'CocosCreator.exe'), '');
      },
      inspectVersion: () => '3.5.0',
    }), /installed Cocos Creator version 3\.5\.0 does not match 3\.6\.2/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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

test('uses python on Windows before python3 fallback', () => {
  assert.deepEqual(pythonCandidates({ platform: 'win32', env: { PYTHON: '' } }), ['python']);
});

test('falls through a missing configured Python executable', () => {
  const calls = [];
  runPythonVerifier('verify.py', 'target', 'config.json', 'version.json', {
    platform: 'win32',
    env: { PYTHON: 'missing-python' },
    spawn: (executable) => {
      calls.push(executable);
      if (executable === 'missing-python') return { error: { code: 'ENOENT' } };
      return { status: 0 };
    },
  });

  assert.deepEqual(calls, ['missing-python', 'python']);
});

test('removes temporary signing material after packaging', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vivo-signing-'));
  fs.writeFileSync(path.join(directory, 'private.pem'), 'temporary-key');
  cleanupTemporarySigningDirectory(directory);
  assert.equal(fs.existsSync(directory), false);
});
