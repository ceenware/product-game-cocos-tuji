const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const JSZip = require('jszip');
const { signZip, getBufferDigest } = require('quickgame-cli/lib/sign');

const ZIP_OPTIONS = {
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: { level: 9 },
};

function readPem(value) {
  return Buffer.isBuffer(value) ? value : fs.readFileSync(value);
}

function certificateDer(certificate) {
  const x509 = new crypto.X509Certificate(readPem(certificate));
  return Buffer.from(x509.raw);
}

function publicKeyDerFromPrivate(privateKey) {
  return crypto.createPublicKey(crypto.createPrivateKey(readPem(privateKey))).export({
    type: 'spki',
    format: 'der',
  });
}

function publicKeyDerFromCertificate(certificate) {
  return new crypto.X509Certificate(readPem(certificate)).publicKey.export({
    type: 'spki',
    format: 'der',
  });
}

function assertKeyMatchesCertificate(privateKey, certificate) {
  const privatePublic = publicKeyDerFromPrivate(privateKey);
  const certificatePublic = publicKeyDerFromCertificate(certificate);
  if (!privatePublic.equals(certificatePublic)) {
    throw new Error('private key and certificate do not match');
  }
  return true;
}

function assertSignedByCertificate(rpkBuffer, certificate) {
  const buffer = Buffer.isBuffer(rpkBuffer) ? rpkBuffer : fs.readFileSync(rpkBuffer);
  const der = certificateDer(certificate);
  if (!buffer.includes(Buffer.from('RPK Sig Block 42'))) {
    throw new Error('RPK is missing RPK Sig Block 42');
  }
  if (!buffer.includes(der)) {
    throw new Error('RPK does not embed the supplied certificate');
  }
  return true;
}

function expectedArchiveNames(config) {
  if (!config || !config.packageName || !Array.isArray(config.subpackages)) {
    throw new Error('config.packageName and config.subpackages are required');
  }
  return ['main.rpk', ...config.subpackages.map((name) => `usr_${name}.rpk`)];
}

async function readEntries(filePath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const entries = [];
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir || name === 'META-INF/CERT') continue;
    if (name.startsWith('/') || name.split('/').includes('..')) {
      throw new Error(`unsafe ZIP entry: ${name}`);
    }
    entries.push({ name, data: await entry.async('nodebuffer') });
  }
  if (entries.length === 0) {
    throw new Error(`empty unsigned archive: ${filePath}`);
  }
  return entries;
}

async function signPackage(entries, privateKey, certificate) {
  const hashZip = new JSZip();
  const digests = {};
  for (const entry of entries) {
    digests[entry.name] = getBufferDigest(entry.data).toString('hex');
  }
  hashZip.file('hash.json', JSON.stringify({ algorithm: 'SHA-256', digests }));
  const unsignedCert = await hashZip.generateAsync(ZIP_OPTIONS);
  const signedCert = signZip(
    unsignedCert,
    [{ name: 'hash.json', hash: getBufferDigest(unsignedCert) }],
    privateKey,
    certificate,
  );
  if (!Buffer.isBuffer(signedCert)) throw new Error('quickgame-cli failed to sign certificate block');

  const packageZip = new JSZip();
  for (const entry of entries) packageZip.file(entry.name, entry.data);
  packageZip.file('META-INF/CERT', signedCert);
  const unsignedPackage = await packageZip.generateAsync(ZIP_OPTIONS);
  const packageDigests = entries.map((entry) => ({
    name: entry.name,
    hash: getBufferDigest(entry.data),
  }));
  packageDigests.push({ name: 'META-INF/CERT', hash: getBufferDigest(signedCert) });
  const signedPackage = signZip(unsignedPackage, packageDigests, privateKey, certificate);
  if (!Buffer.isBuffer(signedPackage)) throw new Error('quickgame-cli failed to sign package');
  return signedPackage;
}

async function signRpkSet({ distTempDir, config, privateKeyPath, certificatePath, outputPath }) {
  if (!distTempDir || !config || !privateKeyPath || !certificatePath) {
    throw new Error('distTempDir, config, privateKeyPath, and certificatePath are required');
  }
  const privateKey = readPem(privateKeyPath);
  const certificate = readPem(certificatePath);
  assertKeyMatchesCertificate(privateKey, certificate);

  const innerNames = expectedArchiveNames(config);
  const packageName = `${config.packageName}.rpk`;
  const signedInner = new Map();
  for (const name of innerNames) {
    signedInner.set(name, await signPackage(await readEntries(path.join(distTempDir, name)), privateKey, certificate));
  }

  const fullPackagePath = path.join(distTempDir, packageName);
  const signedFull = await signPackage(await readEntries(fullPackagePath), privateKey, certificate);
  const outerZip = new JSZip();
  for (const name of innerNames) outerZip.file(name, signedInner.get(name));
  outerZip.file(packageName, signedFull);
  const unsignedOuter = await outerZip.generateAsync(ZIP_OPTIONS);
  const outerEntries = innerNames.map((name) => ({ name, hash: getBufferDigest(signedInner.get(name)) }));
  outerEntries.push({ name: packageName, hash: getBufferDigest(signedFull) });
  const signedOuter = signZip(unsignedOuter, outerEntries, privateKey, certificate);
  if (!Buffer.isBuffer(signedOuter)) throw new Error('quickgame-cli failed to sign outer package');
  assertSignedByCertificate(signedOuter, certificate);

  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, signedOuter);
  }
  const fingerprint = crypto.createHash('sha256').update(certificateDer(certificate)).digest('hex').match(/../g).join(':').toUpperCase();
  return { buffer: signedOuter, certificateFingerprint: fingerprint, outputPath };
}

module.exports = {
  assertKeyMatchesCertificate,
  assertSignedByCertificate,
  expectedArchiveNames,
  signRpkSet,
};
