const fs = require('node:fs');
const path = require('node:path');

const webpack = require('webpack');
const JSZip = require('jszip');
const compile = require('quickgame-cli/lib/commands/compile');
const createWebpackConfig = require('quickgame-cli/lib/webpack-conf');
const { signRpkSet, expectedArchiveNames, findFullPackagePath } = require('../lib/rpk-signing');

function ensureArchives(distTempDir, config) {
  for (const name of expectedArchiveNames(config)) {
    const filePath = path.join(distTempDir, name);
    if (!fs.existsSync(filePath)) throw new Error(`missing compiled archive: ${filePath}`);
  }
  return findFullPackagePath(distTempDir, config);
}

function prepareQuickgameSigning(projectDir, privateKeyPath, certificatePath) {
  const signingDir = path.join(projectDir, 'sign', 'release');
  fs.mkdirSync(signingDir, { recursive: true });
  fs.copyFileSync(privateKeyPath, path.join(signingDir, 'private.pem'));
  fs.copyFileSync(certificatePath, path.join(signingDir, 'certificate.pem'));
  return signingDir;
}

async function extractCompiledOuterPackage(outerPath, outputDir, config) {
  const archive = await JSZip.loadAsync(fs.readFileSync(outerPath));
  const names = [...expectedArchiveNames(config), `${config.packageName}.rpk`];
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  for (const name of names) {
    const entry = archive.file(name);
    if (!entry) throw new Error(`compiled outer package is missing ${name}`);
    fs.writeFileSync(path.join(outputDir, name), await entry.async('nodebuffer'));
  }
  return outputDir;
}

function compileProject(options, projectDir, compileFn = compile) {
  if (compileFn !== compile) {
    return Promise.resolve(compileFn(options, 'prod', projectDir));
  }

  const { webpackConf } = createWebpackConfig(options, 'production', projectDir);
  const compiler = webpack(webpackConf);
  return new Promise((resolve, reject) => {
    compiler.run((error, stats) => {
      const finish = (closeError) => {
        if (error || closeError) {
          reject(error || closeError);
          return;
        }
        if (stats?.hasErrors()) {
          reject(new Error(stats.toString({ all: false, errors: true, errorDetails: true })));
          return;
        }
        resolve(stats);
      };
      if (typeof compiler.close === 'function') {
        compiler.close(finish);
      } else {
        finish();
      }
    });
  });
}

async function packageRpk({ projectDir, config, privateKeyPath, certificatePath, outputPath, compileFn = compile }) {
  if (!projectDir || !config) throw new Error('projectDir and config are required');
  const options = {
    cocosWxGame: true,
    disableSubpackages: false,
    disableStreamPack: false,
    includeFileExt: '.pem,.pkm,.webp',
  };
  if (compileFn === compile) {
    fs.rmSync(path.join(projectDir, 'dist'), { recursive: true, force: true });
    fs.rmSync(path.join(projectDir, 'dist_temp'), { recursive: true, force: true });
    prepareQuickgameSigning(projectDir, privateKeyPath, certificatePath);
  }
  await compileProject(options, projectDir, compileFn);
  let distTempDir = path.join(projectDir, 'dist_temp');
  if (!fs.existsSync(distTempDir)) {
    const outerPath = [
      path.join(projectDir, 'dist', `${config.packageName}.release.rpk`),
      path.join(projectDir, 'dist', `${config.packageName}.rpk`),
    ].find((filePath) => fs.existsSync(filePath));
    if (outerPath) await extractCompiledOuterPackage(outerPath, distTempDir, config);
  }
  if (!fs.existsSync(distTempDir)) distTempDir = null;
  if (distTempDir && fs.existsSync(distTempDir)) {
    try {
      ensureArchives(distTempDir, config);
    } catch {
      distTempDir = null;
    }
  }
  if (!distTempDir) {
    throw new Error(`compiled output must contain configured archives in ${path.join(projectDir, 'dist_temp')} or ${path.join(projectDir, 'dist')}`);
  }
  return signRpkSet({ distTempDir, config, privateKeyPath, certificatePath, outputPath });
}

module.exports = { compileProject, ensureArchives, extractCompiledOuterPackage, packageRpk, prepareQuickgameSigning };
