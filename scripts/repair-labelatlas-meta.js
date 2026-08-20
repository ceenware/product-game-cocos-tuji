#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'assets');

function walk(dir, predicate, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, predicate, result);
    } else if (entry.isFile() && predicate(fullPath)) {
      result.push(fullPath);
    }
  }
  return result;
}

function pngSize(pngPath) {
  const buffer = fs.readFileSync(pngPath);
  if (buffer.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error(`${pngPath} is not a PNG file`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function findSpriteFrame(metaDir, spriteFrameUuid) {
  const imageMetas = walk(metaDir, file => file.endsWith('.png.meta'));
  for (const imageMetaPath of imageMetas) {
    const imageMeta = JSON.parse(fs.readFileSync(imageMetaPath, 'utf8'));
    for (const subMeta of Object.values(imageMeta.subMetas || {})) {
      if (subMeta.uuid === spriteFrameUuid) {
        const pngPath = imageMetaPath.replace(/\.meta$/, '');
        return {
          atlasName: subMeta.displayName || path.basename(pngPath, '.png'),
          pngPath,
        };
      }
    }
  }
  throw new Error(`No sprite frame ${spriteFrameUuid} found under ${metaDir}`);
}

function buildFontConfig({ atlasName, width, height, itemWidth, itemHeight, fontSize, startChar }) {
  const columns = Math.floor(width / itemWidth);
  const rows = Math.floor(height / itemHeight);
  const count = columns * rows;
  if (count < 10) {
    throw new Error(`${atlasName}: expected at least 10 glyphs, got ${count}`);
  }

  const startCode = String(startChar || '0').charCodeAt(0);
  const fontDefDictionary = {};
  for (let index = 0; index < count; index += 1) {
    const code = String(startCode + index);
    fontDefDictionary[code] = {
      rect: {
        x: (index % columns) * itemWidth,
        y: Math.floor(index / columns) * itemHeight,
        width: itemWidth,
        height: itemHeight,
      },
      xOffset: 0,
      yOffset: 0,
      xAdvance: itemWidth,
    };
  }

  return {
    commonHeight: itemHeight,
    fontSize: Math.floor(fontSize),
    atlasName,
    fontDefDictionary,
    kerningDict: {},
  };
}

const labelAtlasMetas = walk(root, file => file.endsWith('.labelatlas.meta')).sort();
let repairedCount = 0;

for (const metaPath of labelAtlasMetas) {
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const userData = meta.userData || {};
  if (userData._fntConfig) {
    continue;
  }

  const { atlasName, pngPath } = findSpriteFrame(path.dirname(metaPath), userData.spriteFrameUuid);
  const { width, height } = pngSize(pngPath);
  userData._fntConfig = buildFontConfig({
    atlasName,
    width,
    height,
    itemWidth: userData.itemWidth,
    itemHeight: userData.itemHeight,
    fontSize: userData.fontSize,
    startChar: userData.startChar,
  });
  meta.userData = userData;
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`Repaired ${path.relative(path.resolve(__dirname, '..'), metaPath)} from ${path.basename(pngPath)}`);
  repairedCount += 1;
}

console.log(`Repaired ${repairedCount} label-atlas metadata files.`);
