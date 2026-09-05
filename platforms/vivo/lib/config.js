const fs = require('node:fs');

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function validateReleaseConfig(config) {
  for (const key of ['platform', 'branch', 'tagPrefix', 'packageName']) {
    if (typeof config[key] !== 'string' || !config[key]) throw new Error(`invalid ${key}`);
  }
  if (typeof config.copyright?.owner !== 'string' || !config.copyright.owner) {
    throw new Error('invalid copyright.owner');
  }
  if (typeof config.copyright?.softwareRegistration !== 'string' || !config.copyright.softwareRegistration) {
    throw new Error('invalid copyright.softwareRegistration');
  }
  if (!SEMVER.test(config.versionBaseline?.name || '')) {
    throw new Error('invalid versionBaseline.name');
  }
  if (!Number.isInteger(config.versionBaseline?.code) || config.versionBaseline.code < 1) {
    throw new Error('invalid versionBaseline.code');
  }
  const seen = new Set();
  for (const name of config.subpackages || []) {
    if (seen.has(name)) throw new Error(`duplicate subpackage ${name}`);
    seen.add(name);
  }
  if (seen.size === 0) throw new Error('subpackages must not be empty');
  if (config.cocos?.version !== '3.6.2') throw new Error('cocos.version must be 3.6.2');
  return config;
}

function loadReleaseConfig(filePath) {
  return validateReleaseConfig(JSON.parse(fs.readFileSync(filePath, 'utf8')));
}

module.exports = { loadReleaseConfig, validateReleaseConfig };
