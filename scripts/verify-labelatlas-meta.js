#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'assets');

function walk(dir, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, result);
    } else if (entry.isFile() && fullPath.endsWith('.labelatlas.meta')) {
      result.push(fullPath);
    }
  }
  return result;
}

function assertValidLabelAtlas(metaPath) {
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const userData = meta.userData || {};
  const config = userData._fntConfig;
  const relativePath = path.relative(path.resolve(__dirname, '..'), metaPath);

  if (!config || typeof config !== 'object') {
    throw new Error(`${relativePath}: missing userData._fntConfig`);
  }

  if (!config.kerningDict || typeof config.kerningDict !== 'object') {
    throw new Error(`${relativePath}: missing _fntConfig.kerningDict`);
  }

  const dictionary = config.fontDefDictionary;
  if (!dictionary || typeof dictionary !== 'object') {
    throw new Error(`${relativePath}: missing _fntConfig.fontDefDictionary`);
  }

  const entries = Object.entries(dictionary);
  if (entries.length === 0) {
    throw new Error(`${relativePath}: empty _fntConfig.fontDefDictionary`);
  }

  for (const [code, glyph] of entries) {
    if (!glyph || !glyph.rect || glyph.rect.width <= 0 || glyph.rect.height <= 0) {
      throw new Error(`${relativePath}: missing glyph for character code ${code}`);
    }
  }
}

const files = walk(root).sort();
for (const file of files) {
  assertValidLabelAtlas(file);
}

console.log(`Verified ${files.length} label-atlas metadata files.`);
