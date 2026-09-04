const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('vivo workflow has one selected build runner and no Linux Cocos build', () => {
  const yaml = fs.readFileSync(path.join(__dirname, '..', '..', '..', '.github', 'workflows', 'release-vivo.yml'), 'utf8');
  assert.match(yaml, /workflow_dispatch:/);
  assert.match(yaml, /windows-2022/);
  assert.match(yaml, /macos-15-intel/);
  assert.match(yaml, /self-hosted-windows/);
  assert.match(yaml, /self-hosted-macos/);
  assert.match(yaml, /runs-on: \$\{\{ fromJSON\(needs\.select-runner\.outputs\.runner\) \}\}/);
  assert.doesNotMatch(yaml, /matrix:/);
  assert.doesNotMatch(yaml, /gh release create/);
});
