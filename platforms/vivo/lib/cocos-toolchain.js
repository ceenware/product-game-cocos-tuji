const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { execFileSync, spawnSync } = require('node:child_process');

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

function macosInfoPlistPath(file) {
  return path.join(path.dirname(path.dirname(file)), 'Info.plist');
}

function inspectCocosVersion(file, runnerOS, execFileSyncImpl = execFileSync) {
  if (runnerOS === 'macOS') {
    const plist = macosInfoPlistPath(file);
    try {
      return execFileSyncImpl('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', plist], { encoding: 'utf8' }).trim();
    } catch {
      return '';
    }
  }
  try {
    const script = `(Get-Item -LiteralPath '${file.replace(/'/g, "''")}').VersionInfo.ProductVersion`;
    return execFileSyncImpl('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function findAdapterRoot(executable, expectedVersion) {
  const isMacApp = /\.app[\\/]Contents[\\/]MacOS[\\/]CocosCreator$/.test(executable);
  const contentsRoot = isMacApp
    ? path.dirname(path.dirname(executable))
    : path.dirname(executable);
  const resourceRoots = [
    path.join(contentsRoot, 'Resources'),
    path.join(contentsRoot, 'resources'),
    path.join(path.dirname(contentsRoot), 'Resources'),
    path.join(path.dirname(contentsRoot), 'resources'),
  ];
  const candidates = [];
  for (const resourceRoot of resourceRoots) {
    candidates.push(
      path.join(resourceRoot, expectedVersion, 'engine', 'bin', 'adapter'),
      path.join(resourceRoot, '3.6.2', 'engine', 'bin', 'adapter'),
      path.join(resourceRoot, 'resources', expectedVersion, 'engine', 'bin', 'adapter'),
      path.join(resourceRoot, 'resources', '3.6.2', 'engine', 'bin', 'adapter'),
      path.join(resourceRoot, 'resources', '3d', 'engine', 'bin', 'adapter'),
    );
  }
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

async function ensureCocos({
  runnerOS: requestedRunner,
  explicitPath,
  expectedVersion = '3.6.2',
  candidates,
  toolCache,
  inspectVersion,
  install,
  adapterRoot,
  config,
  cocosConfig,
  ...dependencies
} = {}) {
  const runnerOS = normalizeRunnerOS(requestedRunner);
  requireSupportedRunner(runnerOS);
  const inspect = inspectVersion || ((file) => inspectCocosVersion(file, runnerOS));
  const allCandidates = [...new Set([explicitPath, ...(candidates || defaultCocosCandidates(runnerOS, expectedVersion, toolCache))].filter(Boolean))];
  for (const executable of allCandidates) {
    const version = await inspect(executable);
    if (version === expectedVersion) {
      return { executable, adapterRoot: adapterRoot || findAdapterRoot(executable, expectedVersion), version, installed: false };
    }
  }
  const installedExecutable = install
    ? await install({ runnerOS, expectedVersion, toolCache, cocosConfig: cocosConfig || config?.cocos, inspectVersion: inspect })
    : await installCocos({ runnerOS, expectedVersion, toolCache, cocosConfig: cocosConfig || config?.cocos, inspectVersion: inspect, ...dependencies });
  const version = await inspect(installedExecutable);
  if (version !== expectedVersion) throw new Error(`installed Cocos Creator version ${version || 'unknown'} does not match ${expectedVersion}`);
  return { executable: installedExecutable, adapterRoot: adapterRoot || findAdapterRoot(installedExecutable, expectedVersion), version, installed: true };
}

function findFilesNamed(root, filename, join = path.join) {
  if (!root || !fs.existsSync(root)) return [];
  const result = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.name.toLowerCase() === filename.toLowerCase()) result.push(fullPath);
    }
  };
  visit(root);
  return result;
}

function winPath(...parts) {
  return path.win32.join(...parts);
}

