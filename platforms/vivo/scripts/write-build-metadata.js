const fs = require('node:fs');

const PUBLIC_METADATA_KEYS = [
  'platform',
  'versionName',
  'versionCode',
  'tag',
  'sourceSha',
  'trigger',
  'runnerOS',
  'runnerArch',
  'cocosVersion',
  'nodeVersion',
  'pythonVersion',
  'signingMode',
  'certificateFingerprint',
  'builtAt',
];

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
}

function stableJson(value) {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

function createBuildMetadata({ config, version, metadata = {}, env = process.env, now = new Date } = {}) {
  if (!config || !version) throw new Error('config and version are required');
  const value = (key, environmentKey, fallback = null) => metadata[key] ?? env[environmentKey] ?? fallback;
  return {
    platform: 'vivo',
    versionName: version.versionName,
    versionCode: version.versionCode,
    tag: version.tag,
    sourceSha: value('sourceSha', 'GITHUB_SHA'),
    trigger: value('trigger', 'GITHUB_EVENT_NAME'),
    runnerOS: value('runnerOS', 'RUNNER_OS'),
    runnerArch: value('runnerArch', 'RUNNER_ARCH'),
    cocosVersion: config.cocos?.version || '3.6.2',
    nodeVersion: value('nodeVersion', 'NODE_VERSION', process.version),
    pythonVersion: value('pythonVersion', 'PYTHON_VERSION', config.toolchain?.python || null),
    signingMode: value('signingMode', 'SIGNING_MODE'),
    certificateFingerprint: value('certificateFingerprint', 'CERTIFICATE_FINGERPRINT'),
    builtAt: value('builtAt', 'BUILT_AT', now.toISOString()),
  };
}

function writeBuildMetadata({ config, version, metadata, outputPath, env, now } = {}) {
  if (!outputPath) throw new Error('outputPath is required');
  const value = createBuildMetadata({ config, version, metadata, env, now });
  fs.mkdirSync(require('node:path').dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, stableJson(value), 'utf8');
  return value;
}

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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = JSON.parse(fs.readFileSync(args.config, 'utf8'));
  const version = JSON.parse(fs.readFileSync(args['version-file'], 'utf8'));
  const metadata = args.metadata ? JSON.parse(fs.readFileSync(args.metadata, 'utf8')) : {};
  writeBuildMetadata({ config, version, metadata, outputPath: args.output });
}

if (require.main === module) main();

module.exports = { PUBLIC_METADATA_KEYS, createBuildMetadata, stableJson, writeBuildMetadata };
