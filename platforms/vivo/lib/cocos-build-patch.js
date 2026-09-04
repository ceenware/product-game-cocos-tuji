const fs = require('node:fs');
const path = require('node:path');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function findExactlyOne(directory, pattern) {
  const matches = fs.readdirSync(directory).filter((name) => pattern.test(name));
  if (matches.length !== 1) {
    throw new Error(`${directory}: expected one ${pattern}, found ${matches.length}`);
  }
  return path.join(directory, matches[0]);
}

function patchCocosBuild({ buildDir, config, version }) {
  const compileConfigPath = path.join(buildDir, 'cocos.compile.config.json');
  const manifestPath = path.join(buildDir, 'src', 'manifest.json');
  const compile = readJson(compileConfigPath);

  if (compile.platform !== 'vivo-mini-game' || compile.buildEngineParam?.platform !== 'VIVO') {
    throw new Error('expected vivo-mini-game export');
  }

  const options = compile.packages?.['vivo-mini-game'];
  if (!options) throw new Error('missing packages.vivo-mini-game');

  findExactlyOne(path.join(buildDir, 'src', 'cocos-js'), /^cc(?:\.[^.]+)?\.js$/);

  Object.assign(options, {
    package: config.packageName,
    versionName: version.versionName,
    versionCode: version.versionCode,
    minPlatformVersion: config.minPlatformVersion,
  });
  if (compile.appTemplateData) compile.appTemplateData.customVersion = version.versionName;
  writeJson(compileConfigPath, compile);

  const manifest = readJson(manifestPath);
  Object.assign(manifest, {
    package: config.packageName,
    versionName: version.versionName,
    versionCode: version.versionCode,
    minPlatformVersion: config.minPlatformVersion,
  });
  writeJson(manifestPath, manifest);

  return { compileConfigPath, manifestPath };
}

module.exports = { findExactlyOne, patchCocosBuild };