function defaultOpenSslCandidates(runnerOS, env = process.env) {
  if (runnerOS === 'macOS') return ['/opt/homebrew/opt/openssl@3/bin/openssl', '/usr/local/opt/openssl@3/bin/openssl', '/usr/local/bin/openssl'];

  const programFiles = env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const programW6432 = env.ProgramW6432 || programFiles;
  const chocolatey = env.ChocolateyInstall || 'C:\\ProgramData\\chocolatey';
  const candidates = [
    winPath(programW6432, 'OpenSSL-Win64', 'bin', 'openssl.exe'),
    winPath(programFiles, 'OpenSSL-Win64', 'bin', 'openssl.exe'),
    winPath(programFiles, 'OpenSSL', 'bin', 'openssl.exe'),
    winPath(programFilesX86, 'OpenSSL-Win32', 'bin', 'openssl.exe'),
    winPath(chocolatey, 'bin', 'openssl.exe'),
    winPath(chocolatey, 'lib', 'openssl.light', 'tools', 'openssl.exe'),
    winPath(programW6432, 'Git', 'usr', 'bin', 'openssl.exe'),
    winPath(programFiles, 'Git', 'usr', 'bin', 'openssl.exe'),
    winPath(programFilesX86, 'Git', 'usr', 'bin', 'openssl.exe'),
    winPath(env.LOCALAPPDATA || 'C:\\Users\\runner\\AppData\\Local', 'Programs', 'Git', 'usr', 'bin', 'openssl.exe'),
  ];
  const searchRoots = [
    chocolatey,
    winPath(chocolatey, 'lib', 'openssl.light'),
    winPath(chocolatey, 'tools'),
    winPath(programW6432, 'Git'),
    winPath(programFiles, 'Git'),
    winPath(programFilesX86, 'Git'),
  ];
  for (const root of searchRoots) candidates.push(...findFilesNamed(root, 'openssl.exe', path.win32.join));
  return [...new Set(candidates)];
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

async function ensureOpenSsl({ runnerOS: requestedRunner, candidates, inspectVersion = inspectOpenSslVersion, install, ...dependencies } = {}) {
  const runnerOS = normalizeRunnerOS(requestedRunner);
  requireSupportedRunner(runnerOS);
  for (const executable of candidates || defaultOpenSslCandidates(runnerOS)) {
    const version = await inspectVersion(executable);
    if (/^OpenSSL\s+3\./.test(version)) return { executable, version: normalizeOpenSslVersion(version), installed: false };
  }
  const executable = install
    ? await install({ runnerOS, candidates, inspectVersion })
    : await installOpenSsl(runnerOS, { candidates, inspectVersion, ...dependencies });
  const version = await inspectVersion(executable);
  if (!/^OpenSSL\s+3\./.test(version)) throw new Error(`installed OpenSSL version ${version || 'unknown'} is not OpenSSL 3.x`);
  return { executable, version: normalizeOpenSslVersion(version), installed: true };
}

function shellQuotePowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function assertProcessSuccess(result, label) {
  if (result?.error) throw result.error;
  if (typeof result?.status === 'number' && result.status !== 0) throw new Error(`${label} exited with status ${result.status}`);
}

function defaultExtract(archivePath, destination, runnerOS, execFileSyncImpl = execFileSync) {
  fs.mkdirSync(destination, { recursive: true });
  if (runnerOS === 'macOS') {
    return execFileSyncImpl('ditto', ['-x', '-k', archivePath, destination], { stdio: 'inherit' });
  }
  const command = `$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath ${shellQuotePowerShell(archivePath)} -DestinationPath ${shellQuotePowerShell(destination)} -Force`;
  return execFileSyncImpl('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], { stdio: 'inherit' });
}

function defaultRunInstaller(installerPath, args, spawn = spawnSync) {
  const result = spawn(installerPath, args, { stdio: 'inherit' });
  assertProcessSuccess(result, 'Cocos Creator installer');
  return result;
}

function downloadFile(url, destination, redirects = 0) {
  if (redirects > 5) return Promise.reject(new Error(`too many redirects downloading ${url}`));
  const transport = String(url).startsWith('https:') ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        downloadFile(new URL(response.headers.location, url).toString(), destination, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`download failed with HTTP ${response.statusCode}`));
        return;
      }
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const output = fs.createWriteStream(destination);
      response.pipe(output);
      output.on('finish', () => output.close(resolve));
      output.on('error', (error) => {
        fs.rmSync(destination, { force: true });
        reject(error);
      });
    });
    request.on('error', (error) => {
      fs.rmSync(destination, { force: true });
      reject(error);
    });
  });
}

function findInstallerFiles(root) {
  const files = [];
  const visit = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (/\.(?:exe|msi)$/i.test(entry.name) && !/^CocosCreator\.exe$/i.test(entry.name)) files.push(fullPath);
    }
  };
  visit(root);
  return files.sort((left, right) => {
    const score = (file) => /cocos?.*creator|creator/i.test(path.basename(file)) ? 0 : 1;
    return score(left) - score(right) || left.localeCompare(right);
  });
}

function findMacAppRoot(executable) {
  const marker = `${path.sep}Contents${path.sep}MacOS${path.sep}CocosCreator`;
  const index = executable.lastIndexOf(marker);
  return index >= 0 ? executable.slice(0, index) : path.dirname(path.dirname(path.dirname(executable)));
}

async function findMatchingCocosExecutable(root, runnerOS, expectedVersion, inspectVersion) {
  const candidates = findExecutables(root, runnerOS);
  if (!candidates.length) throw new Error(`Cocos Creator archive did not contain ${runnerOS === 'macOS' ? 'CocosCreator.app' : 'CocosCreator.exe'}`);
  let observedVersion = '';
  for (const executable of candidates) {
    const version = await inspectVersion(executable);
    if (version === expectedVersion) return executable;
    if (!observedVersion && version) observedVersion = version;
  }
  throw new Error(`installed Cocos Creator version ${observedVersion || 'unknown'} does not match ${expectedVersion}`);
}

