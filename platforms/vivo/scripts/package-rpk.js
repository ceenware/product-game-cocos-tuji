const fs = require('node:fs');
const path = require('node:path');

const compile = require('quickgame-cli/lib/commands/compile');
const { signRpkSet, expectedArchiveNames } = require('../lib/rpk-signing');

function ensureArchives(distTempDir, config) {
  for (const name of [...expectedArchiveNames(config), `${config.packageName}.rpk`]) {
    const filePath = path.join(distTempDir, name);
    if (!fs.existsSync(filePath)) throw new Error(`missing compiled archive: ${filePath}`);
  }
}

async function packageRpk({ projectDir, config, privateKeyPath, certificatePath, outputPath, compileFn = compile }) {
  if (!projectDir || !config) throw new Error('projectDir and config are required');
  const options = {
    cocosWxGame: true,
    disableSubpackages: false,
    disableStreamPack: false,
    includeFileExt: '.pem,.pkm,.webp',
  };
  await compileFn(options, 'prod', projectDir);
  const distTempDir = path.join(projectDir, 'dist_temp');
  ensureArchives(distTempDir, config);
  return signRpkSet({ distTempDir, config, privateKeyPath, certificatePath, outputPath });
}

module.exports = { ensureArchives, packageRpk };
