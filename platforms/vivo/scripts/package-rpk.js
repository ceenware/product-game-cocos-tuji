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
  const outputDirectories = [path.join(projectDir, 'dist_temp'), path.join(projectDir, 'dist')];
  const distTempDir = outputDirectories.find((directory) => {
    if (!fs.existsSync(directory)) return false;
    return [...expectedArchiveNames(config), `${config.packageName}.rpk`].every((name) => fs.existsSync(path.join(directory, name)));
  });
  if (!distTempDir) {
    throw new Error(`compiled output must contain configured archives in ${outputDirectories.join(' or ')}`);
  }
  return signRpkSet({ distTempDir, config, privateKeyPath, certificatePath, outputPath });
}

module.exports = { ensureArchives, packageRpk };
