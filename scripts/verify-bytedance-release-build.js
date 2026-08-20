#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const APP_ID = 'ttf83e8e83665b0a4302';
const buildDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'build', 'bytedance-mini-game-fixed'));

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
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

function walkFiles(dir, predicate, output = []) {
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    const stat = fs.statSync(file);
    if (stat.isDirectory()) {
      walkFiles(file, predicate, output);
    } else if (predicate(file)) {
      output.push(file);
    }
  }

  return output;
}

function hasSidebarNavigateToScene(source) {
  return [
    /\btt\s*\.\s*navigateToScene\s*\(\s*\{(?=[\s\S]{0,1000}?\bscene\s*:\s*['"]sidebar['"])/,
    /window\s*\.\s*tt\s*\.\s*navigateToScene\s*\(\s*\{(?=[\s\S]{0,1000}?\bscene\s*:\s*['"]sidebar['"])/,
    /window\s*\[\s*['"]tt['"]\s*\]\s*\.\s*navigateToScene\s*\(\s*\{(?=[\s\S]{0,1000}?\bscene\s*:\s*['"]sidebar['"])/,
  ].some(pattern => pattern.test(source));
}

function findSidebarNavigateToSceneFile(dir) {
  const jsFiles = walkFiles(dir, file => file.endsWith('.js'));

  return jsFiles.find(file => hasSidebarNavigateToScene(fs.readFileSync(file, 'utf8')));
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

if (!fs.existsSync(buildDir)) {
  fail(`Build directory does not exist: ${buildDir}`);
  process.exit();
}

const appFile = findSingle('application.*.js', buildDir);
const settingsFile = findSingle('settings.*.json', path.join(buildDir, 'src'));
const projectConfigFile = path.join(buildDir, 'project.config.json');

const appSource = fs.readFileSync(appFile, 'utf8');
const settings = readJson(settingsFile);
const projectConfig = fs.existsSync(projectConfigFile) ? readJson(projectConfigFile) : null;

if (appSource.includes('this.showFPS = true')) {
  fail(`${path.relative(process.cwd(), appFile)}: showFPS is still true`);
}

if (appSource.includes('debugMode: true ? cc.DebugMode.INFO : cc.DebugMode.ERROR')) {
  fail(`${path.relative(process.cwd(), appFile)}: debugMode is still INFO`);
}

if (settings.engine && settings.engine.debug !== false) {
  fail(`${path.relative(process.cwd(), settingsFile)}: engine.debug is not false`);
}

if (projectConfig && projectConfig.appid !== APP_ID) {
  fail(`${path.relative(process.cwd(), projectConfigFile)}: appid is ${projectConfig.appid || '<missing>'}`);
}

if (!findSidebarNavigateToSceneFile(buildDir)) {
  fail(`${path.relative(process.cwd(), buildDir)}: missing tt.navigateToScene({ scene: "sidebar" }) for Douyin sidebar revisit ability`);
}

if (process.exitCode) {
  process.exit();
}

console.log(`Verified Bytedance release build at ${path.relative(process.cwd(), buildDir)}.`);
