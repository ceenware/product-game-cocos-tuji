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

function loadTranspiledHomeUI(ccMock, BasicUIMock, dependencyOverrides = {}) {
    const fileName = 'assets/UI/HomeUI/HomeUI.ts';
    const source = fs.readFileSync(path.join(projectRoot, fileName), 'utf8');
    const result = ts.transpileModule(source, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2018,
            module: ts.ModuleKind.CommonJS,
            experimentalDecorators: true,
        },
        fileName,
        reportDiagnostics: true,
    });
    assert.equal(
        result.diagnostics && result.diagnostics.length,
        0,
        'HomeUI runtime fixture must transpile without diagnostics.',
    );

    const dependencies = {
        cc: ccMock,
        '../../Init/Basic/BasicUI': { BasicUI: BasicUIMock },
        '../../Init/InitScripts/Init': {
            Init: { PrivacyPolicyVersion: 'douyin-2026-08-20' },
        },
        '../../Init/Managers/EventTypes': {
            EventTypes: {
                TouchEvents: { TouchStart: 1 },
                GameEvents: { EnterChooseLv: 2 },
                UIEvents: { PrivacyConfirm: 3 },
            },
        },
        '../../Init/SystemAudio/AudioEnum': { AudioEnum: {} },
        '../../Init/SystemAudio/AudioSystem': { AudioSystem: {} },
        '../../Init/SystemSDK/SDKSystem': { SDKSystem: {}, PlatformType: {} },
        '../../Init/SystemStorage/StorageSystem': { StorageSystem: {} },
        '../../Init/SystemUI/UIEnum': { UIEnum: {} },
        '../../Init/SystemUI/UISystem': { UISystem: {} },
        ...dependencyOverrides,
    };
    const mockRequire = (request) => {
        assert.ok(
            Object.prototype.hasOwnProperty.call(dependencies, request),
            `Unexpected HomeUI runtime dependency: ${request}`,
        );
        return dependencies[request];
    };
    const module = { exports: {} };
    const execute = new Function('require', 'module', 'exports', result.outputText);
    execute(mockRequire, module, module.exports);
    return module.exports.HomeUI;
}

function loadTranspiledInit(dependencies) {
    const fileName = 'assets/Init/InitScripts/Init.ts';
    const source = fs.readFileSync(path.join(projectRoot, fileName), 'utf8');
    const result = ts.transpileModule(source, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2018,
            module: ts.ModuleKind.CommonJS,
            experimentalDecorators: true,
        },
        fileName,
        reportDiagnostics: true,
    });
    assert.equal(
        result.diagnostics && result.diagnostics.length,
        0,
        'Init runtime fixture must transpile without diagnostics.',
    );

    const mockRequire = (request) => {
        assert.ok(
            Object.prototype.hasOwnProperty.call(dependencies, request),
            `Unexpected Init runtime dependency: ${request}`,
        );
        return dependencies[request];
    };
    const module = { exports: {} };
    const execute = new Function('require', 'module', 'exports', result.outputText);
    execute(mockRequire, module, module.exports);
    return module.exports.Init;
}

