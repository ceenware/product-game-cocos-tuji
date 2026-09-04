#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { loadReleaseConfig } = require('../lib/config');
const { resolveVersion } = require('../lib/version');

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const repo = path.resolve(arg('--repo', process.cwd()));
const config = loadReleaseConfig(path.resolve(arg('--config', path.join(__dirname, '..', 'release.json'))));
const output = path.resolve(arg('--output', path.join(repo, 'platforms', 'vivo', '.tmp', 'version.json')));
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const allTags = git('tag', '--list', `${config.tagPrefix}*`).split(/\r?\n/).filter(Boolean);
const headTags = git('tag', '--points-at', 'HEAD', '--list', `${config.tagPrefix}*`).split(/\r?\n/).filter(Boolean);
const version = resolveVersion(config, { allTags, headTags });
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(version, null, 2)}\n`);
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(version).map(([key, value]) => `${key}=${value}\n`).join(''));
}
console.log(JSON.stringify(version));
