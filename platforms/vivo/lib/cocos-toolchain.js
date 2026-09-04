const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile, execFileSync } = require('node:child_process');

const SUPPORTED_RUNNERS = new Set(['Windows', 'macOS']);

function normalizeRunnerOS(value) {
  if (!value) return process.env.RUNNER_OS || (process.platform === 'win32' ? 'Windows' : 'macOS');
  return value;
}

function requireSupportedRunner(runnerOS) {
  if (!SUPPORTED_RUNNERS.has(runnerOS)) {
    throw new Error(`Cocos export requires a Windows or macOS runner, got ${runnerOS}`);
  }
}

function defaultCocosCandidates(runnerOS, expectedVersion, toolCache = process.env.RUNNER_TOOL_CACHE) {
  const candidates = [];
  if (toolCache) {
    const root = path.join(toolCache, 'cocos-creator', expectedVersion);
    candidates.push(...findExecutables(root, runnerOS));
  }
  if (runnerOS === 'macOS') {
    candidates.push('/Applications/CocosCreator.app/Contents/MacOS/CocosCreator');
    candidates.push(path.join(os.homedir(), 'Applications/CocosCreator.app/Contents/MacOS/CocosCreator'));
  } else {
    candidates.push(path.join(process.env.ProgramFiles || 'C:\\Program Files', 'CocosCreator', 'CocosCreator.exe'));
    candidates.push(path.join(process.env.LOCALAPPDATA || '', 'Programs', 'CocosCreator', 'CocosCreator.exe'));
    const dashboard = path.join(process.env.LOCALAPPDATA || '', 'cocos-dashboard', 'editors', expectedVersion);
    candidates.push(...findExecutables(dashboard, runnerOS));
  }
  return [...new Set(candidates)];
}

function findExecutables(root, runnerOS) {
  if (!root || !fs.existsSync(root)) return [];
  const target = runnerOS === 'macOS' ? 'CocosCreator' : 'CocosCreator.exe';
  const result = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.name === target) result.push(fullPath);
    }
  };
  visit(root);
  return result;
}

function inspectCocosVersion(file, runnerOS) {
  if (runnerOS === 'macOS') {
    const plist = path.resolve(file, '../../../Info.plist');
    try {
      return execFileSync('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', plist], { encoding: 'utf8' }).trim();
    } catch {
      return '';
    }
  }
  try {
    const script = `(Get-Item -LiteralPath '${file.replace(/'/g, "''")}').VersionInfo.ProductVersion`;
    return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function findAdapterRoot(executable, expectedVersion) {
  const appRoot = executable.endsWith('.app/Contents/MacOS/CocosCreator')
    ? path.resolve(executable, '../../../..')
    : path.dirname(executable);
  const candidates = [
    path.join(appRoot, 'Resources', expectedVersion, 'engine', 'bin', 'adapter'),
    path.join(appRoot, 'Resources', '3.6.2', 'engine', 'bin', 'adapter'),
    path.join(appRoot, 'resources', expectedVersion, 'engine', 'bin', 'adapter'),
    path.join(path.dirname(appRoot), 'resources', expectedVersion, 'engine', 'bin', 'adapter'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

async function ensureCocos({
  runnerOS: requestedRunner,
  explicitPath,
  expectedVersion = '3.6.2',
  candidates,
  toolCache,
  inspectVersion = (file) => inspectCocosVersion(file, requestedRunner),
  install,
  adapterRoot,
} = {}) {
  const runnerOS = normalizeRunnerOS(requestedRunner);
  requireSupportedRunner(runnerOS);
  const allCandidates = [...new Set([explicitPath, ...(candidates || defaultCocosCandidates(runnerOS, expectedVersion, toolCache))].filter(Boolean))];
  for (const executable of allCandidates) {
    const version = await inspectVersion(executable);
    if (version === expectedVersion) {
      return { executable, adapterRoot: adapterRoot || findAdapterRoot(executable, expectedVersion), version, installed: false };
    }
  }
  const installedExecutable = install
    ? await install({ runnerOS, expectedVersion, toolCache })
    : await installCocos({ runnerOS, expectedVersion, toolCache });
  const version = await inspectVersion(installedExecutable);
  if (version !== expectedVersion) throw new Error(`installed Cocos Creator version ${version || 'unknown'} does not match ${expectedVersion}`);
  return { executable: installedExecutable, adapterRoot: adapterRoot || findAdapterRoot(installedExecutable, expectedVersion), version, installed: true };
}

function defaultOpenSslCandidates(runnerOS) {
  if (runnerOS === 'macOS') return ['/opt/homebrew/opt/openssl@3/bin/openssl', '/usr/local/opt/openssl@3/bin/openssl', '/usr/local/bin/openssl'];
  return ['C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe', 'C:\\Program Files\\OpenSSL\\bin\\openssl.exe'];
}

function inspectOpenSslVersion(executable) {
  try {
    return execFileSync(executable, ['version'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function normalizeOpenSslVersion(version) {
  const match = String(version || '').match(/OpenSSL\s+(3\.\S+)/);
  return match ? match[1] : String(version || '');
}

async function ensureOpenSsl({ runnerOS: requestedRunner, candidates, inspectVersion = inspectOpenSslVersion, install } = {}) {
  const runnerOS = normalizeRunnerOS(requestedRunner);
  requireSupportedRunner(runnerOS);
  for (const executable of candidates || defaultOpenSslCandidates(runnerOS)) {
    const version = await inspectVersion(executable);
    if (/^OpenSSL\s+3\./.test(version)) return { executable, version: normalizeOpenSslVersion(version), installed: false };
  }
  const executable = install
    ? await install({ runnerOS })
    : await installOpenSsl(runnerOS);
  const version = await inspectVersion(executable);
  if (!/^OpenSSL\s+3\./.test(version)) throw new Error(`installed OpenSSL version ${version || 'unknown'} is not OpenSSL 3.x`);
  return { executable, version: normalizeOpenSslVersion(version), installed: true };
}

function installCocos() {
  throw new Error('Cocos Creator is not installed; provide a runner tool cache or installer configuration');
}

function installOpenSsl(runnerOS) {
  if (runnerOS === 'macOS') {
    execFileSync('brew', ['install', 'openssl@3'], { stdio: 'inherit' });
    return execFileSync('brew', ['--prefix', 'openssl@3'], { encoding: 'utf8' }).trim() + '/bin/openssl';
  }
  execFileSync('choco', ['install', 'openssl.light', '--yes', '--no-progress'], { stdio: 'inherit' });
  return 'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe';
}

function buildCocosArguments(projectRoot, buildRoot) {
  return ['--project', path.resolve(projectRoot), '--build', `platform=vivo-mini-game;debug=false;md5Cache=false;buildPath=${path.resolve(buildRoot)}`];
}

function writeGitHubOutput(values, outputPath = process.env.GITHUB_OUTPUT) {
  if (!outputPath) return;
  const lines = [
    `executable=${values.executable}`,
    `adapter_root=${values.adapterRoot}`,
    `version=${values.version}`,
    `installed=${values.installed}`,
    `openssl=${values.openssl}`,
  ];
  fs.appendFileSync(outputPath, `${lines.join('\n')}\n`);
}

module.exports = { ensureCocos, ensureOpenSsl, buildCocosArguments, writeGitHubOutput, inspectCocosVersion, inspectOpenSslVersion, normalizeOpenSslVersion };