function assertPrivacyConsentPrecedesDeferredSystems() {
    let sdkInitCalls = 0;
    let advertInitCalls = 0;
    let privacyShowCalls = 0;
    let mainUIShowCalls = 0;
    let initFinishedEvents = 0;
    let privacyOffCalls = 0;
    let privacyCallback = null;
    let privacyTarget = null;
    const privacyHandler = { id: 7 };

    const StorageSystem = {
        isInitFinished: true,
        init() {},
        getData() {
            return { userSetting: { showPrivacy: true } };
        },
    };
    const AudioSystem = { isInitFinished: true, init() {} };
    const SDKSystem = {
        isInitFinished: false,
        init() {
            sdkInitCalls += 1;
        },
    };
    const AdvertSystem = {
        isInitFinished: false,
        init() {
            advertInitCalls += 1;
            this.isInitFinished = true;
        },
    };
    const UISystem = {
        isInitFinished: true,
        init() {},
        showUI(name, options) {
            assert.equal(name, 'PrivacyUI');
            assert.deepEqual(options, { isLobby: false });
            privacyShowCalls += 1;
        },
    };
    const EventManager = {
        once(type, callback, target) {
            assert.equal(type, 2);
            privacyCallback = callback;
            privacyTarget = target;
            return privacyHandler;
        },
        emit(type) {
            if (type === 1) initFinishedEvents += 1;
        },
        off(type, handler) {
            assert.equal(type, 2);
            assert.equal(handler, privacyHandler);
            privacyOffCalls += 1;
        },
    };
    const ccMock = {
        _decorator: {
            ccclass: () => (target) => target,
            property: () => () => {},
        },
        Component: class {},
        Node: class {},
        Camera: class {},
        Canvas: class {},
    };
    const originalUniSdk = global.uniSdk;
    global.uniSdk = { Global: { isXiaoMiGame: true } };
    const Init = loadTranspiledInit({
        cc: ccMock,
        '../Config/GlobalData': { default: { set() {} } },
        '../Config/GlobalEnum': { GlobalEnum: { GlobalDataType: {} } },
        '../Managers/EventManager': { default: EventManager },
        '../Managers/EventTypes': {
            EventTypes: {
                GameEvents: { InitLoadFinished: 1 },
                UIEvents: { PrivacyConfirm: 2 },
            },
        },
        '../SystemAdvert/AdvertSystem': { AdvertSystem },
        '../SystemAudio/AudioSystem': { AudioSystem },
        '../SystemSDK/SDKSystem': { SDKSystem },
        '../SystemStorage/StorageSystem': { StorageSystem },
        '../SystemUI/UIEnum': {
            UIEnum: { PrivacyUI: 'PrivacyUI', CustomAdUI: 'CustomAdUI', HomeUI: 'HomeUI' },
        },
        '../SystemUI/UISystem': { UISystem },
        '../Tools/ColorLog': { clog: { log() {} } },
        '../Tools/Loader': { default: { loadBundle() {} } },
    });

    const init = new Init();
    init.uiLayer = {};
    init.showMainUI = () => {
        mainUIShowCalls += 1;
    };

    init.initSystems();
    assert.equal(sdkInitCalls, 0, 'SDK initialization must wait for privacy consent.');
    assert.equal(advertInitCalls, 0, 'Advert initialization must wait for privacy consent.');

    init.checkSysInitState();
    init.checkSysInitState();
    assert.equal(privacyShowCalls, 1, 'Privacy UI must only be shown once while awaiting consent.');
    assert.equal(sdkInitCalls, 0, 'Polling must not initialize the SDK before consent.');
    assert.equal(mainUIShowCalls, 0, 'Main UI must remain hidden before consent.');

    assert.equal(typeof privacyCallback, 'function', 'Privacy confirmation callback must be registered.');
    privacyCallback.call(privacyTarget);
    assert.equal(sdkInitCalls, 1, 'Consent must start SDK initialization exactly once.');
    assert.equal(advertInitCalls, 1, 'Consent must start advert initialization exactly once.');
    assert.equal(mainUIShowCalls, 0, 'Main UI must wait for deferred systems to finish.');

    SDKSystem.isInitFinished = true;
    init.checkSysInitState();
    init.checkSysInitState();
    assert.equal(mainUIShowCalls, 1, 'Main UI must start exactly once after consent and initialization.');
    assert.equal(initFinishedEvents, 1, 'Init completion event must be emitted exactly once.');

    global.uniSdk.Global.isXiaoMiGame = false;
    SDKSystem.isInitFinished = false;
    AdvertSystem.isInitFinished = false;
    const nonXiaomiInit = new Init();
    nonXiaomiInit.uiLayer = {};
    nonXiaomiInit.initSystems();
    assert.equal(sdkInitCalls, 2, 'Non-Xiaomi platforms must keep their existing SDK startup timing.');
    assert.equal(advertInitCalls, 2, 'Non-Xiaomi platforms must keep advert event handlers available.');

    global.uniSdk.Global.isXiaoMiGame = true;
    const cleanupInit = new Init();
    cleanupInit.uiLayer = {};
    cleanupInit.initSystems();
    cleanupInit.checkSysInitState();
    cleanupInit.mainUITimeout = 11;
    cleanupInit.preloadTimeout = 22;
    const clearedTimeouts = [];
    const originalClearTimeout = global.clearTimeout;
    global.clearTimeout = (timeoutId) => {
        clearedTimeouts.push(timeoutId);
    };
    try {
        cleanupInit.onDestroy();
    } finally {
        global.clearTimeout = originalClearTimeout;
        global.uniSdk = originalUniSdk;
    }
    assert.equal(privacyOffCalls, 1, 'Destroy must remove a pending privacy confirmation listener.');
    assert.deepEqual(clearedTimeouts, [11, 22], 'Destroy must clear pending startup timers.');
}

