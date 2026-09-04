#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

const candidates = [process.env.PYTHON, process.platform === 'win32' ? 'python' : 'python3', 'python'].filter(Boolean);
for (const executable of [...new Set(candidates)]) {
  const result = spawnSync(executable, ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py'], {
    cwd: require('node:path').join(__dirname, '..'),
    stdio: 'inherit',
  });
  if (!result.error) process.exit(result.status ?? 1);
  if (result.error.code !== 'ENOENT') throw result.error;
}
throw new Error('Python interpreter not found');
