const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { assembleArtifacts, formatValidationReport } = require('../lib/artifacts');
const { build, revalidateArtifactChecksum } = require('../scripts/build');
const { spawnSync: runNode } = require('node:child_process');

const config = require('../release.json');
const version = { versionName: '1.0.11', versionCode: 12, tag: 'vivo-v1.0.11' };

function makeInput() {
  const inputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vivo-artifact-input-'));
  const inputRpk = path.join(inputDir, 'input.rpk');
  fs.writeFileSync(inputRpk, Buffer.from('signed-rpk-fixture'));
  return { inputDir, inputRpk };
}

function makeOptions(outputDir, inputRpk, metadata = {}, checks = []) {
  return {
    inputRpk,
    outputDir,
    config,
    version,
    metadata: {
      sourceSha: 'abc123',
      trigger: 'workflow_dispatch',
      runnerOS: 'macOS',
      runnerArch: 'X64',
      nodeVersion: '18.20.8',
      pythonVersion: '3.11',
      signingMode: 'release',
      certificateFingerprint: 'AA:BB',
      builtAt: '2026-09-04T12:00:00.000Z',
      ...metadata,
    },
    checks: checks.length ? checks : [{ name: 'outer-size', ok: true, actual: 1024 }],
  };
}

function cleanup(...directories) {
  for (const directory of directories) fs.rmSync(directory, { recursive: true, force: true });
}

test('assembles the exact vivo release asset set', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vivo-artifacts-'));
  const { inputDir, inputRpk } = makeInput();

  try {
    const result = assembleArtifacts(makeOptions(outputDir, inputRpk));
    const rpkName = 'com.yongzhe.huoxiantuwei.vivominigame-v1.0.11.rpk';
    assert.deepEqual(result.files.map((file) => path.basename(file)).sort(), [
      'SHA256SUMS',
      'build-metadata.json',
      rpkName,
      'validation-report.json',
      'validation-report.txt',
    ]);
    const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(outputDir, rpkName))).digest('hex');
    assert.equal(fs.readFileSync(path.join(outputDir, 'SHA256SUMS'), 'utf8'), `${digest}  ${rpkName}\n`);
  } finally {
    cleanup(outputDir, inputDir);
  }
});

test('writes stable public metadata and validation reports with trailing newlines', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vivo-artifacts-'));
  const secondOutputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vivo-artifacts-'));
  const { inputDir, inputRpk } = makeInput();
  const metadata = {
    sourceSha: 'abc123',
    trigger: 'workflow_dispatch',
    runnerOS: 'macOS',
    runnerArch: 'X64',
    nodeVersion: '18.20.8',
    pythonVersion: '3.11',
    signingMode: 'release',
    certificateFingerprint: 'AA:BB',
    builtAt: '2026-09-04T12:00:00.000Z',
    privateKeyPath: '/runner/temp/private.pem',
    certificateContents: 'PRIVATE-CERTIFICATE-CONTENTS',
  };
  const checks = [{ name: 'outer-size', ok: true, actual: 1024 }];

  try {
    assembleArtifacts(makeOptions(outputDir, inputRpk, metadata, checks));
    assembleArtifacts(makeOptions(secondOutputDir, inputRpk, Object.fromEntries(Object.entries(metadata).reverse()), checks));
    const metadataText = fs.readFileSync(path.join(outputDir, 'build-metadata.json'), 'utf8');
    const metadataJson = JSON.parse(metadataText);
    assert.deepEqual(Object.keys(metadataJson), [
      'builtAt',
      'certificateFingerprint',
      'cocosVersion',
      'nodeVersion',
      'platform',
      'pythonVersion',
      'runnerArch',
      'runnerOS',
      'signingMode',
      'sourceSha',
      'tag',
      'trigger',
      'versionCode',
      'versionName',
    ]);
    assert.equal(metadataText.endsWith('\n'), true);
    assert.equal(metadataText, fs.readFileSync(path.join(secondOutputDir, 'build-metadata.json'), 'utf8'));
    assert.equal(metadataText.includes('PRIVATE-CERTIFICATE-CONTENTS'), false);
    assert.equal(metadataText.includes('/runner/temp/private.pem'), false);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(outputDir, 'validation-report.json'), 'utf8')), checks);
    assert.equal(fs.readFileSync(path.join(outputDir, 'validation-report.txt'), 'utf8'), '[outer-size] PASS: actual=1024\n');
  } finally {
    cleanup(outputDir, secondOutputDir, inputDir);
  }
});

test('keeps an empty validation report newline-terminated', () => {
  assert.equal(formatValidationReport([]), '\n');
});

test('revalidates the copied RPK against SHA256SUMS', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vivo-checksum-'));
  const rpkPath = path.join(directory, 'release.rpk');
  const checksumPath = path.join(directory, 'SHA256SUMS');
  fs.writeFileSync(rpkPath, Buffer.from('signed-rpk-fixture'));
  const digest = crypto.createHash('sha256').update(fs.readFileSync(rpkPath)).digest('hex');

  try {
    fs.writeFileSync(checksumPath, `${digest}  release.rpk\n`);
    assert.doesNotThrow(() => revalidateArtifactChecksum(rpkPath, checksumPath));
    fs.writeFileSync(checksumPath, `${'0'.repeat(64)}  release.rpk\n`);
    assert.throws(
      () => revalidateArtifactChecksum(rpkPath, checksumPath),
      /SHA256SUMS checksum does not match copied RPK/,
    );
  } finally {
    cleanup(directory);
  }
});