function assertDouyinPrivacyConsentPrecedesDeferredSystems() {
    let sdkInitCalls = 0;
    let advertInitCalls = 0;
    let privacyShowCalls = 0;
    let mainUIShowCalls = 0;
    let privacyCallback = null;
    let privacyTarget = null;
    const privacyHandler = { id: 9 };

    const StorageSystem = {
        isInitFinished: true,
        init() {},
        getData() {
            return { userSetting: { showPrivacy: false, privacyVersion: '' } };
        },
    };
    const AudioSystem = { isInitFinished: true, init() {} };
    const SDKSystem = {
        isInitFinished: false,
        init() {
            sdkInitCalls += 1;
        },
    };
    const AdvertSystem = {
        isInitFinished: false,
        init() {
            advertInitCalls += 1;
            this.isInitFinished = true;
        },
    };
    const UISystem = {
        isInitFinished: true,
        init() {},
        showUI(name, options) {
            assert.equal(name, 'PrivacyUI');
            assert.deepEqual(options, { isLobby: false });
            privacyShowCalls += 1;
        },
    };
    const EventManager = {
        once(type, callback, target) {
            assert.equal(type, 2);
            privacyCallback = callback;
            privacyTarget = target;
            return privacyHandler;
        },
        emit() {},
        off() {},
    };
    const ccMock = {
        _decorator: {
            ccclass: () => (target) => target,
            property: () => () => {},
        },
        Component: class {},
        Node: class {},
        Camera: class {},
        Canvas: class {},
    };
    const originalUniSdk = global.uniSdk;
    global.uniSdk = { Global: { isXiaoMiGame: false, isTTGame: true } };
    const Init = loadTranspiledInit({
        cc: ccMock,
        '../Config/GlobalData': { default: { set() {} } },
        '../Config/GlobalEnum': { GlobalEnum: { GlobalDataType: {} } },
        '../Managers/EventManager': { default: EventManager },
        '../Managers/EventTypes': {
            EventTypes: {
                GameEvents: { InitLoadFinished: 1 },
                UIEvents: { PrivacyConfirm: 2 },
            },
        },
        '../SystemAdvert/AdvertSystem': { AdvertSystem },
        '../SystemAudio/AudioSystem': { AudioSystem },
        '../SystemSDK/SDKSystem': { SDKSystem },
        '../SystemStorage/StorageSystem': { StorageSystem },
        '../SystemUI/UIEnum': {
            UIEnum: { PrivacyUI: 'PrivacyUI', CustomAdUI: 'CustomAdUI', HomeUI: 'HomeUI' },
        },
        '../SystemUI/UISystem': { UISystem },
        '../Tools/ColorLog': { clog: { log() {} } },
        '../Tools/Loader': { default: { loadBundle() {} } },
    });

    try {
        const init = new Init();
        init.uiLayer = {};
        init.showMainUI = () => {
            mainUIShowCalls += 1;
        };

        init.initSystems();
        assert.equal(sdkInitCalls, 0, 'Douyin SDK initialization must wait for privacy consent.');
        assert.equal(advertInitCalls, 0, 'Douyin advert initialization must wait for privacy consent.');

        init.checkSysInitState();
        init.checkSysInitState();
        assert.equal(privacyShowCalls, 1, 'Douyin must show the updated privacy UI before startup.');
        assert.equal(mainUIShowCalls, 0, 'Douyin main UI must remain hidden before consent.');

        assert.equal(typeof privacyCallback, 'function', 'Douyin privacy confirmation callback must be registered.');
        privacyCallback.call(privacyTarget);
        assert.equal(sdkInitCalls, 1, 'Douyin consent must start SDK initialization exactly once.');
        assert.equal(advertInitCalls, 1, 'Douyin consent must start advert initialization exactly once.');

        SDKSystem.isInitFinished = true;
        init.checkSysInitState();
        assert.equal(mainUIShowCalls, 1, 'Douyin main UI must start once after consent and SDK initialization.');
    } finally {
        global.uniSdk = originalUniSdk;
    }
}

function loadTranspiledPrivacyUI(ccMock, BasicUIMock, dependencyOverrides = {}) {
    const fileName = 'assets/UI/PrivacyUI/PrivacyUI.ts';
    const source = fs.readFileSync(path.join(projectRoot, fileName), 'utf8');
    const result = ts.transpileModule(source, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2018,
            module: ts.ModuleKind.CommonJS,
            experimentalDecorators: true,
        },
        fileName,
        reportDiagnostics: true,
    });
    assert.equal(
        result.diagnostics && result.diagnostics.length,
        0,
        'PrivacyUI runtime fixture must transpile without diagnostics.',
    );

    const dependencies = {
        cc: ccMock,
        '../../Init/Basic/BasicUI': { BasicUI: BasicUIMock },
        '../../Init/InitScripts/Init': {
            Init: { PrivacyPolicyVersion: 'douyin-2026-08-20' },
        },
        '../../Init/Managers/EventTypes': {
            EventTypes: {
                SDKEvents: { ExitApp: 'exit-app' },
                UIEvents: { PrivacyConfirm: 'privacy-confirm' },
            },
        },
        '../../Init/SystemStorage/StorageSystem': { StorageSystem: {} },
        '../../Init/SystemUI/UIEnum': { UIEnum: {} },
        '../../Init/SystemUI/UISystem': { UISystem: {} },
        ...dependencyOverrides,
    };
    const mockRequire = (request) => {
        assert.ok(
            Object.prototype.hasOwnProperty.call(dependencies, request),
            `Unexpected PrivacyUI runtime dependency: ${request}`,
        );
        return dependencies[request];
    };
    const module = { exports: {} };
    const execute = new Function('require', 'module', 'exports', result.outputText);
    execute(mockRequire, module, module.exports);
    return module.exports.PrivacyUI;
}

