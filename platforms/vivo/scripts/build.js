const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const { loadReleaseConfig } = require('../lib/config');
const { patchCocosBuild } = require('../lib/cocos-build-patch');
const { patchRuntimeProject } = require('../lib/runtime-patches');
const { patchMinPlatform } = require('./patch-min-platform');
const { buildCocosArguments } = require('../lib/cocos-toolchain');
const { packageRpk } = require('./package-rpk');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error(`unexpected argument: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${key}`);
    args[key.slice(2)] = value;
    index += 1;
  }
  return args;
}

function generateTestCertificate(openssl, directory) {
  fs.mkdirSync(directory, { recursive: true });
  const privateKey = path.join(directory, 'private.pem');
  const certificate = path.join(directory, 'certificate.pem');
  execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=vivo-test-release', '-keyout', privateKey, '-out', certificate], { stdio: 'ignore' });
  return { privateKey, certificate };
}

function pythonCandidates({ platform = process.platform, env = process.env } = {}) {
  return [...new Set([env.PYTHON, platform === 'win32' ? 'python' : 'python3', 'python'].filter(Boolean))];
}

function cleanupTemporarySigningDirectory(directory) {
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
}

function runPythonVerifier(script, target, configPath, versionPath, { platform = process.platform, env = process.env, spawn = spawnSync } = {}) {
  const args = [script, target, '--config', configPath, '--version-file', versionPath];
  for (const executable of pythonCandidates({ platform, env })) {
    const result = spawn(executable, args, { stdio: 'inherit' });
    if (!result.error) {
      if (result.status !== 0) throw new Error(`verification failed: ${path.basename(script)}`);
      return result;
    }
    if (result.error.code !== 'ENOENT') throw result.error;
  }
  throw new Error('Python interpreter not found');
}

async function build(options) {
  const args = options.args || options;
  const configPath = args.config || path.join(__dirname, '..', 'release.json');
  const config = loadReleaseConfig(configPath);
  const version = JSON.parse(fs.readFileSync(args['version-file'], 'utf8'));
  const signingMode = args['signing-mode'] || 'test';
  if (signingMode === 'release' && (!args['private-key'] || !args.certificate)) {
    throw new Error('release signing requires --private-key and --certificate');
  }
  fs.rmSync(args.workspace, { recursive: true, force: true });
  fs.mkdirSync(args.workspace, { recursive: true });
  const buildRoot = path.join(args.workspace, 'build');
  const cocosResult = spawnSync(args.cocos, buildCocosArguments(args['project-root'], buildRoot), { stdio: 'inherit' });
  if (cocosResult.status !== 0) throw new Error(`Cocos Creator exited with status ${cocosResult.status}`);
  const projectDir = path.join(buildRoot, 'vivo-mini-game');
  if (!fs.existsSync(projectDir)) throw new Error(`missing Cocos export: ${projectDir}`);
  patchCocosBuild({ buildDir: projectDir, config, version });
  runPythonVerifier(path.join(__dirname, 'verify-cocos-build.py'), projectDir, configPath, args['version-file']);
  patchRuntimeProject({ projectDir, adapterRoot: args['adapter-root'], config, version });
  patchMinPlatform({ quickgameRoot: path.join(__dirname, '..', 'node_modules', 'quickgame-cli'), minPlatformVersion: config.minPlatformVersion });
  let signing = { privateKey: args['private-key'], certificate: args.certificate };
  const outputRpk = path.join(args.artifacts, `${config.packageName}-unsigned.rpk`);
  fs.mkdirSync(args.artifacts, { recursive: true });
  let temporarySigningDir;
  try {
    if (signingMode === 'test') {
      temporarySigningDir = path.join(args.workspace, 'sign');
      signing = generateTestCertificate(args.openssl, temporarySigningDir);
    }
    const result = await packageRpk({ projectDir, config, privateKeyPath: signing.privateKey, certificatePath: signing.certificate, outputPath: outputRpk });
    runPythonVerifier(path.join(__dirname, 'verify-release-rpk.py'), outputRpk, configPath, args['version-file']);
    return { outputRpk, signingMode, version, result };
  } finally {
    cleanupTemporarySigningDirectory(temporarySigningDir);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await build(args);
  console.log(JSON.stringify(result));
}

if (require.main === module) main().catch((error) => {
  console.error(`[vivo] ${error.message}`);
  process.exitCode = 1;
});

module.exports = { build, cleanupTemporarySigningDirectory, generateTestCertificate, parseArgs, pythonCandidates, runPythonVerifier };
