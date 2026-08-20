#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const assetsRoot = path.join(projectRoot, 'assets');
const libraryRoot = path.join(projectRoot, 'library');

const assetExtensions = new Set([
  '.mtl',
  '.prefab',
  '.scene',
]);

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

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${relative(file)}: invalid JSON (${error.message})`);
  }
}

function relative(file) {
  return path.relative(projectRoot, file);
}

function addKnownUuid(knownUuids, uuid) {
  if (typeof uuid === 'string' && uuid.length > 0) {
    knownUuids.add(uuid);
  }
}

function collectKnownUuids() {
  const knownUuids = new Set();
  const metaFiles = walk(assetsRoot, file => file.endsWith('.meta'));

  for (const metaFile of metaFiles) {
    const meta = readJson(metaFile);
    addKnownUuid(knownUuids, meta.uuid);

    for (const subMeta of Object.values(meta.subMetas || {})) {
      addKnownUuid(knownUuids, subMeta && subMeta.uuid);
    }
  }

  if (fs.existsSync(libraryRoot)) {
    const importedAssetFiles = walk(libraryRoot, file => file.endsWith('.json'));

    for (const importedAssetFile of importedAssetFiles) {
      const importedAsset = readJson(importedAssetFile);
      if (importedAsset.__type__ === 'cc.Texture2D') {
        addKnownUuid(knownUuids, path.basename(importedAssetFile, '.json'));
      }
    }
  }

  return knownUuids;
}

function lineNumberForOffset(text, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (text.charCodeAt(index) === 10) {
      line += 1;
    }
  }
  return line;
}

function visit(value, onReference) {
  if (Array.isArray(value)) {
    for (const item of value) {
      visit(item, onReference);
    }
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  if (typeof value.__uuid__ === 'string' && value.__expectedType__ === 'cc.Texture2D') {
    onReference(value.__uuid__);
  }

  for (const child of Object.values(value)) {
    visit(child, onReference);
  }
}

function findMissingReferences(knownUuids) {
  const assetFiles = walk(assetsRoot, file => assetExtensions.has(path.extname(file)));
  const missingReferences = [];

  for (const assetFile of assetFiles) {
    const text = fs.readFileSync(assetFile, 'utf8');
    const asset = readJson(assetFile);
    visit(asset, uuid => {
      if (!knownUuids.has(uuid)) {
        const offset = text.indexOf(`"${uuid}"`);
        missingReferences.push({
          file: relative(assetFile),
          line: offset >= 0 ? lineNumberForOffset(text, offset) : 1,
          uuid,
        });
      }
    });
  }

  return missingReferences;
}

const knownUuids = collectKnownUuids();
const missingReferences = findMissingReferences(knownUuids);

if (missingReferences.length > 0) {
  for (const reference of missingReferences) {
    console.error(`${reference.file}:${reference.line}: missing asset uuid ${reference.uuid}`);
  }
  process.exit(1);
}

console.log(`Verified Texture2D references against ${knownUuids.size} known UUIDs.`);