function assertPrivacyUITextContainsDouyinOperatorDetails() {
    class BasicUIMock {
        show() {}
    }
    class LabelMock {}
    const label = new LabelMock();
    const ccMock = {
        _decorator: {
            ccclass: () => (target) => target,
            property: () => () => {},
        },
        Component: class {},
        Node: class {},
        Label: LabelMock,
    };
    const PrivacyUI = loadTranspiledPrivacyUI(ccMock, BasicUIMock);
    const privacyUI = new PrivacyUI();
    privacyUI.node = {
        getChildByPath(pathName) {
            assert.equal(pathName, 'bg/ScrollView/view/content/label1');
            return {
                getComponent(ComponentType) {
                    assert.equal(ComponentType, LabelMock);
                    return label;
                },
            };
        },
    };

    privacyUI.onLoad();
    assert.match(label.string, /巴中宜辰网络科技有限公司/, 'Privacy text must include the certified operator name.');
    assert.match(label.string, /四川省巴中市巴州区巴州大道37号办公楼202号/, 'Privacy text must include the operator address.');
    assert.match(label.string, /vicky@ceenmobi\.com/, 'Privacy text must include the operator contact email.');
    assert.doesNotMatch(label.string, /\n\s*\n/, 'Privacy text must not contain blank lines that can be interpreted as empty or meaningless content.');
    assert.doesNotMatch(label.string, /__USER_AGENT_NAME__|2711205782@qq\.com|3628946269@qq\.com/, 'Privacy text must not use legacy SDK placeholders or stale emails.');
}

function assertEarlyStartWaitsForLevelLoad() {
    class BasicUIMock {
        emit() {}
    }
    class NodeMock {}
    NodeMock.EventType = { TOUCH_END: 'touch-end' };
    const ccMock = {
        _decorator: {
            ccclass: () => (target) => target,
            property: () => () => {},
        },
        Component: class {},
        Node: NodeMock,
        UIOpacity: class {},
        tween: () => {},
        Label: class {},
        v3: () => {},
        Tween: class {},
        isValid: () => true,
    };
    const HomeUI = loadTranspiledHomeUI(ccMock, BasicUIMock, {
        '../../Init/SystemUI/UIEnum': {
            UIEnum: { LevelController: 'LevelController', LevelInfoUI: 'LevelInfoUI' },
        },
        '../../Init/SystemUI/UISystem': { UISystem: { showUI() {} } },
    });
    const homeUI = new HomeUI();
    let enterGameCalls = 0;
    homeUI.enterGame = () => {
        enterGameCalls += 1;
    };
    homeUI.touchMask = { active: false };
    homeUI.finger = { active: false };
    homeUI.bgOpacity = null;

    homeUI.onGameStartClick();
    homeUI.onGameStartClick();
    assert.equal(enterGameCalls, 0, 'Start requests must wait until the level is loaded.');

    homeUI.onGameLoadFinish();
    assert.equal(enterGameCalls, 1, 'A queued start request must run once after level loading.');

    homeUI.onGameStartClick();
    assert.equal(enterGameCalls, 1, 'Repeated start input must not start the level twice.');

    const loadedHomeUI = new HomeUI();
    let loadedEnterGameCalls = 0;
    loadedHomeUI.isLoadLvFinish = true;
    loadedHomeUI.enterGame = () => {
        loadedEnterGameCalls += 1;
    };
    loadedHomeUI.onGameStartClick();
    loadedHomeUI.onGameStartClick();
    assert.equal(
        loadedEnterGameCalls,
        1,
        'The first click after loading must start immediately and repeated input must be ignored.',
    );
}

function assertHomeUIShowDoesNotStartLevelBeforePlayerInput() {
    const emittedEvents = [];
    class BasicUIMock {
        show() {}

        emit(eventName) {
            emittedEvents.push(eventName);
        }
    }

    class NodeMock {
        constructor(name = '') {
            this.name = name;
            this._name = name;
            this.active = true;
            this.isValid = true;
        }

        getChildByName() {
            return null;
        }
    }
    NodeMock.EventType = { TOUCH_END: 'touch-end' };

    const previousUniSdk = global.uniSdk;
    global.uniSdk = {
        Global: {
            isVivogame: false,
            isOppogame: false,
        },
    };

    try {
        const GameEvents = { GameStart: 'game-start' };
        const HomeUI = loadTranspiledHomeUI({
            _decorator: {
                ccclass: () => (target) => target,
                property: () => () => {},
            },
            Component: class {},
            Node: NodeMock,
            UIOpacity: class {},
            tween: () => {},
            Label: class {},
            LabelOutline: class {},
            Graphics: class {},
            Color: class {},
            UITransform: class {},
            v3: () => {},
            Tween: class {},
            isValid: (node) => Boolean(node && node.isValid !== false),
        }, BasicUIMock, {
            '../../Init/Managers/EventTypes': {
                EventTypes: {
                    TouchEvents: { TouchStart: 'touch-start' },
                    GameEvents,
                    UIEvents: { PrivacyConfirm: 'privacy-confirm' },
                },
            },
            '../../Init/SystemAudio/AudioEnum': { AudioEnum: { homeBgm: 'home-bgm' } },
            '../../Init/SystemAudio/AudioSystem': { AudioSystem: { playBGM() {} } },
            '../../Init/SystemSDK/SDKSystem': {
                SDKSystem: { _curPlatform: 0 },
                PlatformType: { PCMiniGame: 0, TTMiniGame: 4, OPPOMiniGame: 2, VIVOMiniGame: 3 },
            },
            '../../Init/SystemStorage/StorageSystem': {
                StorageSystem: { getData: () => ({ levelAssets: { curLv: 1 } }) },
            },
            '../../Init/SystemUI/UIEnum': {
                UIEnum: { PlayerAssetsUI: 'PlayerAssetsUI' },
            },
            '../../Init/SystemUI/UISystem': { UISystem: { showUI() {} } },
        });

        const homeUI = new HomeUI();
        homeUI.panel = new NodeMock('panel');
        homeUI.touchMask = new NodeMock('touchMask');
        homeUI.finger = new NodeMock('finger');
        homeUI.gameAdBtn = new NodeMock('gameAdBtn');
        homeUI.privacyBtn = new NodeMock('privacyBtn');
        homeUI.lvLabel = { string: '' };
        homeUI.bgOpacity = { opacity: 255 };

        homeUI.show({});

        assert.equal(
            emittedEvents.includes(GameEvents.GameStart),
            false,
            'HomeUI.show must not start or preload the level before the player taps the start button.',
        );
        assert.equal(homeUI.isLoadLvFinish, false, 'The level must remain unloaded while the player is still on the home screen.');
        assert.equal(homeUI.finger.active, false, 'The start prompt must not appear until the level has loaded after player input.');
    } finally {
        global.uniSdk = previousUniSdk;
    }
}

