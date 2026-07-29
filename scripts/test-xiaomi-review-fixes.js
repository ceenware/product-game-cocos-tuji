const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

const initSource = fs.readFileSync(
    path.join(projectRoot, 'assets/Init/InitScripts/Init.ts'),
    'utf8',
);
const homeUISource = fs.readFileSync(
    path.join(projectRoot, 'assets/UI/HomeUI/HomeUI.ts'),
    'utf8',
);
const homeUIPrefab = JSON.parse(fs.readFileSync(
    path.join(projectRoot, 'assets/UI/HomeUI/HomeUI.prefab'),
    'utf8',
));

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
    /(?:this\s*\.\s*)?startBtn\s*\.\s*on\s*\(\s*Node\s*\.\s*EventType\s*\.\s*TOUCH_END\s*,\s*this\s*\.\s*onGameStartClick\s*,\s*this\s*\)/,
    'HomeUI must bind startBtn TOUCH_END to onGameStartClick.',
);
assert.match(
    homeUISource,
    /(?:this\s*\.\s*)?startBtn\s*\.\s*off\s*\(\s*Node\s*\.\s*EventType\s*\.\s*TOUCH_END\s*,\s*this\s*\.\s*onGameStartClick\s*,\s*this\s*\)/,
    'HomeUI must remove the startBtn TOUCH_END listener.',
);
assert.ok(
    homeUIPrefab.some((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === 'startBtn'),
    'HomeUI.prefab must contain a node named startBtn.',
);

console.log('Xiaomi review regression checks passed.');
