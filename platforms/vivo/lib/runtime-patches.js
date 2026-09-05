const fs = require('node:fs');
const path = require('node:path');

const MAIN_IMPORT_MAP_PATTERN = /(?:const|var)\s+importMap\s*=\s*require\((['"])\.\/src\/import-map\.js\1\)\.default;?/;
const STARTUP_REQUIRE_PATTERNS = {
  ral: /require\((['"])(?:\.\/ral\.min(?:\.js)?|(?:runtime-adapter\/)?ral(?:\.js)?)\1\)/,
  web: /require\((['"])(?:\.\/web-adapter(?:\.js)?|runtime-adapter\/web-adapter(?:\.js)?)\1\)/,
  engine: /require\((['"])(?:\.\/engine-adapter(?:\.js)?|runtime-adapter\/engine-adapter(?:\.js)?)\1\)/,
};

function readJson(filePath) {
  const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${filePath}: expected a JSON object`);
  }
  return value;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function copyRequired(source, target) {
  if (!fs.existsSync(source)) {
    throw new Error(`Missing Cocos adapter source: ${source}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function normalizeStartupRequirePaths(source) {
  return source
    .replace(/require\((['"])\.\/ral\.min(?:\.js)?\1\)/g, 'require("./ral.min.js")')
    .replace(/require\((['"])\.\/web-adapter(?:\.js)?\1\)/g, 'require("./web-adapter.js")')
    .replace(/require\((['"])\.\/engine-adapter(?:\.js)?\1\)/g, 'require("./engine-adapter.js")');
}

function patchManifest(manifest, config, version) {
  return {
    ...manifest,
    package: config.packageName,
    versionName: version.versionName,
    versionCode: version.versionCode,
    minPlatformVersion: config.minPlatformVersion,
    buildType: 'release',
    config: { ...(manifest.config || {}), debug: false, logLevel: manifest.config?.logLevel || 'log' },
    subpackages: config.subpackages.map((name) => ({ name: `usr_${name}`, root: `subpackages/${name}/` })),
  };
}

function patchSettings(settings, config) {
  return {
    ...settings,
    engine: { ...(settings.engine || {}), platform: 'vivo-mini-game', debug: false },
    assets: { ...(settings.assets || {}), subpackages: [...config.subpackages] },
  };
}

function replaceRequired(source, pattern, replacement, label, anchorDescription) {
  if (!pattern.test(source)) {
    throw new Error(`${label}: missing ${anchorDescription}`);
  }
  return source.replace(pattern, replacement);
}

function importMapLiteral(importMap, label) {
  if (importMap === undefined) {
    throw new Error(`${label}: missing import map value`);
  }
  const value = importMap && Object.prototype.hasOwnProperty.call(importMap, 'default')
    ? importMap.default
    : importMap;
  return JSON.stringify(value);
}

function inlineImportMap(source, importMap, label) {
  if (MAIN_IMPORT_MAP_PATTERN.test(source)) {
    return replaceRequired(
      source,
      MAIN_IMPORT_MAP_PATTERN,
      `var importMap=${importMapLiteral(importMap, label)};`,
      label,
      'import map value',
    );
  }
  if (/\b(?:const|var)\s+importMap\s*=/.test(source)) {
    return source;
  }
  throw new Error(`${label}: missing import map anchor`);
}

function hasStartupRequire(source, moduleName) {
  return STARTUP_REQUIRE_PATTERNS[moduleName].test(source);
}

function addStartupRuntimeRequires(source, label) {
  if (!hasStartupRequire(source, 'ral')) {
    const commaWeb = /require\((['"])((?:\.\/)?(?:runtime-adapter\/)?web-adapter(?:\.js)?)\1\),/;
    const standaloneWeb = /require\((['"])((?:\.\/)?(?:runtime-adapter\/)?web-adapter(?:\.js)?)\1\);/;
    if (commaWeb.test(source)) {
      source = source.replace(commaWeb, (match, quote, webPath) => {
        const ralPath = webPath.startsWith('runtime-adapter/') ? 'runtime-adapter/ral.js' : './ral.min';
        return `require("${ralPath}"),require("${webPath}"),`;
      });
    } else if (standaloneWeb.test(source)) {
      source = source.replace(standaloneWeb, (match, quote, webPath) => {
        const ralPath = webPath.startsWith('runtime-adapter/') ? 'runtime-adapter/ral.js' : './ral.min';
        return `require("${ralPath}");\nrequire("${webPath}");`;
      });
    } else {
      throw new Error(`${label}: missing web-adapter require for RAL`);
    }
  }
  return source;
}

function installCanvasBridge(source, label) {
  if (/installVivoCanvasBridge\s*\(/.test(source)) {
    return source;
  }

  const commaWeb = /require\((['"])((?:\.\/)?(?:runtime-adapter\/)?web-adapter(?:\.js)?)\1\),/;
  const standaloneWeb = /require\((['"])((?:\.\/)?(?:runtime-adapter\/)?web-adapter(?:\.js)?)\1\);/;
  if (commaWeb.test(source)) {
    return source.replace(commaWeb, (match, quote, webPath) => `require("${webPath}"),installVivoCanvasBridge(),`);
  }
  if (standaloneWeb.test(source)) {
    return source.replace(standaloneWeb, (match) => `${match}\ninstallVivoCanvasBridge();`);
  }
  throw new Error(`${label}: missing web-adapter require for canvas bridge`);
}

function addScreenCompatibility(source, label) {
  source = source.replace(/,screen=window\.screen;/g, ';');
  const hasScreenCompatibility = /\bscreen\s*=\s*window\.screen/.test(source);
  const hasCanvasSizing = source.includes('startupCanvasForSizing') || /(?:canvas|startupCanvas|t)\.(?:width|height)\s*\*=?\s*2/.test(source);
  const commaWeb = /require\((['"])((?:\.\/)?(?:runtime-adapter\/)?web-adapter(?:\.js)?)\1\),/;
  if (hasScreenCompatibility && hasCanvasSizing) {
    return source;
  }
  if (commaWeb.test(source)) {
    const compactSizing = commaWeb.exec(source);
    const webPath = compactSizing[2];
    const sizingSource = `require("${webPath}"),(()=>{
    ${hasScreenCompatibility ? '' : 'if ("undefined"!=typeof window&&window.screen&&"undefined"==typeof screen) {\n        screen=window.screen;\n    }\n    '}const t=getRuntimeCanvas();
    if ("undefined"!=typeof window&&t&&window.devicePixelRatio>=2) {
        t.width*=2;
        t.height*=2;
    }
})(),`;
    return source.replace(commaWeb, sizingSource);
  }

  const webRequire = /require\((['"])((?:\.\/)?(?:runtime-adapter\/)?web-adapter(?:\.js)?)\1\);?/;
  if (!webRequire.test(source)) {
    throw new Error(`${label}: missing web-adapter require for screen compatibility`);
  }
  if (hasScreenCompatibility) {
    return source.replace(webRequire, (match) => `${match}

// Adjust initial canvas size.
if (typeof canvas !== 'undefined' && canvas && typeof window !== 'undefined' && window.devicePixelRatio >= 2) {
    canvas.width *= 2;
    canvas.height *= 2;
}`);
  }

  return source.replace(webRequire, (match) => `${match}

// Keep Cocos quick-game globals available on vivo review devices.
if (typeof window !== 'undefined' && window.screen && typeof screen === 'undefined') {
    screen = window.screen;
}

// Adjust initial canvas size.
if (typeof canvas !== 'undefined' && canvas && typeof window !== 'undefined' && window.devicePixelRatio >= 2) {
    canvas.width *= 2;
    canvas.height *= 2;
}`);
}

function patchCanvasSizing(source) {
  const oldCanvasSizeBlock = [
    '// Adjust initial canvas size.',
    "if (typeof canvas !== 'undefined' && canvas && typeof window !== 'undefined' && window.devicePixelRatio >= 2) {",
    '    canvas.width *= 2;',
    '    canvas.height *= 2;',
    '}',
  ].join('\n');
  const newCanvasSizeBlock = [
    '// Adjust initial canvas size.',
    'const startupCanvasForSizing = getRuntimeCanvas();',
    "if (startupCanvasForSizing && typeof window !== 'undefined' && window.devicePixelRatio >= 2) {",
    '    startupCanvasForSizing.width *= 2;',
    '    startupCanvasForSizing.height *= 2;',
    '}',
  ].join('\n');

  if (source.includes(oldCanvasSizeBlock)) {
    source = source.replace(oldCanvasSizeBlock, newCanvasSizeBlock);
  }
  return source.replace(
    /"undefined"!=typeof canvas&&canvas&&"undefined"!=typeof window&&window\.devicePixelRatio>=2&&\(canvas\.width\*=2,canvas\.height\*=2\),/,
    '(()=>{const t=getRuntimeCanvas();"undefined"!=typeof window&&t&&window.devicePixelRatio>=2&&(t.width*=2,t.height*=2)})(),',
  );
}

function installStartupDiagnostics(source, label) {
  if (source.includes('installStartupDiagnostics')) {
    return source;
  }

  const applicationImport = /System\.import\((['"])\.\/src\/application\.js\1\)\.then/;
  if (!applicationImport.test(source)) {
    throw new Error(`${label}: missing application import anchor`);
  }
  source = source.replace(applicationImport, "installStartupDiagnostics();\n\nSystem.import('./src/application.js').then");

  const catchPattern = /\.catch\(\s*(?:\(\s*)?([A-Za-z_$][\w$]*)(?:\s*\))?\s*=>\s*\{?\s*console\.error\(\s*\1\s*\)\s*;?/;
  if (!catchPattern.test(source)) {
    throw new Error(`${label}: missing startup error catch anchor`);
  }
  source = source.replace(catchPattern, (match, errorName) => {
    const separator = match.endsWith(';') ? ' ' : ';';
    return `${match}${separator}showStartupError(${errorName});`;
  });
  return `${source}

${STARTUP_DIAGNOSTICS_SOURCE}`;
}

const STARTUP_DIAGNOSTICS_SOURCE = `function installStartupDiagnostics() {
    const report = (err) => showStartupError(err);
    if (typeof qg !== 'undefined') {
        if (typeof qg.onError === 'function') {
            qg.onError(report);
        }
        if (typeof qg.onUnhandledRejection === 'function') {
            qg.onUnhandledRejection((event) => report(event && (event.reason || event)));
        }
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('error', (event) => report(event && (event.error || event.message || event)));
        window.addEventListener('unhandledrejection', (event) => report(event && (event.reason || event)));
    }
}

function showStartupError(err) {
    const message = formatStartupError(err);
    if (typeof qg !== 'undefined' && typeof qg.showToast === 'function') {
        qg.showToast({ title: 'Startup error', icon: 'none', duration: 3000 });
    }
    const startupCanvas = getRuntimeCanvas();
    if (!startupCanvas || typeof startupCanvas.getContext !== 'function') {
        return;
    }
    const ctx = startupCanvas.getContext('2d');
    if (!ctx) {
        return;
    }
    const width = startupCanvas.width || 720;
    const height = startupCanvas.height || 1280;
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px sans-serif';
    ctx.fillText('Startup error', 32, 56);
    ctx.font = '18px sans-serif';
    wrapStartupText(ctx, message, 32, 96, Math.max(280, width - 64), 28);
}

function formatStartupError(err) {
    if (!err) {
        return 'Unknown error';
    }
    if (err.stack) {
        return String(err.stack);
    }
    if (err.message) {
        return String(err.message);
    }
    try {
        return JSON.stringify(err);
    } catch (e) {
        return String(err);
    }
}

function wrapStartupText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = String(text).slice(0, 800).split(/\\s+/);
    let line = '';
    for (let i = 0; i < words.length; i++) {
        const testLine = line ? line + ' ' + words[i] : words[i];
        if (ctx.measureText(testLine).width > maxWidth && line) {
            ctx.fillText(line, x, y);
            line = words[i];
            y += lineHeight;
        } else {
            line = testLine;
        }
        const startupCanvas = getRuntimeCanvas();
        if (y > ((startupCanvas && startupCanvas.height) || 1280) - lineHeight) {
            break;
        }
    }
    if (line) {
        ctx.fillText(line, x, y);
    }
}`;

const CANVAS_BRIDGE_SOURCE = `function installVivoCanvasBridge() {
    if (typeof window === 'undefined') {
        return;
    }
    const runtimeCanvas = window.mainCanvas || window.canvas || (typeof canvas !== 'undefined' ? canvas : null);
    if (!runtimeCanvas) {
        return;
    }
    window.canvas = runtimeCanvas;
    runtimeCanvas.style = runtimeCanvas.style || {};
    if (typeof globalThis !== 'undefined') {
        globalThis.canvas = runtimeCanvas;
    }
}

function getRuntimeCanvas() {
    if (typeof window !== 'undefined' && (window.canvas || window.mainCanvas)) {
        return window.canvas || window.mainCanvas;
    }
    if (typeof globalThis !== 'undefined' && globalThis.canvas) {
        return globalThis.canvas;
    }
    return typeof canvas !== 'undefined' ? canvas : null;
}`;

function addCanvasBridgeHelpers(source) {
  if (!source.includes('function getRuntimeCanvas')) {
    source = `${source}\n\n${CANVAS_BRIDGE_SOURCE}`;
  }
  return source
    .replace([
      "    if (typeof canvas === 'undefined' || !canvas || typeof canvas.getContext !== 'function') {",
      '        return;',
      '    }',
      "    const ctx = canvas.getContext('2d');",
    ].join('\n'), [
      '    const startupCanvas = getRuntimeCanvas();',
      "    if (!startupCanvas || typeof startupCanvas.getContext !== 'function') {",
      '        return;',
      '    }',
      "    const ctx = startupCanvas.getContext('2d');",
    ].join('\n'))
    .replace(
      '    const width = canvas.width || 720;\n    const height = canvas.height || 1280;',
      '    const width = startupCanvas.width || 720;\n    const height = startupCanvas.height || 1280;',
    )
    .replace(
      '        if (y > (canvas.height || 1280) - lineHeight) {',
      '        const startupCanvas = getRuntimeCanvas();\n        if (y > ((startupCanvas && startupCanvas.height) || 1280) - lineHeight) {',
    );
}

function forceVivoPlatform(source, label) {
  if (source.includes('forceVivoPlatform')) {
    return source;
  }

  const applicationFunction = /function onApplicationCreated\(application\)\s*\{[\s\S]*?require\((['"])(?:\.\/engine-adapter(?:\.js)?|runtime-adapter\/engine-adapter(?:\.js)?)\1\);/;
  if (applicationFunction.test(source)) {
    source = source.replace(applicationFunction, (match) => `${match}\n        forceVivoPlatform(cc);`);
    return `${source}

${FORCE_VIVO_PLATFORM_SOURCE}`;
  }

  const compressedApplication = /require\((['"])(?:\.\/engine-adapter(?:\.js)?|runtime-adapter\/engine-adapter(?:\.js)?)\1\),([A-Za-z_$][\w$]*)\.init\(([A-Za-z_$][\w$]*)\)\)/;
  if (compressedApplication.test(source)) {
    source = source.replace(
      compressedApplication,
      'require("./engine-adapter"),forceVivoPlatform($3),$2.init($3))',
    );
    return `${source}\n${FORCE_VIVO_PLATFORM_COMPRESSED}`;
  }
  throw new Error(`${label}: missing platform initialization anchor`);
}

const FORCE_VIVO_PLATFORM_SOURCE = `function forceVivoPlatform(cc) {
    const vivoPlatform = cc && cc.sys && cc.sys.Platform && cc.sys.Platform.VIVO_MINI_GAME;
    if (vivoPlatform) {
        cc.sys.platform = vivoPlatform;
    }
}`;

const FORCE_VIVO_PLATFORM_COMPRESSED = 'function forceVivoPlatform(e){var r=e&&e.sys&&e.sys.Platform&&e.sys.Platform.VIVO_MINI_GAME;r&&(e.sys.platform=r)}';

function patchMainSource(source, importMap, file = 'main.js') {
  const label = file || 'main.js';
  source = addStartupRuntimeRequires(source, label);
  source = addScreenCompatibility(source, label);
  source = installCanvasBridge(source, label);
  source = patchCanvasSizing(source);
  source = installStartupDiagnostics(source, label);
  source = addCanvasBridgeHelpers(source);
  source = forceVivoPlatform(source, label);
  source = inlineImportMap(source, importMap, label);
  source = normalizeStartupRequirePaths(source);
  if (!source.includes('forceVivoPlatform')) {
    throw new Error(`${label}: failed to inject forceVivoPlatform`);
  }
  return source;
}

function patchCocosEngineSource(source, file = 'Cocos engine') {
  if (source.includes('"CC_XIAOMI",!0')) {
    source = source.replace('"CC_XIAOMI",!0', '"CC_XIAOMI",!1');
  } else if (source.includes("tryDefineGlobal('CC_XIAOMI', true)")) {
    source = source.replace("tryDefineGlobal('CC_XIAOMI', true)", "tryDefineGlobal('CC_XIAOMI', false)");
  } else if (!source.includes('"CC_XIAOMI",!1') && !source.includes("tryDefineGlobal('CC_XIAOMI', false)")) {
    throw new Error(`${file}: missing CC_XIAOMI constant`);
  }

  if (source.includes('"CC_VIVO",!1')) {
    source = source.replace('"CC_VIVO",!1', '"CC_VIVO",!0');
  } else if (source.includes("tryDefineGlobal('CC_VIVO', false)")) {
    source = source.replace("tryDefineGlobal('CC_VIVO', false)", "tryDefineGlobal('CC_VIVO', true)");
  } else if (!source.includes('"CC_VIVO",!0') && !source.includes("tryDefineGlobal('CC_VIVO', true)")) {
    throw new Error(`${file}: missing CC_VIVO constant`);
  }

  const platformPattern = /=([A-Za-z_$][\w$]*)\.XIAOMI_QUICK_GAME;var /;
  if (platformPattern.test(source)) {
    source = source.replace(platformPattern, '=$1.VIVO_MINI_GAME;var ');
  } else if (!/=([A-Za-z_$][\w$]*)\.VIVO_MINI_GAME;var /.test(source) && !/currentPlatform\s*=\s*Platform\.VIVO_MINI_GAME/.test(source)) {
    throw new Error(`${file}: missing XIAOMI_QUICK_GAME platform assignment`);
  }

  const ralPattern = /(var [^;]+?=\{\};)([A-Za-z_$][\w$]*)=qg,(Object\.keys\(\2\)\.forEach)/;
  if (ralPattern.test(source)) {
    source = source.replace(ralPattern, '$1$2="undefined"!=typeof ral?ral:qg,$3');
  } else if (!source.includes('"undefined"!=typeof ral?ral:qg') && !/function\s+loadJsFile\s*\([^)]*\)\s*\{[\s\S]*?require\(\s*""\s*\+\s*path\s*\)/.test(source)) {
    throw new Error(`${file}: missing qg clone statement for RAL patch`);
  }

  const legacyPluginLoaderPatterns = [
    'require("../../"+("src/"+t))',
    "require('../../'+(\"src/\"+t))",
    'require("../../src/"+t)',
    "require('../../src/'+t)",
  ];
  const safePluginLoader = 'require("src/"+t)';
  for (const legacy of legacyPluginLoaderPatterns) {
    if (source.includes(legacy)) {
      source = source.replace(legacy, safePluginLoader);
      break;
    }
  }
  const modernSafePluginLoader = /function\s+loadJsFile\s*\([^)]*\)\s*\{[\s\S]*?require\(\s*""\s*\+\s*path\s*\)/.test(source);
  if (!source.includes(safePluginLoader) && !source.includes("require('src/'+t)") && !modernSafePluginLoader) {
    throw new Error(`${file}: missing safe Cocos plugin loader path`);
  }
  return source;
}

function patchUniSdkCopyrightSource(source, copyright, file = 'uniSdk') {
  const owner = copyright?.owner;
  const softwareRegistration = copyright?.softwareRegistration;
  if (!owner || !softwareRegistration) {
    throw new Error(`${file}: missing copyright owner or software registration`);
  }

  const replacement = `游戏著作权人: ${owner}\\n软件著作权登记号: ${softwareRegistration}`;
  const placeholder = /游戏著作权人:\s*__COPY_RIGHT_TEXT_/;
  if (placeholder.test(source)) {
    return source.replace(placeholder, replacement);
  }
  if (source.includes(replacement)) {
    return source;
  }
  throw new Error(`${file}: missing copyright label placeholder`);
}

function patchUniSdkSource(source, file = 'uniSdk') {
  const oldSnippet = '2 == i.Global.engineType ? "XIAOMI_QUICK_GAME" == window.cc.sys.platform : void 0 !== window.qg;';
  const newSnippet = '2 == i.Global.engineType ? "XIAOMI_QUICK_GAME" == window.cc.sys.platform : void 0 !== window.qg && window.qg.getProvider && -1 < window.qg.getProvider().toLowerCase().indexOf("xiaomi");';
  if (source.includes(oldSnippet)) {
    source = source.replace(oldSnippet, newSnippet);
  }

  source = source.replace(
    /void\s*0\s*!==\s*window\.qg\s*&&\s*-1\s*<\s*window\.qg\.getProvider\(\)\.toLowerCase\(\)\.indexOf\((["'])(xiaomi|vivo|oppo)\1\)/g,
    'void 0!==window.qg&&window.qg.getProvider&&-1<window.qg.getProvider().toLowerCase().indexOf("$2")',
  );

  source = source.replace(
    /void 0!==([A-Za-z_$][\w$]*)\.qg&&-1<\1\.qg\.getProvider\(\)\.toLowerCase\(\)\.indexOf\((["'])(xiaomi|vivo|oppo)\2\)/g,
    'void 0!==$1.qg&&$1.qg.getProvider&&-1<$1.qg.getProvider().toLowerCase().indexOf(\"$3\")',
  );

  const compressedPattern = /(2==([A-Za-z_$][\w$]*)\.Global\.engineType\?\"XIAOMI_QUICK_GAME\"==([A-Za-z_$][\w$]*)\.cc\.sys\.platform:)void 0!==\3\.qg(?!&&\3\.qg\.getProvider&&)/g;
  const compressedNext = source.replace(
    compressedPattern,
    '$1void 0!==$3.qg&&$3.qg.getProvider&&-1<$3.qg.getProvider().toLowerCase().indexOf(\"xiaomi\")',
  );
  if (compressedNext !== source) {
    source = compressedNext;
  }

  if (source.includes(newSnippet)) {
    return source;
  }
  const guardedProviderPattern = /([A-Za-z_$][\w$]*)\.qg\.getProvider&&-1<\1\.qg\.getProvider\(\)\.toLowerCase\(\)\.indexOf\(["']xiaomi["']\)/;
  if (guardedProviderPattern.test(source)) {
    return source;
  }
  if (source.includes('getProvider')) {
    throw new Error(`${file}: missing uniSdk Xiaomi platform predicate`);
  }
  throw new Error(`${file}: missing uniSdk Xiaomi platform predicate`);
}

function findExactlyOne(directory, pattern, label) {
  if (!fs.existsSync(directory)) {
    throw new Error(`${label || directory}: missing directory ${directory}`);
  }
  const matches = fs.readdirSync(directory).filter((name) => pattern.test(name));
  if (matches.length !== 1) {
    throw new Error(`${label || directory}: expected one matching file, found ${matches.length}`);
  }
  return path.join(directory, matches[0]);
}

function readImportMap(filePath) {
  delete require.cache[require.resolve(filePath)];
  const value = require(filePath);
  return value && value.default ? value.default : value;
}

function validateBundle(directory) {
  for (const required of ['config.json', 'index.js']) {
    const requiredPath = path.join(directory, required);
    if (!fs.existsSync(requiredPath) || !fs.statSync(requiredPath).isFile()) {
      throw new Error(`Missing ${requiredPath}`);
    }
  }
}

function planSubpackages(projectRoot, namesOrOptions, maybeOptions) {
  const names = Array.isArray(namesOrOptions)
    ? namesOrOptions
    : namesOrOptions?.subpackages || [];
  const options = Array.isArray(namesOrOptions) ? (maybeOptions || {}) : (namesOrOptions || {});

  if (!fs.existsSync(projectRoot)) {
    if (options.optional) {
      return [];
    }
    throw new Error(`Missing quick-game root: ${projectRoot}`);
  }
  if (!Array.isArray(names) || names.length === 0) {
    throw new Error('subpackages must not be empty');
  }

  const plans = names.map((name) => {
    const source = path.join(projectRoot, 'assets', name);
    const destination = path.join(projectRoot, 'subpackages', name);
    if (fs.existsSync(source)) {
      validateBundle(source);
      return { source, destination };
    }
    if (!fs.existsSync(destination)) {
      throw new Error(`Missing Cocos asset bundle for vivo subpackage: ${source}`);
    }
    validateBundle(destination);
    return { source: null, destination };
  });

  return plans;
}

function applySubpackagePlans(projectRoot, plans) {
  fs.mkdirSync(path.join(projectRoot, 'subpackages'), { recursive: true });
  for (const { source, destination } of plans) {
    if (source) {
      if (fs.existsSync(destination)) {
        fs.rmSync(destination, { recursive: true, force: true });
      }
      fs.renameSync(source, destination);
    }
    fs.writeFileSync(path.join(destination, 'main.js'), "import './index.js';\n");
  }
  return plans.map(({ destination }) => destination);
}

function prepareSubpackages(projectRoot, namesOrOptions, maybeOptions) {
  const plans = planSubpackages(projectRoot, namesOrOptions, maybeOptions);
  if (!plans.length) {
    return [];
  }
  return applySubpackagePlans(projectRoot, plans);
}

function planTree({ tree, adapterRoot, config, version, optional = false }) {
  if (!fs.existsSync(tree)) {
    if (optional) {
      return null;
    }
    throw new Error(`Missing Cocos export tree: ${tree}`);
  }

  const vivoRuntime = path.join(adapterRoot, 'runtime', 'vivo-mini-game');
  const commonRuntime = path.join(adapterRoot, 'runtime');
  const normalizedLayout = fs.existsSync(path.join(tree, 'subpackages')) && fs.existsSync(path.join(tree, 'externs-game.js'));
  const mainPath = normalizedLayout ? path.join(tree, 'externs-game.js') : path.join(tree, 'main.js');
  const importMapPath = path.join(tree, 'src', 'import-map.js');
  const settingsPath = path.join(tree, 'src', 'settings.json');
  const manifestPath = path.join(tree, 'manifest.json');
  const enginePath = findExactlyOne(path.join(tree, 'src', 'cocos-js'), /^cc(?:\.[^.]+)?\.js$/, tree);
  const uniSdkPath = findExactlyOne(path.join(tree, 'src', 'assets', 'uniSdk'), /^uniSdk(?:\.[^.]+)*\.js$/, tree);

  const importMap = readImportMap(importMapPath);
  const mainSource = patchMainSource(fs.readFileSync(mainPath, 'utf8'), importMap, mainPath);
  const settings = patchSettings(readJson(settingsPath), config);
  const manifest = patchManifest(readJson(manifestPath), config, version);
  const engineSource = patchCocosEngineSource(fs.readFileSync(enginePath, 'utf8'), enginePath);
  const uniSdkSource = patchUniSdkSource(
    patchUniSdkCopyrightSource(fs.readFileSync(uniSdkPath, 'utf8'), config.copyright, uniSdkPath),
    uniSdkPath,
  );
  const subpackagePlans = planSubpackages(tree, config.subpackages);

  const runtimeTarget = normalizedLayout
    ? path.join(tree, 'runtime-adapter')
    : path.join(tree, 'src', 'runtime-adapter');
  const files = [
    [path.join(vivoRuntime, 'ral.min.js'), path.join(runtimeTarget, 'ral.js')],
    [path.join(commonRuntime, 'web-adapter.min.js'), path.join(runtimeTarget, 'web-adapter.js')],
    [path.join(vivoRuntime, 'engine-adapter.min.js'), path.join(runtimeTarget, 'engine-adapter.js')],
  ];
  for (const [source] of files) {
    if (!fs.existsSync(source)) {
      throw new Error(`Missing Cocos adapter source: ${source}`);
    }
  }

  return {
    tree,
    runtimeTarget,
    files,
    mainPath,
    mainSource,
    settingsPath,
    settings,
    manifestPath,
    manifest,
    enginePath,
    engineSource,
    uniSdkPath,
    uniSdkSource,
    subpackagePlans,
  };
}

function applyTreePlan(plan) {
  const {
    tree,
    runtimeTarget,
    files,
    mainPath,
    mainSource,
    settingsPath,
    settings,
    manifestPath,
    manifest,
    enginePath,
    engineSource,
    uniSdkPath,
    uniSdkSource,
    subpackagePlans,
  } = plan;

  fs.mkdirSync(runtimeTarget, { recursive: true });
  for (const [source, target] of files) {
    copyRequired(source, target);
  }
  fs.writeFileSync(mainPath, mainSource);
  writeJson(settingsPath, settings);
  writeJson(manifestPath, manifest);
  fs.writeFileSync(enginePath, engineSource);
  fs.writeFileSync(uniSdkPath, uniSdkSource);
  applySubpackagePlans(tree, subpackagePlans);

  return {
    tree,
    runtimeTarget,
    enginePath,
    uniSdkPath,
  };
}

function patchRuntimeProject({ projectDir, adapterRoot, config, version }) {
  if (!projectDir || !adapterRoot || !config || !version) {
    throw new Error('projectDir, adapterRoot, config, and version are required');
  }
  const buildDir = path.join(projectDir, 'build');
  const plans = [planTree({ tree: projectDir, adapterRoot, config, version })];
  if (fs.existsSync(buildDir)) {
    plans.push(planTree({ tree: buildDir, adapterRoot, config, version }));
  }
  const trees = plans.map(applyTreePlan);
  return { projectDir, trees };
}

module.exports = {
  normalizeStartupRequirePaths,
  patchMainSource,
  patchCocosEngineSource,
  patchUniSdkCopyrightSource,
  patchUniSdkSource,
  patchManifest,
  patchSettings,
  prepareSubpackages,
  patchRuntimeProject,
};