function assertHomeUICleanupSurvivesDestroyedChildren() {
    let baseOffEventsCalls = 0;
    class BasicUIMock {
        on() {}

        offEvents() {
            baseOffEventsCalls += 1;
        }
    }

    class NodeMock {}
    NodeMock.EventType = { TOUCH_END: 'touch-end' };

    const ccMock = {
        _decorator: {
            ccclass: () => (target) => target,
            property: () => () => {},
        },
        Component: class {},
        Node: NodeMock,
        UIOpacity: class {},
        tween: () => {},
        Label: class {},
        v3: () => {},
        Tween: class {},
        isValid: (node) => Boolean(node && node.isValid),
    };
    const HomeUI = loadTranspiledHomeUI(ccMock, BasicUIMock);
    const homeUI = new HomeUI();
    let startButtonOnCalls = 0;
    let startButtonOffCalls = 0;
    const startButton = {
        isValid: true,
        off(eventName, callback, target) {
            assert.equal(eventName, NodeMock.EventType.TOUCH_END);
            assert.equal(callback, homeUI.onGameStartClick);
            assert.equal(target, homeUI);
            startButtonOffCalls += 1;
        },
        on(eventName, callback, target) {
            assert.equal(eventName, NodeMock.EventType.TOUCH_END);
            assert.equal(callback, homeUI.onGameStartClick);
            assert.equal(target, homeUI);
            startButtonOnCalls += 1;
        },
    };
    homeUI.panel = {
        getChildByName(name) {
            assert.equal(name, 'startBtn');
            return startButton;
        },
    };

    homeUI.onEvents();
    assert.equal(startButtonOnCalls, 1, 'HomeUI must bind the resolved start button.');

    homeUI.offEvents();
    assert.equal(startButtonOffCalls, 1, 'HomeUI must unbind a valid start button.');
    assert.equal(baseOffEventsCalls, 1, 'HomeUI must run inherited cleanup exactly once.');

    homeUI.onEvents();
    assert.equal(startButtonOnCalls, 2, 'HomeUI must support rebinding after reuse.');

    startButton.isValid = false;
    homeUI.panel = {
        isValid: true,
        getChildByName() {
            throw new Error('destroyed panel must not be traversed during cleanup');
        },
    };

    assert.doesNotThrow(() => homeUI.offEvents());
    assert.equal(baseOffEventsCalls, 2, 'HomeUI must run inherited cleanup on every teardown.');
}

