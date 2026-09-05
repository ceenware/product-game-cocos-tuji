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
  if (!verifyRpkSignature(buffer, new crypto.X509Certificate(readPem(certificate)).publicKey)) {
    throw new Error('RPK signature does not verify with the supplied certificate');
  }
  return true;
}

function verifyRpkSignature(buffer, publicKey) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0 || eocd + 22 > buffer.length) return false;
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (centralOffset < 16 || centralOffset > buffer.length) return false;
  const magic = centralOffset - 16;
  if (!buffer.subarray(magic, magic + 16).equals(Buffer.from('RPK Sig Block 42'))) return false;
  const blockSize = buffer.readUInt32LE(magic - 8);
  const start = magic - blockSize + 8;
  if (start < 0 || start + 8 > magic || buffer.readUInt32LE(start) !== blockSize) return false;

  const sectionDigest = (sectionStart, sectionEnd) => {
    if (sectionStart < 0 || sectionEnd < sectionStart || sectionEnd > buffer.length) return null;
    const section = Buffer.alloc(5 + sectionEnd - sectionStart);
    section[0] = 0xa5;
    section.writeInt32LE(sectionEnd - sectionStart, 1);
    buffer.copy(section, 5, sectionStart, sectionEnd);
    return crypto.createHash('sha256').update(section).digest();
  };
  const headerDigest = sectionDigest(0, start);
  const centralDigest = sectionDigest(centralOffset, eocd);
  const originalFooter = Buffer.from(buffer.subarray(eocd));
  if (originalFooter.length < 20) return false;
  originalFooter.writeUInt32LE(start, 16);
  const footerDigest = crypto.createHash('sha256').update(Buffer.concat([
    Buffer.from([0xa5]),
    (() => { const size = Buffer.alloc(4); size.writeInt32LE(originalFooter.length); return size; })(),
    originalFooter,
  ])).digest();
  if (!headerDigest || !centralDigest || !footerDigest) return false;
  const sectionDigestList = Buffer.alloc(5 + 3 * 32);
  sectionDigestList[0] = 0x5a;
  sectionDigestList.writeInt32LE(3, 1);
  headerDigest.copy(sectionDigestList, 5);
  centralDigest.copy(sectionDigestList, 37);
  footerDigest.copy(sectionDigestList, 69);
  const expectedSectionDigest = crypto.createHash('sha256').update(sectionDigestList).digest();

  let offset = start + 8;
  while (offset + 16 <= magic) {
    const valueBlockSize = buffer.readUInt32LE(offset);
    const id = buffer.readUInt32LE(offset + 8);
    const valueSize = buffer.readUInt32LE(offset + 12);
    const valueStart = offset + 16;
    if (valueStart + valueSize > magic) return false;
    if (id === 16777473 && valueSize >= 16) {
      const signedDataSize = buffer.readUInt32LE(valueStart + 4);
      const signedDataStart = valueStart + 8;
      const signaturesSizeOffset = signedDataStart + signedDataSize;
      if (signaturesSizeOffset + 16 > valueStart + valueSize) return false;
      const signedData = buffer.subarray(signedDataStart, signaturesSizeOffset);
      if (signedData.length < 16 || signedData.readUInt32LE(4) !== 40 || signedData.readUInt32LE(8) !== 259 || signedData.readUInt32LE(12) !== 32) return false;
      if (!signedData.subarray(16, 48).equals(expectedSectionDigest)) return false;
      const signatureItem = signaturesSizeOffset + 4;
      const signatureId = buffer.readUInt32LE(signatureItem + 4);
      const signatureLength = buffer.readUInt32LE(signatureItem + 8);
      const signatureStart = signatureItem + 12;
      if (signatureId !== 259 || signatureStart + signatureLength > valueStart + valueSize) return false;
      return crypto.verify(
        'RSA-SHA256',
        signedData,
        publicKey,
        buffer.subarray(signatureStart, signatureStart + signatureLength),
      );
    }
    if (valueBlockSize < 8 || offset + 8 + valueBlockSize > magic) return false;
    offset += 8 + valueBlockSize;
  }
  return false;
}

function expectedArchiveNames(config) {
  if (!config || !config.packageName || !Array.isArray(config.subpackages)) {
    throw new Error('config.packageName and config.subpackages are required');
  }
  return ['main.rpk', ...config.subpackages.map((name) => `usr_${name}.rpk`)];
}

function findFullPackagePath(distTempDir, config) {
  const candidates = [
    `${config.packageName}.rpk`,
    `${config.packageName}.release.rpk`,
  ];
  const fullPackageName = candidates.find((name) => fs.existsSync(path.join(distTempDir, name)));
  if (!fullPackageName) {
    throw new Error(`missing compiled full package in ${distTempDir}: ${candidates.join(' or ')}`);
  }
  return path.join(distTempDir, fullPackageName);
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

  const fullPackagePath = findFullPackagePath(distTempDir, config);
  const fullEntries = await readEntries(fullPackagePath);
  const manifestEntry = fullEntries.find((entry) => entry.name === 'manifest.json');
  if (!manifestEntry) throw new Error(`compiled full package is missing manifest.json: ${fullPackagePath}`);
  const signedFull = await signPackage([manifestEntry], privateKey, certificate);
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
  findFullPackagePath,
  signRpkSet,
  verifyRpkSignature,
};
