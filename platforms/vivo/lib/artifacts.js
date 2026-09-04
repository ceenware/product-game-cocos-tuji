const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { createBuildMetadata, stableJson } = require('../scripts/write-build-metadata');

const RELEASE_REPORT_NAMES = ['validation-report.json', 'validation-report.txt'];

function formatCheckMessage(check) {
  if (typeof check.message === 'string') return check.message;
  return Object.keys(check)
    .filter((key) => !['name', 'check', 'ok'].includes(key))
    .sort()
    .map((key) => `${key}=${typeof check[key] === 'string' ? check[key] : JSON.stringify(check[key])}`)
    .join(' ');
}

function formatValidationReport(checks) {
  if (!Array.isArray(checks)) throw new Error('checks must be an array');
  return checks.map((check) => {
    const name = check.name || check.check || 'unnamed';
    const status = check.ok ? 'PASS' : 'FAIL';
    const message = formatCheckMessage(check);
    return `[${name}] ${status}${message ? `: ${message}` : ''}`;
  }).join('\n') + (checks.length ? '\n' : '');
}

function assembleArtifacts({ inputRpk, outputDir, config, version, metadata = {}, checks = [] } = {}) {
  if (!inputRpk || !outputDir || !config?.packageName || !version?.versionName) {
    throw new Error('inputRpk, outputDir, config.packageName, and version.versionName are required');
  }
  const inputBuffer = fs.readFileSync(inputRpk);
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const rpkName = `${config.packageName}-v${version.versionName}.rpk`;
  const rpkPath = path.join(outputDir, rpkName);
  const checksumPath = path.join(outputDir, 'SHA256SUMS');
  const metadataPath = path.join(outputDir, 'build-metadata.json');
  const reportJsonPath = path.join(outputDir, RELEASE_REPORT_NAMES[0]);
  const reportTextPath = path.join(outputDir, RELEASE_REPORT_NAMES[1]);

  fs.writeFileSync(rpkPath, inputBuffer);
  const digest = crypto.createHash('sha256').update(inputBuffer).digest('hex');
  fs.writeFileSync(checksumPath, `${digest}  ${rpkName}\n`, 'utf8');
  fs.writeFileSync(metadataPath, stableJson(createBuildMetadata({ config, version, metadata })), 'utf8');
  fs.writeFileSync(reportJsonPath, stableJson(checks), 'utf8');
  fs.writeFileSync(reportTextPath, formatValidationReport(checks), 'utf8');

  const files = [checksumPath, metadataPath, rpkPath, reportJsonPath, reportTextPath];
  const actualFiles = fs.readdirSync(outputDir).map((name) => path.join(outputDir, name));
  if (actualFiles.length !== 5 || actualFiles.some((file) => !files.includes(file))) {
    throw new Error('vivo release artifact directory must contain exactly five files');
  }
  return { files, rpkPath, metadataPath, checks };
}

module.exports = { assembleArtifacts, formatValidationReport };