function assertHomeUISidebarRevisitButtonEmitsSdkEvent() {
    const emittedEvents = [];
    class BasicUIMock {
        emit(eventName) {
            emittedEvents.push(eventName);
        }
    }

    class NodeMock {
        constructor(name = '') {
            this.name = name;
            this._name = name;
            this.children = [];
            this.active = true;
            this.isValid = true;
            this.layer = 0;
            this.listeners = [];
            this.components = [];
        }

        addChild(child) {
            child.parent = this;
            this.children.push(child);
        }

        getChildByName(name) {
            return this.children.find((child) => child.name === name || child._name === name) || null;
        }

        addComponent(ComponentType) {
            const component = new ComponentType();
            component.node = this;
            this.components.push(component);
            return component;
        }

        setPosition(position) {
            this.position = position;
        }

        on(eventName, callback, target) {
            this.listeners.push({ eventName, callback, target });
        }

        off(eventName, callback, target) {
            this.listeners = this.listeners.filter(
                (listener) => listener.eventName !== eventName ||
                    listener.callback !== callback ||
                    listener.target !== target,
            );
        }
    }
    NodeMock.EventType = { TOUCH_END: 'touch-end' };

    class UITransformMock {
        setContentSize(width, height) {
            this.contentSize = { width, height };
        }
    }
    class GraphicsMock {
        roundRect(x, y, width, height, radius) {
            this.roundRectArgs = { x, y, width, height, radius };
        }

        fill() {
            this.filled = true;
        }
    }
    class LabelMock {}
    LabelMock.HorizontalAlign = { CENTER: 1 };
    LabelMock.VerticalAlign = { CENTER: 1 };
    class LabelOutlineMock {}
    class ColorMock {
        constructor(r, g, b, a) {
            Object.assign(this, { r, g, b, a });
        }
    }

    const SDKSystem = { _curPlatform: 4 };
    const PlatformType = { TTMiniGame: 4, PCMiniGame: 0 };
    const HomeUI = loadTranspiledHomeUI({
        _decorator: {
            ccclass: () => (target) => target,
            property: () => () => {},
        },
        Component: class {},
        Node: NodeMock,
        UIOpacity: class {},
        tween: () => {},
        Label: LabelMock,
        LabelOutline: LabelOutlineMock,
        Graphics: GraphicsMock,
        Color: ColorMock,
        UITransform: UITransformMock,
        v3: (x, y, z) => ({ x, y, z }),
        Tween: class {},
        isValid: (node) => Boolean(node && node.isValid !== false),
    }, BasicUIMock, {
        '../../Init/Managers/EventTypes': {
            EventTypes: {
                TouchEvents: { TouchStart: 1 },
                GameEvents: { EnterChooseLv: 2 },
                UIEvents: { PrivacyConfirm: 3 },
                SDKEvents: { NavigateToSidebar: 'navigate-to-sidebar' },
            },
        },
        '../../Init/SystemSDK/SDKSystem': { SDKSystem, PlatformType },
        '../../Init/SystemAudio/AudioEnum': { AudioEnum: { BtnClick: 'btn-click' } },
        '../../Init/SystemAudio/AudioSystem': { AudioSystem: { playEffect() {} } },
    });

    const homeUI = new HomeUI();
    const panel = new NodeMock('panel');
    panel.layer = 33554432;
    homeUI.panel = panel;

    homeUI.syncSidebarRevisitEntry();
    const button = panel.getChildByName('sidebarRevisitBtn');
    assert.ok(button, 'HomeUI must create a visible top-level sidebar revisit button on the lobby panel.');
    assert.equal(button.parent, panel, 'Sidebar revisit button must be a direct child of the HomeUI panel.');
    assert.equal(button.active, true, 'Sidebar revisit button must be visible on Douyin.');
    assert.equal(button.layer, panel.layer, 'Sidebar revisit button must render on the same layer as the panel.');
    assert.ok(
        button.listeners.some((listener) =>
            listener.eventName === NodeMock.EventType.TOUCH_END &&
            listener.callback === homeUI.onShowSidebarRevisit &&
            listener.target === homeUI,
        ),
        'Sidebar revisit button must bind TOUCH_END to onShowSidebarRevisit.',
    );

    const labelNode = button.getChildByName('sidebarRevisitLabel');
    const label = labelNode && labelNode.components.find((component) => component instanceof LabelMock);
    assert.equal(label && label.string, '侧边栏复访任务', 'Sidebar revisit entry label must clearly identify the revisit task.');
    assert.ok(
        homeUI.getSidebarRevisitGuideText().includes('从抖音首页侧边栏进入') &&
            homeUI.getSidebarRevisitGuideText().includes('返回本游戏即可完成复访任务'),
        'Sidebar revisit task must provide clear completion instructions.',
    );

    const touchListener = button.listeners.find((listener) => listener.eventName === NodeMock.EventType.TOUCH_END);
    touchListener.callback.call(touchListener.target);
    assert.deepEqual(
        emittedEvents,
        ['navigate-to-sidebar'],
        'Tapping the sidebar revisit button must emit the Douyin sidebar navigation SDK event.',
    );

    SDKSystem._curPlatform = PlatformType.PCMiniGame;
    homeUI.syncSidebarRevisitEntry();
    assert.equal(button.active, false, 'Sidebar revisit button must stay hidden outside Douyin mini game builds.');
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
    return isUserSettingPropertyAccess(node, 'showPrivacy');
}

function isStoragePrivacyVersionAccess(node) {
    return isUserSettingPropertyAccess(node, 'privacyVersion');
}

function isUserSettingPropertyAccess(node, propertyName) {
    if (!ts.isPropertyAccessExpression(node) || node.name.text !== propertyName) return false;

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
        if (isStoragePrivacyAccess(condition)) return true;
        if (ts.isCallExpression(condition) &&
            ts.isPropertyAccessExpression(condition.expression) &&
            isThisExpression(condition.expression.expression) &&
            condition.expression.name.text === 'shouldShowPrivacyPrompt') return true;
        return ts.isPrefixUnaryExpression(condition) &&
            condition.operator === ts.SyntaxKind.ExclamationToken &&
            isStoragePrivacyAccess(unwrapParentheses(condition.operand));
    });
}

function hasPrivacyVersionGate(sourceFile) {
    return hasNode(sourceFile, (node) =>
        ts.isMethodDeclaration(node) &&
        isIdentifier(node.name, 'shouldShowPrivacyPrompt') &&
        hasNode(node, (child) =>
            isStoragePrivacyAccess(child) ||
            (ts.isPropertyAccessExpression(child) &&
                child.name.text === 'showPrivacy' &&
                isIdentifier(child.expression, 'userSetting')),
        ) &&
        hasNode(node, (child) =>
            isStoragePrivacyVersionAccess(child) ||
            (ts.isPropertyAccessExpression(child) &&
                child.name.text === 'privacyVersion' &&
                isIdentifier(child.expression, 'userSetting')),
        ) &&
        hasNode(node, (child) => isPropertyPath(child, ['Init', 'PrivacyPolicyVersion'])),
    );
}