async function installCocos({
  runnerOS,
  expectedVersion,
  toolCache,
  cocosConfig,
  config,
  inspectVersion = (file) => inspectCocosVersion(file, runnerOS),
  download = downloadFile,
  extract = defaultExtract,
  runInstaller = defaultRunInstaller,
  execFileSyncImpl = execFileSync,
} = {}) {
  requireSupportedRunner(runnerOS);
  const url = runnerOS === 'macOS' ? (cocosConfig || config?.cocos)?.macosUrl : (cocosConfig || config?.cocos)?.windowsUrl;
  if (!url) throw new Error(`missing Cocos Creator ${runnerOS} download URL`);
  const cacheRoot = path.resolve(toolCache || process.env.RUNNER_TOOL_CACHE || path.join(os.tmpdir(), 'cocos-release-tools'));
  const versionRoot = path.join(cacheRoot, 'cocos-creator', expectedVersion);
  fs.mkdirSync(cacheRoot, { recursive: true });
  const temporaryRoot = fs.mkdtempSync(path.join(cacheRoot, `.cocos-${expectedVersion}-`));
  const archivePath = path.join(temporaryRoot, 'cocos-creator.zip');
  const extractionRoot = path.join(temporaryRoot, 'extracted');

  try {
    await download(url, archivePath);
    if (!fs.existsSync(archivePath) || fs.statSync(archivePath).size === 0) throw new Error('Cocos Creator download is empty');
    const extractionResult = await extract(archivePath, extractionRoot, runnerOS, execFileSyncImpl);
    assertProcessSuccess(extractionResult, 'Cocos Creator archive extraction');
    if (!fs.existsSync(extractionRoot) || fs.readdirSync(extractionRoot).length === 0) throw new Error('Cocos Creator archive extracted no files');

    let executable;
    if (runnerOS === 'macOS') {
      const extractedExecutable = await findMatchingCocosExecutable(extractionRoot, runnerOS, expectedVersion, inspectVersion);
      const appRoot = findMacAppRoot(extractedExecutable);
      fs.rmSync(versionRoot, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(versionRoot), { recursive: true });
      fs.cpSync(appRoot, path.join(versionRoot, path.basename(appRoot)), { recursive: true });
      executable = path.join(versionRoot, path.basename(appRoot), 'Contents', 'MacOS', 'CocosCreator');
    } else {
      const installer = findInstallerFiles(extractionRoot)[0];
      fs.rmSync(versionRoot, { recursive: true, force: true });
      fs.mkdirSync(versionRoot, { recursive: true });
      if (installer) {
        const installerArgs = /\.msi$/i.test(installer) ? ['/i', installer, '/qn', `INSTALLDIR=${versionRoot}`] : ['/S', `/D=${versionRoot}`];
        const result = await runInstaller(installer, installerArgs, runnerOS);
        assertProcessSuccess(result, 'Cocos Creator installer');
      } else {
        fs.cpSync(extractionRoot, versionRoot, { recursive: true });
      }
      executable = await findMatchingCocosExecutable(versionRoot, runnerOS, expectedVersion, inspectVersion);
    }
    return executable;
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function installOpenSsl(runnerOS, { candidates, inspectVersion = inspectOpenSslVersion, execFileSyncImpl = execFileSync } = {}) {
  if (runnerOS === 'macOS') {
    execFileSyncImpl('brew', ['install', 'openssl@3'], { stdio: 'inherit' });
    const prefix = execFileSyncImpl('brew', ['--prefix', 'openssl@3'], { encoding: 'utf8' }).trim();
    const executable = path.join(prefix, 'bin', 'openssl');
    if (!/^OpenSSL\s+3\./.test(inspectVersion(executable))) throw new Error('installed OpenSSL version is not OpenSSL 3.x');
    return executable;
  }
  execFileSyncImpl('choco', ['install', 'openssl.light', '--yes', '--no-progress'], { stdio: 'inherit' });
  const possible = [...new Set([...(candidates || []), ...defaultOpenSslCandidates(runnerOS)])];
  const executable = possible.find((candidate) => /^OpenSSL\s+3\./.test(inspectVersion(candidate)));
  if (!executable) throw new Error('OpenSSL 3.x was not found after Chocolatey installation');
  return executable;
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

module.exports = {
  ensureCocos,
  ensureOpenSsl,
  buildCocosArguments,
  writeGitHubOutput,
  inspectCocosVersion,
  macosInfoPlistPath,
  findAdapterRoot,
  defaultOpenSslCandidates,
  installCocos,
  installOpenSsl,
  inspectOpenSslVersion,
  normalizeOpenSslVersion,
};
