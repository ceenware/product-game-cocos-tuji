const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const JSZip = require('jszip');

const { assertKeyMatchesCertificate, assertSignedByCertificate, signRpkSet, verifyRpkSignature } = require('../lib/rpk-signing');
const { parseArgs } = require('../scripts/sign-rpk');
const { packageRpk } = require('../scripts/package-rpk');

const openssl = execFileSync('sh', ['-c', 'command -v openssl'], { encoding: 'utf8' }).trim();
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vivo-signing-'));
const keyA = path.join(root, 'key-a.pem');
const certA = path.join(root, 'cert-a.pem');
const keyB = path.join(root, 'key-b.pem');
const certB = path.join(root, 'cert-b.pem');
const distTempDir = path.join(root, 'dist_temp');
const config = { packageName: 'com.example.vivo', subpackages: ['AudioAssets', 'Game'] };

function makeZip(entries) {
  const zip = new JSZip();
  for (const [name, data] of Object.entries(entries)) zip.file(name, data);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function pemToDer(filePath) {
  const pem = fs.readFileSync(filePath, 'utf8');
  return Buffer.from(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64');
}

function generatePair(keyPath, certPath, cn) {
  execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', `/CN=${cn}`, '-keyout', keyPath, '-out', certPath], { stdio: 'ignore' });
}

test.before(async () => {
  generatePair(keyA, certA, 'vivo-release-test-a');
  generatePair(keyB, certB, 'vivo-release-test-b');
  fs.mkdirSync(distTempDir, { recursive: true });
  const names = ['main.rpk', 'usr_AudioAssets.rpk', 'usr_Game.rpk', `${config.packageName}.rpk`];
  for (const name of names) {
    const data = await makeZip({ 'manifest.json': '{}', 'payload.js': `content-${name}` });
    fs.writeFileSync(path.join(distTempDir, name), data);
  }
});

test('rejects a mismatched private key and certificate', () => {
  assert.throws(() => assertKeyMatchesCertificate(keyA, fs.readFileSync(certB)), /do not match/);
});

test('parses verify as a boolean CLI flag', () => {
  assert.deepEqual(parseArgs(['--verify', '--rpk', 'release.rpk', '--certificate', 'certificate.pem']), {
    verify: true,
    rpk: 'release.rpk',
    certificate: 'certificate.pem',
  });
});

test('passes the temporary project path to quickgame compile', async () => {
  let compileArguments;
  const result = await packageRpk({
    projectDir: root,
    config,
    privateKeyPath: keyA,
    certificatePath: certA,
    compileFn: async (...args) => { compileArguments = args; },
  });
  assert.equal(compileArguments[2], root);
  assert.equal(Buffer.isBuffer(result.buffer), true);
});

test('signs configured inner packages and embeds the test certificate', async () => {
  const result = await signRpkSet({ distTempDir, config, privateKeyPath: keyA, certificatePath: certA });
  assert.equal(result.buffer.includes(Buffer.from('RPK Sig Block 42')), true);
  assert.equal(result.buffer.includes(pemToDer(certA)), true);
  assert.match(result.certificateFingerprint, /^([A-F0-9]{2}:){31}[A-F0-9]{2}$/);
  assert.doesNotThrow(() => assertSignedByCertificate(result.buffer, fs.readFileSync(certA)));
  assert.equal(verifyRpkSignature(result.buffer, new (require('node:crypto').X509Certificate)(fs.readFileSync(certA)).publicKey), true);
  const tampered = Buffer.from(result.buffer);
  const eocd = tampered.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  tampered[tampered.readUInt32LE(eocd + 16) + 20] ^= 1;
  assert.throws(() => assertSignedByCertificate(tampered, fs.readFileSync(certA)), /signature does not verify/);
});
