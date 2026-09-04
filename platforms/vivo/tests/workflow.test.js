const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('vivo workflow has one selected build runner and no Linux Cocos build', () => {
  const yaml = fs.readFileSync(path.join(__dirname, '..', '..', '..', '.github', 'workflows', 'release-vivo.yml'), 'utf8');
  const jobs = yaml.match(/^  [a-z-]+:\s*$/gm) || [];
  const runsOn = yaml.match(/^    runs-on:/gm) || [];

  assert.match(yaml, /workflow_dispatch:/);
  assert.doesNotMatch(yaml, /^\s*push:/m);
  assert.match(yaml, /windows-2022/);
  assert.match(yaml, /macos-15-intel/);
  assert.match(yaml, /self-hosted-windows/);
  assert.match(yaml, /self-hosted-macos/);
  assert.match(yaml, /runs-on: \$\{\{ fromJSON\(needs\.select-runner\.outputs\.runner\) \}\}/);
  assert.deepEqual(jobs, ['  select-runner:', '  build:']);
  assert.equal(runsOn.length, 2);
  assert.match(yaml, /npm ci --ignore-scripts --prefix platforms\/vivo/);
  assert.match(yaml, /npm test --prefix platforms\/vivo/);
  assert.match(yaml, /platforms\/vivo\/scripts\/resolve-version\.js/);
  assert.match(yaml, /platforms\/vivo\/scripts\/ensure-cocos\.js/);
  assert.match(yaml, /platforms\/vivo\/scripts\/build\.js/);
  assert.match(yaml, /actions\/upload-artifact@v4/);
  assert.match(yaml, /path: artifacts\/vivo/);
  assert.doesNotMatch(yaml, /\b(?:git\s+tag|gh\s+release)\b/);
  assert.doesNotMatch(yaml, /(?:actions\/(?:create-release|upload-release-asset)|softprops\/action-gh-release)/);
  assert.match(yaml, /COCOS_TOOL_CACHE: \$\{\{ runner\.tool_cache \}\}/);
  assert.match(yaml, /--tool-cache "\$COCOS_TOOL_CACHE"/);
  assert.match(yaml, /actions\/cache@v4/);
  assert.doesNotMatch(yaml, /matrix:/);
});
