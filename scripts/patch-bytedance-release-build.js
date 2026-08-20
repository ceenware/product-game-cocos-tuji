#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const APP_ID = 'ttf83e8e83665b0a4302';
const SIDEBAR_REVISIT_MARKER = 'Douyin sidebar revisit ability bridge';
const SIDEBAR_REVISIT_SNIPPET = `
;(() => {
  // ${SIDEBAR_REVISIT_MARKER}
  if (typeof window === 'undefined') return;
  window.__navigateToDouyinSidebarRevisit = function __navigateToDouyinSidebarRevisit() {
    if (typeof tt === 'undefined' || !tt || typeof tt.navigateToScene !== 'function') return;
    tt.navigateToScene({
      scene: "sidebar",
      success: function (res) { console.log("navigate to sidebar success", res); },
      fail: function (res) { console.warn("navigate to sidebar fail", res); },
    });
  };
})();
`;
const buildDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'build', 'bytedance-mini-game-fixed'));
const TERSER_BIN_CANDIDATES = [
  process.env.TERSER_BIN,
  path.join(__dirname, '..', 'node_modules', 'terser', 'bin', 'terser'),
  '/Applications/CocosCreator.app/Contents/Resources/tools/xiaomi-pack-tools/node_modules/terser/bin/terser',
].filter(Boolean);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value)}\n`);
}

function findSingle(pattern, dir) {
  const [prefix, suffix] = pattern.split('*');
  const matches = fs.readdirSync(dir)
    .filter(name => name.startsWith(prefix) && name.endsWith(suffix))
    .map(name => path.join(dir, name));

  if (matches.length !== 1) {
    throw new Error(`Expected one ${pattern} in ${dir}, found ${matches.length}`);
  }

  return matches[0];
}

function findTerserBin() {
  const terserBin = TERSER_BIN_CANDIDATES.find(candidate => fs.existsSync(candidate));

  if (!terserBin) {
    throw new Error(`Could not find terser. Set TERSER_BIN or install terser before patching ${path.relative(process.cwd(), buildDir)}.`);
  }

  return terserBin;
}

function isLikelyMinified(file) {
  const source = fs.readFileSync(file, 'utf8');
  const newlineCount = (source.match(/\n/g) || []).length;

  if (newlineCount === 0) {
    return true;
  }

  return fs.statSync(file).size / newlineCount > 500;
}

function minifyEngine() {
  const engineDir = path.join(buildDir, 'cocos-js');
  const engineFile = findSingle('cc*.js', engineDir);
  const beforeSize = fs.statSync(engineFile).size;

  if (isLikelyMinified(engineFile)) {
    return { file: engineFile, beforeSize, afterSize: beforeSize, skipped: true };
  }

  const outputFile = `${engineFile}.min`;
  const result = spawnSync(process.execPath, [
    findTerserBin(),
    engineFile,
    '-c',
    'passes=2',
    '-m',
    '-o',
    outputFile,
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(`Failed to minify ${path.relative(process.cwd(), engineFile)}:\n${result.stderr || result.stdout}`);
  }

  fs.renameSync(outputFile, engineFile);
  const afterSize = fs.statSync(engineFile).size;
  return { file: engineFile, beforeSize, afterSize, skipped: false };
}

function injectSidebarRevisit(appFile) {
  let source = fs.readFileSync(appFile, 'utf8');
  if (source.includes(SIDEBAR_REVISIT_MARKER)) {
    return false;
  }

  source = `${source.replace(/\s+$/, '')}\n${SIDEBAR_REVISIT_SNIPPET}`;
  fs.writeFileSync(appFile, source);
  return true;
}

if (!fs.existsSync(buildDir)) {
  throw new Error(`Build directory does not exist: ${buildDir}`);
}

const appFile = findSingle('application.*.js', buildDir);
const settingsFile = findSingle('settings.*.json', path.join(buildDir, 'src'));
const projectConfigFile = path.join(buildDir, 'project.config.json');

let appSource = fs.readFileSync(appFile, 'utf8');
appSource = appSource.replace('this.showFPS = true;', 'this.showFPS = false;');
appSource = appSource.replace(
  'debugMode: true ? cc.DebugMode.INFO : cc.DebugMode.ERROR,',
  'debugMode: cc.DebugMode.ERROR,',
);
fs.writeFileSync(appFile, appSource);
const injectedSidebarRevisit = injectSidebarRevisit(appFile);

const settings = readJson(settingsFile);
settings.engine = settings.engine || {};
settings.engine.debug = false;
writeJson(settingsFile, settings);

if (fs.existsSync(projectConfigFile)) {
  const projectConfig = readJson(projectConfigFile);
  projectConfig.appid = APP_ID;
  writeJson(projectConfigFile, projectConfig);
}

const engineMinify = minifyEngine();

console.log(`Patched Cocos release build: ${path.relative(process.cwd(), buildDir)}`);
if (engineMinify.skipped) {
  console.log(`Kept minified ${path.relative(process.cwd(), engineMinify.file)}: ${engineMinify.afterSize} bytes`);
} else {
  console.log(`Minified ${path.relative(process.cwd(), engineMinify.file)}: ${engineMinify.beforeSize} -> ${engineMinify.afterSize} bytes`);
}
console.log(`${injectedSidebarRevisit ? 'Injected' : 'Kept'} Douyin sidebar revisit bridge in ${path.relative(process.cwd(), appFile)}`);
