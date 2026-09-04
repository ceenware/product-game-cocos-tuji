const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function section(yaml, heading, indent) {
  const lines = yaml.split('\n');
  const headingPattern = new RegExp(`^${' '.repeat(indent)}${heading}:\\s*$`);
  const nextPattern = new RegExp(`^${' '.repeat(indent)}[A-Za-z_][A-Za-z0-9_-]*:\\s*$`);
  const start = lines.findIndex((line) => headingPattern.test(line));
  assert.notEqual(start, -1, `missing ${heading} section`);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (nextPattern.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

test('vivo workflow has one selected build runner and no Linux Cocos build', () => {
  const yaml = fs.readFileSync(path.join(__dirname, '..', '..', '..', '.github', 'workflows', 'release-vivo.yml'), 'utf8');
  const topLevelKeys = (yaml.match(/^(?:name|on|permissions|concurrency|jobs):(?:\s.*)?$/gm) || [])
    .map((line) => line.split(':', 1)[0]);
  const jobsSection = section(yaml, 'jobs', 0);
  const jobs = jobsSection.match(/^  [A-Za-z_][A-Za-z0-9_-]*:\s*$/gm) || [];
  const dispatchSection = section(yaml, 'workflow_dispatch', 2);
  const selectRunnerSection = section(jobsSection, 'select-runner', 2);
  const buildSection = section(jobsSection, 'build', 2);

  assert.deepEqual(topLevelKeys, ['name', 'on', 'permissions', 'concurrency', 'jobs']);
  assert.match(yaml, /^name: Release Vivo$/m);
  assert.match(yaml, /^on:\n  workflow_dispatch:$/m);
  assert.match(dispatchSection, /^    inputs:$/m);
  assert.match(dispatchSection, /^      runner:$/m);
  assert.match(dispatchSection, /^        type: choice$/m);
  assert.match(dispatchSection, /^        default: auto$/m);
  assert.match(dispatchSection, /^        options: \[auto, windows, macos, self-hosted-windows, self-hosted-macos\]$/m);
  assert.doesNotMatch(yaml, /^\s*push:/m);
  assert.deepEqual(jobs, ['  select-runner:', '  build:']);
  assert.match(selectRunnerSection, /^    runs-on: ubuntu-latest$/m);
  assert.match(yaml, /windows-2022/);
  assert.match(yaml, /macos-15-intel/);
  assert.match(yaml, /self-hosted-windows/);
  assert.match(yaml, /self-hosted-macos/);
  assert.match(buildSection, /^    needs: select-runner$/m);
  assert.match(buildSection, /^    runs-on: \$\{\{ fromJSON\(needs\.select-runner\.outputs\.runner\) \}\}$/m);
  assert.doesNotMatch(buildSection, /^    env:\s*$/m);
  assert.match(buildSection, /- name: Ensure Cocos Creator and OpenSSL[\s\S]*?^        env:\n          COCOS_TOOL_CACHE: \$\{\{ runner\.tool_cache \}\}$\n          COCOS_CACHE_DIR: \$\{\{ runner\.tool_cache \}\}\/cocos-creator\/3\.6\.2$/m);
  assert.match(buildSection, /npm ci --ignore-scripts --prefix platforms\/vivo/);
  assert.match(buildSection, /npm test --prefix platforms\/vivo/);
  assert.match(buildSection, /fetch-depth: 0/);
  assert.match(buildSection, /fetch-tags: true/);
  assert.match(buildSection, /node-version: 18\.20\.8/);
  assert.match(buildSection, /python-version: '3\.11'/);
  assert.match(buildSection, /platforms\/vivo\/scripts\/resolve-version\.js/);
  assert.match(buildSection, /platforms\/vivo\/scripts\/ensure-cocos\.js/);
  assert.match(buildSection, /--tool-cache "\$COCOS_TOOL_CACHE"/);
  assert.match(buildSection, /platforms\/vivo\/scripts\/build\.js/);
  assert.match(buildSection, /--signing-mode test/);
  assert.match(buildSection, /actions\/cache@v4/);
  assert.match(buildSection, /actions\/upload-artifact@v4/);
  assert.match(buildSection, /path: artifacts\/vivo/);
  assert.match(buildSection, /name: vivo-validation-\$\{\{ runner\.os \}\}-\$\{\{ github\.sha \}\}/);
  const requiredSteps = [
    'npm ci --ignore-scripts --prefix platforms/vivo',
    'npm test --prefix platforms/vivo',
    'platforms/vivo/scripts/resolve-version.js',
    'platforms/vivo/scripts/ensure-cocos.js',
    'platforms/vivo/scripts/build.js',
    'actions/upload-artifact@v4',
  ];
  let previousIndex = -1;
  for (const marker of requiredSteps) {
    const index = buildSection.indexOf(marker);
    assert.ok(index > previousIndex, `expected ${marker} after the previous build step`);
    previousIndex = index;
  }
  assert.doesNotMatch(yaml, /\b(?:git(?:\s+-C\s+[^\s]+)?\s+tag|gh\s+(?:api|release)|(?:ncipollo\/release-action|softprops\/action-gh-release|actions\/(?:create-release|upload-release-asset)))\b/i);
  assert.doesNotMatch(yaml, /matrix:/);

  const releaseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'release.json'), 'utf8'));
  assert.deepEqual(releaseConfig.runners, {
    auto: ['windows-2022'],
    windows: ['windows-2022'],
    macos: ['macos-15-intel'],
    'self-hosted-windows': ['self-hosted', 'Windows', 'X64', 'cocos-vivo'],
    'self-hosted-macos': ['self-hosted', 'macOS', 'X64', 'cocos-vivo'],
  });
});
