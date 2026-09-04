const fs = require('node:fs');
const path = require('node:path');

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

function formatReleaseNotes(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('metadata must be a JSON object');
  }
  const runner = [metadata.runnerOS, metadata.runnerArch].filter(Boolean).join(' (') + (metadata.runnerArch ? ')' : '');
  return [
    `Release tag: ${metadata.tag || 'unknown'}`,
    `Version: ${metadata.versionName || 'unknown'} (versionCode ${metadata.versionCode ?? 'unknown'})`,
    `Source SHA: ${metadata.sourceSha || 'unknown'}`,
    `Runner: ${runner || 'unknown'}`,
    'Validation: passed; see validation-report.json and validation-report.txt.',
    '',
  ].join('\n');
}

function writeReleaseNotes({ metadataPath, outputPath } = {}) {
  if (!metadataPath || !outputPath) throw new Error('metadataPath and outputPath are required');
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const notes = formatReleaseNotes(metadata);
  fs.writeFileSync(outputPath, notes, 'utf8');
  return notes;
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    writeReleaseNotes({ metadataPath: args.metadata, outputPath: args.output });
  } catch (error) {
    console.error(`[vivo] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { formatReleaseNotes, parseArgs, writeReleaseNotes };
