const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
let ts;
try {
    ts = require('typescript');
} catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    ts = require('/Applications/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
}

function parseTypeScript(fileName, source) {
    const sourceFile = ts.createSourceFile(
        fileName,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );
    assert.equal(
        sourceFile.parseDiagnostics.length,
        0,
        `TypeScript parser errors found in ${fileName}.`,
    );
    return sourceFile;
}

function hasNode(sourceFile, predicate) {
    let found = false;

    function visit(node) {
        if (found) return;
        if (predicate(node)) {
            found = true;
            return;
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return found;
}

function isIdentifier(node, name) {
    return ts.isIdentifier(node) && node.text === name;
}

function isThisExpression(node) {
    return node.kind === ts.SyntaxKind.ThisKeyword;
}

function isPropertyPath(node, parts) {
    const propertyName = parts[parts.length - 1];
    if (parts.length === 1) return isIdentifier(node, propertyName);
    return ts.isPropertyAccessExpression(node) &&
        node.name.text === propertyName &&
        isPropertyPath(node.expression, parts.slice(0, -1));
}

function isThisProperty(node, propertyName) {
    return ts.isPropertyAccessExpression(node) &&
        isThisExpression(node.expression) &&
        node.name.text === propertyName;
}

function isCallTo(node, propertyPath) {
    return ts.isCallExpression(node) && isPropertyPath(node.expression, propertyPath);
}

function unwrapParentheses(node) {
    let expression = node;
    while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
    return expression;
}

function isStoragePrivacyAccess(node) {
    if (!ts.isPropertyAccessExpression(node) || node.name.text !== 'showPrivacy') return false;

    const userSettingAccess = node.expression;
    if (!ts.isPropertyAccessExpression(userSettingAccess) ||
        userSettingAccess.name.text !== 'userSetting') {
        return false;
    }

    const getDataCall = userSettingAccess.expression;
    return ts.isCallExpression(getDataCall) &&
        getDataCall.arguments.length === 0 &&
        isPropertyPath(getDataCall.expression, ['StorageSystem', 'getData']);
}

function hasStoragePrivacyGate(sourceFile) {
    return hasNode(sourceFile, (node) => {
        if (!ts.isIfStatement(node)) return false;
        const condition = unwrapParentheses(node.expression);
        return ts.isPrefixUnaryExpression(condition) &&
            condition.operator === ts.SyntaxKind.ExclamationToken &&
            isStoragePrivacyAccess(unwrapParentheses(condition.operand));
    });
}

function hasEventManagerPrivacyOnce(sourceFile) {
    return hasNode(sourceFile, (node) => {
        if (!isCallTo(node, ['EventManager', 'once']) || node.arguments.length !== 3) return false;
        const [eventName, callback, target] = node.arguments;
        return isPropertyPath(eventName, ['EventTypes', 'UIEvents', 'PrivacyConfirm']) &&
            isThisProperty(callback, 'showMainUI') &&
            isThisExpression(target);
    });
}

function hasPrivacyUIShow(sourceFile) {
    return hasNode(sourceFile, (node) => {
        if (!isCallTo(node, ['UISystem', 'showUI']) || node.arguments.length < 2) return false;
        const [uiName, options] = node.arguments;
        if (!isPropertyPath(uiName, ['UIEnum', 'PrivacyUI']) ||
            !ts.isObjectLiteralExpression(options)) {
            return false;
        }

        return options.properties.some((property) =>
            ts.isPropertyAssignment(property) &&
            ((ts.isIdentifier(property.name) && property.name.text === 'isLobby') ||
                (ts.isStringLiteral(property.name) && property.name.text === 'isLobby')) &&
            property.initializer.kind === ts.SyntaxKind.FalseKeyword,
        );
    });
}

function hasPrivateShowMainUI(sourceFile) {
    return hasNode(sourceFile, (node) =>
        ts.isMethodDeclaration(node) &&
        isIdentifier(node.name, 'showMainUI') &&
        node.parameters.length === 0 &&
        Boolean(node.modifiers && node.modifiers.some(
            (modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword,
        )),
    );
}

function hasStartButtonResolution(sourceFile) {
    return hasNode(sourceFile, (node) =>
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'getChildByName' &&
        node.arguments.length === 1 &&
        ts.isStringLiteral(node.arguments[0]) &&
        node.arguments[0].text === 'startBtn',
    );
}

function isStartButtonReference(node) {
    return isIdentifier(node, 'startBtn') || isThisProperty(node, 'startBtn');
}

function hasStartButtonListener(sourceFile, methodName) {
    return hasNode(sourceFile, (node) => {
        if (!ts.isCallExpression(node) ||
            !ts.isPropertyAccessExpression(node.expression) ||
            node.expression.name.text !== methodName ||
            !isStartButtonReference(node.expression.expression) ||
            node.arguments.length !== 3) {
            return false;
        }

        const [eventName, callback, target] = node.arguments;
        return isPropertyPath(eventName, ['Node', 'EventType', 'TOUCH_END']) &&
            isThisProperty(callback, 'onGameStartClick') &&
            isThisExpression(target);
    });
}

const supportedSyntaxFixture = parseTypeScript('supported-syntax.ts', `
class ReviewFixture {
    private showMainUI() {}

    run() {
        const startBtn = this.node.getChildByName('startBtn');
        if (!StorageSystem.getData().userSetting.showPrivacy) {
            EventManager.once(EventTypes.UIEvents.PrivacyConfirm, this.showMainUI, this);
            UISystem.showUI(UIEnum.PrivacyUI, { isLobby: false });
        }
        startBtn?.on(Node.EventType.TOUCH_END, this.onGameStartClick, this);
        startBtn?.off(Node.EventType.TOUCH_END, this.onGameStartClick, this);
    }
}
`);
const ignoredSyntaxFixture = parseTypeScript('ignored-syntax.ts', [
    String.raw`const commentPattern = /\/\/.*|\/\*[\s\S]*?\*\//g;`,
    '// StorageSystem.getData().userSetting.showPrivacy',
    "const ignoredMethod = 'private showMainUI() {}';",
    "const ignoredStartButton = \"this.node.getChildByName('startBtn')\";",
    'const ignoredCalls = `',
    'EventManager.once(EventTypes.UIEvents.PrivacyConfirm, this.showMainUI, this);',
    'UISystem.showUI(UIEnum.PrivacyUI, { isLobby: false });',
    'startBtn?.on(Node.EventType.TOUCH_END, this.onGameStartClick, this);',
    'startBtn?.off(Node.EventType.TOUCH_END, this.onGameStartClick, this);',
    '`;',
].join('\n'));
const astChecks = [
    ['stored privacy gate', hasStoragePrivacyGate],
    ['privacy confirmation listener', hasEventManagerPrivacyOnce],
    ['privacy UI call', hasPrivacyUIShow],
    ['private showMainUI method', hasPrivateShowMainUI],
    ['start button resolution', hasStartButtonResolution],
    ['start button on listener', (sourceFile) => hasStartButtonListener(sourceFile, 'on')],
    ['start button off listener', (sourceFile) => hasStartButtonListener(sourceFile, 'off')],
];

for (const [checkName, check] of astChecks) {
    assert.equal(check(supportedSyntaxFixture), true, `AST check must recognize ${checkName}.`);
    assert.equal(check(ignoredSyntaxFixture), false, `AST check must ignore inert ${checkName} text.`);
}

const initSourceFile = parseTypeScript(
    'assets/Init/InitScripts/Init.ts',
    fs.readFileSync(path.join(projectRoot, 'assets/Init/InitScripts/Init.ts'), 'utf8'),
);
const homeUISourceFile = parseTypeScript(
    'assets/UI/HomeUI/HomeUI.ts',
    fs.readFileSync(path.join(projectRoot, 'assets/UI/HomeUI/HomeUI.ts'), 'utf8'),
);
const homeUIPrefab = JSON.parse(fs.readFileSync(
    path.join(projectRoot, 'assets/UI/HomeUI/HomeUI.prefab'),
    'utf8',
));
const panelNodeIndex = homeUIPrefab.findIndex(
    (entry) => entry && entry.__type__ === 'cc.Node' && entry._name === 'panel',
);
const startButtonNode = homeUIPrefab.find(
    (entry) => entry && entry.__type__ === 'cc.Node' && entry._name === 'startBtn',
);

assert.ok(
    hasStoragePrivacyGate(initSourceFile),
    'Init must gate first launch with the stored privacy flag.',
);
assert.ok(
    hasEventManagerPrivacyOnce(initSourceFile),
    'Init must show the main UI once privacy is confirmed.',
);
assert.ok(
    hasPrivacyUIShow(initSourceFile),
    'Init must show the privacy UI in first-launch mode.',
);
assert.ok(
    hasPrivateShowMainUI(initSourceFile),
    'Init must define a private showMainUI method.',
);
assert.ok(
    hasStartButtonResolution(homeUISourceFile),
    'HomeUI must resolve startBtn by name.',
);
assert.ok(
    hasStartButtonListener(homeUISourceFile, 'on'),
    'HomeUI must bind startBtn TOUCH_END to onGameStartClick.',
);
assert.ok(
    hasStartButtonListener(homeUISourceFile, 'off'),
    'HomeUI must remove the startBtn TOUCH_END listener.',
);
assert.notEqual(
    panelNodeIndex,
    -1,
    'HomeUI.prefab must contain a node named panel.',
);
assert.ok(
    startButtonNode,
    'HomeUI.prefab must contain a node named startBtn.',
);
assert.equal(
    startButtonNode._parent && startButtonNode._parent.__id__,
    panelNodeIndex,
    'HomeUI.prefab startBtn must be a direct child of panel.',
);

console.log('Xiaomi review regression checks passed.');
