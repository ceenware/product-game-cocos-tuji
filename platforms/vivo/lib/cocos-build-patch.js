const fs = require('node:fs');
const path = require('node:path');

function readJson(filePath) {
  const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${filePath}: expected a JSON object`);
  }
  return value;
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

function moveEntry(source, target) {
  if (!fs.existsSync(source)) throw new Error(`missing Cocos export entry: ${source}`);
  if (fs.existsSync(target)) throw new Error(`normalization target already exists: ${target}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(source, target);
}

function renameExactlyOne(directory, pattern, targetName) {
  const source = findExactlyOne(directory, pattern);
  const target = path.join(directory, targetName);
  if (source !== target) {
    if (fs.existsSync(target)) throw new Error(`normalization target already exists: ${target}`);
    fs.renameSync(source, target);
  }
  return target;
}

function jsonModuleSource(value) {
  return `module.exports = { default: ${JSON.stringify(value)} };\n`;
}

function patchNormalizedExterns(source) {
  source = source
    .replace(/src\/polyfills\.bundle(?:\.[^.]+)?\.js/g, 'src/polyfills.bundle.js')
    .replace(/src\/system\.bundle(?:\.[^.]+)?\.js/g, 'src/system.bundle.js')
    .replace(/\.\/src\/import-map(?:\.[^.]+)?\.json/g, './src/import-map.js')
    .replace(/\.\/application(?:\.[^.]+)?\.js/g, './src/application.js');

  const importMapBlock = /const importMapJson\s*=\s*ral\.getFileSystemManager\(\)\.readFileSync\([\s\S]*?\);\s*const importMap\s*=\s*JSON\.parse\(importMapJson\);/;
  if (importMapBlock.test(source)) {
    source = source.replace(importMapBlock, "const importMap = require('./src/import-map.js').default;");
  }
  return source;
}

function patchApplicationSource(source) {
  return source.replace(/this\.settingsPath\s*=\s*['"]src\/settings(?:\.[^.]+)?\.json['"]/g, "this.settingsPath = 'src/settings.json'");
}

function patchMinigameConfigSource(source) {
  return source
    .replace(/src\/src\//g, 'src/')
    .replace(/application(?:\.[^.]+)?\.js/g, 'application.js')
    .replace(/src\/polyfills\.bundle(?:\.[^.]+)?\.js/g, 'src/polyfills.bundle.js')
    .replace(/src\/system\.bundle(?:\.[^.]+)?\.js/g, 'src/system.bundle.js');
}

function patchManifestMetadata(manifest, config, version) {
  return {
    ...manifest,
    package: config.packageName,
    ...(config.displayName ? { name: config.displayName } : {}),
    versionName: version.versionName,
    versionCode: version.versionCode,
    minPlatformVersion: config.minPlatformVersion,
    subpackages: config.subpackages.map((name) => ({ name: `usr_${name}`, root: `subpackages/${name}/` })),
  };
}

function normalizeCocosExport({ buildDir, config, version }) {
  const rawSourceDir = path.join(buildDir, 'src');
  const nestedSourceDir = path.join(rawSourceDir, 'src');
  if (!fs.existsSync(nestedSourceDir)) return false;

  const rawManifestPath = path.join(rawSourceDir, 'manifest.json');
  const manifest = patchManifestMetadata(readJson(rawManifestPath), config, version);

  moveEntry(path.join(rawSourceDir, 'assets'), path.join(buildDir, 'assets'));
  for (const name of fs.readdirSync(nestedSourceDir)) {
    moveEntry(path.join(nestedSourceDir, name), path.join(rawSourceDir, name));
  }
  fs.rmSync(nestedSourceDir, { recursive: true, force: true });

  const applicationPath = renameExactlyOne(rawSourceDir, /^application(?:\.[^.]+)?\.js$/, 'application.js');
  const importMapPath = renameExactlyOne(rawSourceDir, /^import-map(?:\.[^.]+)?\.json$/, 'import-map.json');
  renameExactlyOne(rawSourceDir, /^settings(?:\.[^.]+)?\.json$/, 'settings.json');
  renameExactlyOne(rawSourceDir, /^system\.bundle(?:\.[^.]+)?\.js$/, 'system.bundle.js');
  renameExactlyOne(rawSourceDir, /^polyfills\.bundle(?:\.[^.]+)?\.js$/, 'polyfills.bundle.js');

  const importMap = readJson(importMapPath);
  fs.unlinkSync(importMapPath);
  fs.writeFileSync(path.join(rawSourceDir, 'import-map.js'), jsonModuleSource(importMap), 'utf8');
  fs.writeFileSync(applicationPath, patchApplicationSource(fs.readFileSync(applicationPath, 'utf8')), 'utf8');

  moveEntry(path.join(rawSourceDir, 'runtime-adapter'), path.join(buildDir, 'runtime-adapter'));
  moveEntry(path.join(rawSourceDir, 'image'), path.join(buildDir, 'image'));
  moveEntry(path.join(rawSourceDir, 'game.js'), path.join(buildDir, 'game.js'));
  moveEntry(path.join(rawSourceDir, 'externs-game.js'), path.join(buildDir, 'externs-game.js'));
  fs.writeFileSync(path.join(buildDir, 'main.js'), 'require("game.js");\n', 'utf8');

  for (const name of config.subpackages) {
    const source = path.join(rawSourceDir, `usr_${name}`);
    const destination = path.join(buildDir, 'subpackages', name);
    moveEntry(source, destination);
    renameExactlyOne(destination, /^config(?:\.[^.]+)?\.json$/, 'config.json');
    moveEntry(path.join(destination, 'game.js'), path.join(destination, 'index.js'));
    fs.writeFileSync(path.join(destination, 'main.js'), "require('./index.js');\n", 'utf8');
  }

  fs.unlinkSync(rawManifestPath);
  fs.writeFileSync(path.join(buildDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(
    path.join(buildDir, 'externs-game.js'),
    patchNormalizedExterns(fs.readFileSync(path.join(buildDir, 'externs-game.js'), 'utf8')),
    'utf8',
  );
  const minigameConfigPath = path.join(buildDir, 'minigame.config.js');
  if (fs.existsSync(minigameConfigPath)) {
    fs.writeFileSync(minigameConfigPath, patchMinigameConfigSource(fs.readFileSync(minigameConfigPath, 'utf8')), 'utf8');
  }

  const compileConfigPath = path.join(buildDir, 'cocos.compile.config.json');
  const compile = readJson(compileConfigPath);
  if (compile.appTemplateData) compile.appTemplateData.settingsJsonPath = 'src/settings.json';
  writeJson(compileConfigPath, compile);
  return true;
}

function patchCocosBuild({ buildDir, config, version }) {
  const compileConfigPath = path.join(buildDir, 'cocos.compile.config.json');
  const manifestPath = path.join(buildDir, 'src', 'manifest.json');
  const compile = readJson(compileConfigPath);
  const manifest = readJson(manifestPath);

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
  Object.assign(manifest, {
    package: config.packageName,
    ...(config.displayName ? { name: config.displayName } : {}),
    versionName: version.versionName,
    versionCode: version.versionCode,
    minPlatformVersion: config.minPlatformVersion,
  });

  writeJson(compileConfigPath, compile);
  writeJson(manifestPath, manifest);

  const normalized = normalizeCocosExport({ buildDir, config, version });

  return { compileConfigPath, manifestPath: normalized ? path.join(buildDir, 'manifest.json') : manifestPath };
}

module.exports = { findExactlyOne, normalizeCocosExport, patchCocosBuild };
