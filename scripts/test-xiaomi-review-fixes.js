const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

function stripTypeScriptComments(source) {
    const output = [];
    const templateExpressionDepths = [];
    let mode = 'code';

    for (let index = 0; index < source.length; index++) {
        const character = source[index];
        const nextCharacter = source[index + 1];

        if (mode === 'lineComment') {
            if (character === '\n' || character === '\r') {
                output.push(character);
                mode = 'code';
            } else {
                output.push(' ');
            }
            continue;
        }

        if (mode === 'blockComment') {
            if (character === '*' && nextCharacter === '/') {
                output.push(' ', ' ');
                index++;
                mode = 'code';
            } else {
                output.push(character === '\n' || character === '\r' ? character : ' ');
            }
            continue;
        }

        if (mode === 'singleQuote' || mode === 'doubleQuote') {
            output.push(character);
            if (character === '\\' && nextCharacter !== undefined) {
                output.push(nextCharacter);
                index++;
            } else if (
                (mode === 'singleQuote' && character === "'") ||
                (mode === 'doubleQuote' && character === '"')
            ) {
                mode = 'code';
            }
            continue;
        }

        if (mode === 'template') {
            output.push(character);
            if (character === '\\' && nextCharacter !== undefined) {
                output.push(nextCharacter);
                index++;
            } else if (character === '`') {
                mode = 'code';
            } else if (character === '$' && nextCharacter === '{') {
                output.push(nextCharacter);
                index++;
                templateExpressionDepths.push(1);
                mode = 'code';
            }
            continue;
        }

        if (character === '/' && nextCharacter === '/') {
            output.push(' ', ' ');
            index++;
            mode = 'lineComment';
            continue;
        }
        if (character === '/' && nextCharacter === '*') {
            output.push(' ', ' ');
            index++;
            mode = 'blockComment';
            continue;
        }
        if (character === "'") {
            output.push(character);
            mode = 'singleQuote';
            continue;
        }
        if (character === '"') {
            output.push(character);
            mode = 'doubleQuote';
            continue;
        }
        if (character === '`') {
            output.push(character);
            mode = 'template';
            continue;
        }

        output.push(character);
        if (templateExpressionDepths.length > 0) {
            const depthIndex = templateExpressionDepths.length - 1;
            if (character === '{') {
                templateExpressionDepths[depthIndex]++;
            } else if (character === '}') {
                templateExpressionDepths[depthIndex]--;
                if (templateExpressionDepths[depthIndex] === 0) {
                    templateExpressionDepths.pop();
                    mode = 'template';
                }
            }
        }
    }

    return output.join('');
}

const strippedFixture = stripTypeScriptComments([
    'const doubleQuoted = "// retained /* retained */"; // removed',
    "const singleQuoted = '/* retained */'; /* removed */",
    'const template = `// retained ${value /* removed */}`;',
].join('\n'));
assert.ok(strippedFixture.includes('"// retained /* retained */"'));
assert.ok(strippedFixture.includes("'/* retained */'"));
assert.ok(strippedFixture.includes('`// retained ${value'));
assert.doesNotMatch(strippedFixture, /removed/);

const initSource = stripTypeScriptComments(fs.readFileSync(
    path.join(projectRoot, 'assets/Init/InitScripts/Init.ts'),
    'utf8',
));
const homeUISource = stripTypeScriptComments(fs.readFileSync(
    path.join(projectRoot, 'assets/UI/HomeUI/HomeUI.ts'),
    'utf8',
));
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
const startButtonOnPattern = /(?:this\s*\.\s*)?startBtn\s*(?:\?\.|\.)\s*on\s*\(\s*Node\s*\.\s*EventType\s*\.\s*TOUCH_END\s*,\s*this\s*\.\s*onGameStartClick\s*,\s*this\s*\)/;
const startButtonOffPattern = /(?:this\s*\.\s*)?startBtn\s*(?:\?\.|\.)\s*off\s*\(\s*Node\s*\.\s*EventType\s*\.\s*TOUCH_END\s*,\s*this\s*\.\s*onGameStartClick\s*,\s*this\s*\)/;

assert.match('startBtn.on(Node.EventType.TOUCH_END, this.onGameStartClick, this)', startButtonOnPattern);
assert.match('startBtn?.on(Node.EventType.TOUCH_END, this.onGameStartClick, this)', startButtonOnPattern);
assert.match('startBtn.off(Node.EventType.TOUCH_END, this.onGameStartClick, this)', startButtonOffPattern);
assert.match('startBtn?.off(Node.EventType.TOUCH_END, this.onGameStartClick, this)', startButtonOffPattern);

assert.match(
    initSource,
    /if\s*\(\s*!\s*StorageSystem\s*\.\s*getData\s*\(\s*\)\s*\.\s*userSetting\s*\.\s*showPrivacy\s*\)/,
    'Init must gate first launch with the stored privacy flag.',
);
assert.match(
    initSource,
    /EventManager\s*\.\s*once\s*\(\s*EventTypes\s*\.\s*UIEvents\s*\.\s*PrivacyConfirm\s*,\s*this\s*\.\s*showMainUI\s*,\s*this\s*\)/,
    'Init must show the main UI once privacy is confirmed.',
);
assert.match(
    initSource,
    /UISystem\s*\.\s*showUI\s*\(\s*UIEnum\s*\.\s*PrivacyUI\s*,\s*\{\s*isLobby\s*:\s*false\s*\}\s*\)/,
    'Init must show the privacy UI in first-launch mode.',
);
assert.match(
    initSource,
    /private\s+showMainUI\s*\(\s*\)/,
    'Init must define a private showMainUI method.',
);
assert.match(
    homeUISource,
    /getChildByName\s*\(\s*['"]startBtn['"]\s*\)/,
    'HomeUI must resolve startBtn by name.',
);
assert.match(
    homeUISource,
    startButtonOnPattern,
    'HomeUI must bind startBtn TOUCH_END to onGameStartClick.',
);
assert.match(
    homeUISource,
    startButtonOffPattern,
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
