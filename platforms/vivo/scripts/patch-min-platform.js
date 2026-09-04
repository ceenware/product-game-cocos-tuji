const fs = require('node:fs');
const path = require('node:path');

const EXPECTED_QUICKGAME_VERSION = '0.2.5';
const QUICKGAME_PACKAGE_FILE = 'package.json';
const RESOURCE_PLUGIN_FILE = path.join('lib', 'plugin', 'resource-plugin.js');

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

function patchMinPlatformSource(source, minPlatformVersion) {
  const targetVersion = String(minPlatformVersion);
  if (!targetVersion) {
    throw new Error('minPlatformVersion is required');
  }
  const oldSnippet = 't=(e.quickGameCliVersion=getCliVersion(),1308)';
  const newSnippet = `t=(e.quickGameCliVersion=getCliVersion(),${targetVersion})`;
  if (source.includes(newSnippet)) {
    return source;
  }
  if (!source.includes(oldSnippet)) {
    throw new Error('missing minPlatformVersion floor anchor 1308');
  }
  return source.replace(oldSnippet, newSnippet);
}

function patchMinPlatform({ quickgameRoot, minPlatformVersion }) {
  if (!quickgameRoot) {
    throw new Error('quickgameRoot is required');
  }
  const packagePath = path.join(quickgameRoot, QUICKGAME_PACKAGE_FILE);
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  if (packageJson.version !== EXPECTED_QUICKGAME_VERSION) {
    throw new Error(`expected quickgame-cli ${EXPECTED_QUICKGAME_VERSION}, found ${packageJson.version || 'unknown'}`);
  }

  const pluginPath = path.join(quickgameRoot, RESOURCE_PLUGIN_FILE);
  const source = fs.readFileSync(pluginPath, 'utf8');
  const patched = patchMinPlatformSource(source, minPlatformVersion);
  if (patched !== source) {
    fs.writeFileSync(pluginPath, patched);
  }
  return { pluginPath, patched: patched !== source };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = patchMinPlatform({
    quickgameRoot: args['quickgame-root'],
    minPlatformVersion: args['min-platform-version'],
  });
  console.log(`[vivo] quickgame-cli minPlatformVersion floor ${result.patched ? 'patched' : 'already patched'} to ${args['min-platform-version']}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[vivo] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { patchMinPlatform, patchMinPlatformSource, parseArgs };
