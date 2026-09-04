#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const { patchCocosBuild } = require('../lib/cocos-build-patch');
const { loadReleaseConfig } = require('../lib/config');

function requiredArg(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith('--')) throw new Error(`missing required argument ${name}`);
  return value;
}

try {
  const buildDir = path.resolve(requiredArg('--build-dir'));
  const configPath = path.resolve(requiredArg('--config'));
  const versionPath = path.resolve(requiredArg('--version-file'));
  const config = loadReleaseConfig(configPath);
  const version = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
  const result = patchCocosBuild({ buildDir, config, version });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
