const fs = require('node:fs');
const path = require('node:path');

const { loadReleaseConfig } = require('../lib/config');
const { ensureCocos, ensureOpenSsl, writeGitHubOutput } = require('../lib/cocos-toolchain');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error(`unexpected argument: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${key}`);
    args[key.slice(2)] = value;
    index += 1;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadReleaseConfig(args.config);
  const cocos = await ensureCocos({
    runnerOS: process.env.RUNNER_OS,
    explicitPath: process.env.COCOS_CREATOR,
    expectedVersion: config.cocos.version,
    toolCache: args['tool-cache'],
  });
  const openssl = await ensureOpenSsl({ runnerOS: process.env.RUNNER_OS });
  const result = { ...cocos, openssl: openssl.executable };
  writeGitHubOutput(result);
  console.log(JSON.stringify({ ...result, opensslVersion: openssl.version }));
}

if (require.main === module) main().catch((error) => {
  console.error(`[vivo] ${error.message}`);
  process.exitCode = 1;
});

module.exports = { main, parseArgs };
