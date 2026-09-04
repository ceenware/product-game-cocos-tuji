const fs = require('node:fs');

const { loadReleaseConfig } = require('../lib/config');
const { patchRuntimeProject } = require('../lib/runtime-patches');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) {
      throw new Error(`unexpected argument: ${key}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`missing value for ${key}`);
    }
    args[key.slice(2)] = value;
    index += 1;
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadReleaseConfig(args.config);
  const version = readJson(args['version-file']);
  const result = patchRuntimeProject({
    projectDir: args['project-dir'],
    adapterRoot: args['adapter-root'],
    config,
    version,
  });
  console.log(JSON.stringify(result));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[vivo] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { main, parseArgs, readJson };
