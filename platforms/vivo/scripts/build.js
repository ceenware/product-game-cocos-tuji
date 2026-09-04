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
const { assembleArtifacts } = require('../lib/artifacts');
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

function runPythonVerifier(script, target, configPath, versionPath, {
  platform = process.platform,
  env = process.env,
  spawn = spawnSync,
  reportJson,
  reportText,
} = {}) {
  const args = [script, target, '--config', configPath, '--version-file', versionPath];
  if (reportJson) args.push('--report-json', reportJson);
  if (reportText) args.push('--report-text', reportText);
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

function revalidateArtifactChecksum(rpkPath, checksumPath) {
  const digest = crypto.createHash('sha256').update(fs.readFileSync(rpkPath)).digest('hex');
  const expected = `${digest}  ${path.basename(rpkPath)}\n`;
  const actual = fs.readFileSync(checksumPath, 'utf8');
  if (actual !== expected) throw new Error(`SHA256SUMS checksum does not match copied RPK: ${path.basename(rpkPath)}`);
  return true;
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
  const outputRpk = path.join(args.workspace, `${config.packageName}.rpk`);
  let temporarySigningDir;
  try {
    if (signingMode === 'test') {
      temporarySigningDir = path.join(args.workspace, 'sign');
      signing = generateTestCertificate(args.openssl, temporarySigningDir);
    }
    const signingResult = await packageRpk({ projectDir, config, privateKeyPath: signing.privateKey, certificatePath: signing.certificate, outputPath: outputRpk });
    const reportJson = path.join(args.workspace, 'validation-report.json');
    const reportText = path.join(args.workspace, 'validation-report.txt');
    runPythonVerifier(path.join(__dirname, 'verify-release-rpk.py'), outputRpk, configPath, args['version-file'], { reportJson, reportText });
    const checks = JSON.parse(fs.readFileSync(reportJson, 'utf8'));
    const artifactResult = assembleArtifacts({
      inputRpk: outputRpk,
      outputDir: args.artifacts,
      config,
      version,
      metadata: {
        sourceSha: args['source-sha'] || process.env.GITHUB_SHA,
        trigger: args.trigger || process.env.GITHUB_EVENT_NAME,
        runnerOS: args['runner-os'] || process.env.RUNNER_OS,
        runnerArch: args['runner-arch'] || process.env.RUNNER_ARCH,
        nodeVersion: args['node-version'] || process.env.NODE_VERSION || process.version,
        pythonVersion: args['python-version'] || process.env.PYTHON_VERSION || config.toolchain?.python,
        signingMode,
        certificateFingerprint: signingResult.certificateFingerprint,
      },
      checks,
    });
    if (artifactResult.files.length !== 5) throw new Error('vivo release artifact assembly must return exactly five files');
    revalidateArtifactChecksum(artifactResult.rpkPath, path.join(args.artifacts, 'SHA256SUMS'));
    return { outputRpk: artifactResult.rpkPath, artifacts: artifactResult.files, signingMode, version, result: signingResult };
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

module.exports = { build, cleanupTemporarySigningDirectory, generateTestCertificate, parseArgs, pythonCandidates, revalidateArtifactChecksum, runPythonVerifier };
