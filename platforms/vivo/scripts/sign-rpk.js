const fs = require('node:fs');

const {
  assertKeyMatchesCertificate,
  assertSignedByCertificate,
  signRpkSet,
} = require('../lib/rpk-signing');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error(`unexpected argument: ${key}`);
    if (key === '--verify') {
      args.verify = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${key}`);
    args[key.slice(2)] = value;
    index += 1;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.verify) {
    if (!args.rpk || !args.certificate) throw new Error('--verify requires --rpk and --certificate');
    assertSignedByCertificate(args.rpk, fs.readFileSync(args.certificate));
    console.log(`[vivo] verified signed RPK ${args.rpk}`);
    return;
  }
  const config = JSON.parse(fs.readFileSync(args.config, 'utf8'));
  const result = await signRpkSet({
    distTempDir: args['dist-temp'],
    config,
    privateKeyPath: args['private-key'],
    certificatePath: args.certificate,
    outputPath: args.output,
  });
  console.log(JSON.stringify({ output: result.outputPath, certificateFingerprint: result.certificateFingerprint }));
}

if (require.main === module) main().catch((error) => {
  console.error(`[vivo] ${error.message}`);
  process.exitCode = 1;
});

module.exports = { main, parseArgs, assertKeyMatchesCertificate, assertSignedByCertificate };