test('writes public release notes from metadata only', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vivo-notes-'));
  const metadataPath = path.join(directory, 'build-metadata.json');
  const outputPath = path.join(directory, 'release-notes.txt');
  const script = path.join(__dirname, '..', 'scripts', 'write-release-notes.js');
  fs.writeFileSync(metadataPath, `${JSON.stringify({
    tag: 'vivo-v1.0.11',
    versionName: '1.0.11',
    versionCode: 12,
    sourceSha: 'abc123',
    runnerOS: 'macOS',
    runnerArch: 'X64',
  })}\n`);

  try {
    const result = spawnSync(process.execPath, [script, '--metadata', metadataPath, '--output', outputPath], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(outputPath, 'utf8'), [
      'Release tag: vivo-v1.0.11',
      'Version: 1.0.11 (versionCode 12)',
      'Source SHA: abc123',
      'Runner: macOS (X64)',
      'Validation: passed; see validation-report.json and validation-report.txt.',
      '',
    ].join('\n'));
  } finally {
    cleanup(directory);
  }
});

test('writes build metadata through the CLI without private fields', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vivo-metadata-'));
  const configPath = path.join(directory, 'release.json');
  const versionPath = path.join(directory, 'version.json');
  const metadataPath = path.join(directory, 'metadata.json');
  const outputPath = path.join(directory, 'build-metadata.json');
  const script = path.join(__dirname, '..', 'scripts', 'write-build-metadata.js');
  fs.writeFileSync(configPath, JSON.stringify(config));
  fs.writeFileSync(versionPath, JSON.stringify(version));
  fs.writeFileSync(metadataPath, JSON.stringify({
    sourceSha: 'abc123',
    signingMode: 'release',
    privateKeyPath: '/runner/temp/private.pem',
  }));

  try {
    const result = runNode(process.execPath, [
      script,
      '--config', configPath,
      '--version-file', versionPath,
      '--metadata', metadataPath,
      '--output', outputPath,
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const output = fs.readFileSync(outputPath, 'utf8');
    assert.equal(JSON.parse(output).sourceSha, 'abc123');
    assert.equal(output.includes('privateKeyPath'), false);
    assert.equal(output.endsWith('\n'), true);
  } finally {
    cleanup(directory);
  }
});

test('assembles artifacts only after final verification and cleans test signing files', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vivo-build-integration-'));
  const projectRoot = path.join(directory, 'project');
  const workspace = path.join(directory, 'workspace');
  const artifacts = path.join(directory, 'artifacts');
  const versionPath = path.join(directory, 'version.json');
  const configPath = path.join(__dirname, '..', 'release.json');
  const order = [];
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.writeFileSync(versionPath, `${JSON.stringify(version)}\n`);

  try {
    const result = await build({
      'project-root': projectRoot,
      workspace,
      artifacts,
      'version-file': versionPath,
      config: configPath,
      cocos: 'cocos-fixture',
      'adapter-root': path.join(directory, 'adapter'),
      openssl: 'openssl-fixture',
      'signing-mode': 'test',
      dependencies: {
        spawn: () => {
          order.push('cocos');
          fs.mkdirSync(path.join(workspace, 'build', 'vivo-mini-game'), { recursive: true });
          return { status: 0 };
        },
        patchCocosBuild: () => order.push('patch-cocos'),
        patchRuntimeProject: () => order.push('patch-runtime'),
        patchMinPlatform: () => order.push('patch-cli'),
        generateTestCertificate: (openssl, signingDirectory) => {
          order.push('certificate');
          fs.mkdirSync(signingDirectory, { recursive: true });
          const privateKey = path.join(signingDirectory, 'private.pem');
          const certificate = path.join(signingDirectory, 'certificate.pem');
          fs.writeFileSync(privateKey, 'key');
          fs.writeFileSync(certificate, 'certificate');
          return { privateKey, certificate };
        },
        packageRpk: async ({ outputPath }) => {
          order.push('package');
          fs.writeFileSync(outputPath, 'signed-rpk');
          return { outputPath, certificateFingerprint: 'AA:BB' };
        },
        runPythonVerifier: (_script, _target, _config, _version, options = {}) => {
          order.push(options.reportJson ? 'verify-final' : 'verify-cocos');
          if (options.reportJson) fs.writeFileSync(options.reportJson, '[{"check":"rpk","ok":true,"message":"verified"}]');
        },
      },
    });

    assert.deepEqual(order, ['cocos', 'patch-cocos', 'verify-cocos', 'patch-runtime', 'patch-cli', 'certificate', 'package', 'verify-final']);
    assert.equal(result.artifacts.length, 5);
    assert.deepEqual(result.artifacts.map((file) => path.basename(file)).sort(), [
      'SHA256SUMS',
      'build-metadata.json',
      'com.yongzhe.huoxiantuwei.vivominigame-v1.0.11.rpk',
      'validation-report.json',
      'validation-report.txt',
    ]);
    assert.equal(fs.existsSync(path.join(workspace, 'sign')), false);
    assert.doesNotThrow(() => revalidateArtifactChecksum(
      path.join(artifacts, 'com.yongzhe.huoxiantuwei.vivominigame-v1.0.11.rpk'),
      path.join(artifacts, 'SHA256SUMS'),
    ));
  } finally {
    cleanup(directory);
  }
});