function hasPreLaunchPrivacyPlatformGate(sourceFile) {
    return hasNode(sourceFile, (node) =>
        ts.isMethodDeclaration(node) &&
        isIdentifier(node.name, 'requiresPreLaunchPrivacyConsent') &&
        hasNode(node, (child) => isPropertyPath(child, ['uniSdk', 'Global', 'isXiaoMiGame'])) &&
        hasNode(node, (child) => isPropertyPath(child, ['uniSdk', 'Global', 'isTTGame'])),
    );
}

function hasEventManagerPrivacyOnce(sourceFile) {
    return hasNode(sourceFile, (node) => {
        if (!isCallTo(node, ['EventManager', 'once']) || node.arguments.length !== 3) return false;
        const [eventName, callback, target] = node.arguments;
        return isPropertyPath(eventName, ['EventTypes', 'UIEvents', 'PrivacyConfirm']) &&
            isThisProperty(callback, 'onPrivacyConfirm') &&
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
        ts.isGetAccessorDeclaration(node) &&
        isIdentifier(node.name, 'startBtn') &&
        Boolean(node.modifiers && node.modifiers.some(
            (modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword,
        )) &&
        hasNode(node, (child) =>
            ts.isCallExpression(child) &&
            ts.isPropertyAccessExpression(child.expression) &&
            child.expression.name.text === 'getChildByName' &&
            child.arguments.length === 1 &&
            ts.isStringLiteral(child.arguments[0]) &&
            child.arguments[0].text === 'startBtn',
        ),
    );
}

function isStartButtonReference(node) {
    return isIdentifier(node, 'boundStartBtn') || isThisProperty(node, 'boundStartBtn');
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

function hasSidebarRevisitButtonFactory(sourceFile) {
    return hasNode(sourceFile, (node) => {
        if (!ts.isMethodDeclaration(node) || !isIdentifier(node.name, 'syncSidebarRevisitEntry')) {
            return false;
        }

        const createsNamedButton = hasNode(node, (child) =>
            ts.isNewExpression(child) &&
            isIdentifier(child.expression, 'Node') &&
            child.arguments.length >= 1 &&
            ts.isStringLiteral(child.arguments[0]) &&
            child.arguments[0].text === 'sidebarRevisitBtn',
        );
        const attachesToPanel = hasNode(node, (child) =>
            ts.isCallExpression(child) &&
            ts.isPropertyAccessExpression(child.expression) &&
            child.expression.name.text === 'addChild' &&
            isThisProperty(child.expression.expression, 'panel'),
        );
        const limitsToDouyin = hasNode(node, (child) =>
            isPropertyPath(child, ['PlatformType', 'TTMiniGame']),
        );
        const bindsTouchHandler = hasNode(node, (child) => {
            if (!ts.isCallExpression(child) ||
                !ts.isPropertyAccessExpression(child.expression) ||
                child.expression.name.text !== 'on' ||
                child.arguments.length !== 3) {
                return false;
            }

            const [eventName, callback, target] = child.arguments;
            return isPropertyPath(eventName, ['Node', 'EventType', 'TOUCH_END']) &&
                isThisProperty(callback, 'onShowSidebarRevisit') &&
                isThisExpression(target);
        });

        return createsNamedButton && attachesToPanel && limitsToDouyin && bindsTouchHandler;
    });
}

function hasSidebarRevisitEventEmit(sourceFile) {
    return hasNode(sourceFile, (node) =>
        ts.isMethodDeclaration(node) &&
        isIdentifier(node.name, 'onShowSidebarRevisit') &&
        hasNode(node, (child) =>
            ts.isCallExpression(child) &&
            ts.isPropertyAccessExpression(child.expression) &&
            child.expression.name.text === 'emit' &&
            isThisExpression(child.expression.expression) &&
            child.arguments.length >= 1 &&
            isPropertyPath(child.arguments[0], ['EventTypes', 'SDKEvents', 'NavigateToSidebar']),
        ),
    );
}

const supportedSyntaxFixture = parseTypeScript('supported-syntax.ts', `
class ReviewFixture {
    static readonly PrivacyPolicyVersion = 'douyin-2026-08-20';
    private showMainUI() {}
    private onPrivacyConfirm() {}
    private boundStartBtn;

    private get startBtn() {
        return this.node.getChildByName('startBtn');
    }

    public syncSidebarRevisitEntry() {
        if (SDKSystem._curPlatform != PlatformType.TTMiniGame) return;
        const btn = new Node('sidebarRevisitBtn');
        this.panel.addChild(btn);
        btn.on(Node.EventType.TOUCH_END, this.onShowSidebarRevisit, this);
    }

    protected onShowSidebarRevisit() {
        this.emit(EventTypes.SDKEvents.NavigateToSidebar);
    }

    private requiresPreLaunchPrivacyConsent() {
        return Boolean(uniSdk.Global.isXiaoMiGame || uniSdk.Global.isTTGame);
    }

    private shouldShowPrivacyPrompt() {
        const userSetting = StorageSystem.getData().userSetting;
        return userSetting.showPrivacy || userSetting.privacyVersion !== Init.PrivacyPolicyVersion;
    }

    run() {
        this.boundStartBtn = this.startBtn;
        if (this.shouldShowPrivacyPrompt()) {
            EventManager.once(EventTypes.UIEvents.PrivacyConfirm, this.onPrivacyConfirm, this);
            UISystem.showUI(UIEnum.PrivacyUI, { isLobby: false });
        }
        this.boundStartBtn?.on(Node.EventType.TOUCH_END, this.onGameStartClick, this);
        this.boundStartBtn?.off(Node.EventType.TOUCH_END, this.onGameStartClick, this);
    }
}
`);
const ignoredSyntaxFixture = parseTypeScript('ignored-syntax.ts', [
    String.raw`const commentPattern = /\/\/.*|\/\*[\s\S]*?\*\//g;`,
    '// StorageSystem.getData().userSetting.showPrivacy',
    "const ignoredMethod = 'private showMainUI() {}';",
    "const ignoredStartButton = \"this.node.getChildByName('startBtn')\";",
    "const ignoredSidebarButton = \"new Node('sidebarRevisitBtn')\";",
    "const ignoredSidebarEvent = \"this.emit(EventTypes.SDKEvents.NavigateToSidebar)\";",
    "const ignoredPrivacyVersion = \"userSetting.privacyVersion !== Init.PrivacyPolicyVersion\";",
    'const ignoredCalls = `',
    'EventManager.once(EventTypes.UIEvents.PrivacyConfirm, this.showMainUI, this);',
    'UISystem.showUI(UIEnum.PrivacyUI, { isLobby: false });',
    'boundStartBtn?.on(Node.EventType.TOUCH_END, this.onGameStartClick, this);',
    'boundStartBtn?.off(Node.EventType.TOUCH_END, this.onGameStartClick, this);',
    'btn.on(Node.EventType.TOUCH_END, this.onShowSidebarRevisit, this);',
    '`;',
].join('\n'));
const astChecks = [
    ['stored privacy gate', hasStoragePrivacyGate],
    ['privacy version gate', hasPrivacyVersionGate],
    ['pre-launch privacy platform gate', hasPreLaunchPrivacyPlatformGate],
    ['privacy confirmation listener', hasEventManagerPrivacyOnce],
    ['privacy UI call', hasPrivacyUIShow],
    ['private showMainUI method', hasPrivateShowMainUI],
    ['start button resolution', hasStartButtonResolution],
    ['start button on listener', (sourceFile) => hasStartButtonListener(sourceFile, 'on')],
    ['start button off listener', (sourceFile) => hasStartButtonListener(sourceFile, 'off')],
    ['sidebar revisit button factory', hasSidebarRevisitButtonFactory],
    ['sidebar revisit event emit', hasSidebarRevisitEventEmit],
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
const requiredWechatSubpackageBundles = [
    'Game',
    'AudioAssets',
    'Effect',
    'LevelData',
    'Roles',
    'UI',
];

for (const bundleName of requiredWechatSubpackageBundles) {
    const bundleMeta = JSON.parse(fs.readFileSync(
        path.join(projectRoot, `assets/${bundleName}.meta`),
        'utf8',
    ));
    assert.equal(
        bundleMeta.userData &&
            bundleMeta.userData.compressionType &&
            bundleMeta.userData.compressionType.wechatgame,
        'subpackage',
        `${bundleName} must be a WeChat subpackage for Xiaomi packaging.`,
    );
}
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
    hasPrivacyVersionGate(initSourceFile),
    'Init must force a new privacy prompt when the stored policy version is stale.',
);
assert.ok(
    hasPreLaunchPrivacyPlatformGate(initSourceFile),
    'Init must require pre-launch privacy consent on Xiaomi and Douyin builds.',
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
    'HomeUI must resolve startBtn by name through a private getter.',
);
assert.ok(
    hasStartButtonListener(homeUISourceFile, 'on'),
    'HomeUI must bind startBtn TOUCH_END to onGameStartClick.',
);
assert.ok(
    hasStartButtonListener(homeUISourceFile, 'off'),
    'HomeUI must remove the startBtn TOUCH_END listener.',
);
assert.ok(
    hasSidebarRevisitButtonFactory(homeUISourceFile),
    'HomeUI must create a top-level Douyin sidebar revisit button on the lobby panel.',
);
assert.ok(
    hasSidebarRevisitEventEmit(homeUISourceFile),
    'HomeUI must emit NavigateToSidebar when the sidebar revisit entry is tapped.',
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

assertHomeUICleanupSurvivesDestroyedChildren();
assertHomeUISidebarRevisitButtonEmitsSdkEvent();
assertPrivacyConsentPrecedesDeferredSystems();
assertDouyinPrivacyConsentPrecedesDeferredSystems();
assertHomeUIShowDoesNotStartLevelBeforePlayerInput();
assertPrivacyUITextContainsDouyinOperatorDetails();
assertEarlyStartWaitsForLevelLoad();

console.log('Xiaomi review regression checks passed.');
