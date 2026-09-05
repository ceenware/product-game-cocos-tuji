import { BasicSystem } from "../Basic/BasicSystem";
import { clog } from "../Tools/ColorLog";
import { OPPOSDK } from "./OPPOSDK";
import SDK from "./SDK";
import { TTSDK } from "./TTSDK";
import { VIVOSDK } from "./VIVOSDK";
import { WXSDK } from "./WXSDK";

export enum PlatformType {
    PCMiniGame,
    WXMiniGame,
    OPPOMiniGame,
    VIVOMiniGame,
    TTMiniGame,
    QQMiniGame,
    MEIZUMiniGame,
    HUAWEIMiniGame,
    Gamebox4399,
    Android,
}

export class SDKSystem extends BasicSystem {
    public static _curPlatform: PlatformType = PlatformType.PCMiniGame;
    private static _curSDK: SDK = null;
    private static initTimeout: number = null;
    private static readonly InitializationTimeoutMs = 6000;

    public static init(d?: any) {
        //初始化当前平台的SDK
        if (this.isInit) return;
        this.isInit = true;

        // isInitFinished 注释原因： 由于uniSdk有存在异步初始化的情况，所以不能在这里标识为初始完毕
        // this.isInitFinished = true;
        this.checkPlatform();
        this.checkSystem();
        //
        clog.warn('当前平台:' + PlatformType[this._curPlatform]);
    }

    /**
     *  自动判断平台
     * @returns  
     */
    private static checkPlatform() {
        let u = window.navigator.userAgent;
        console.log('initPlatforms--' + JSON.stringify(u));

        if (this._curSDK) return;

        const qgProvider = this.getProviderName(window['qg']);
        // OPPO mini game
        if (qgProvider.indexOf("oppo") > -1) {
            this._curPlatform = PlatformType.OPPOMiniGame;
            this.instanceSDK(new OPPOSDK());
            return;
        }
        // VIVO mini game
        if (qgProvider.indexOf("vivo") > -1) {
            this._curPlatform = PlatformType.VIVOMiniGame;
            this.instanceSDK(new VIVOSDK());
            return;
        }
        // QQ mini game
        if (typeof window['qq'] !== "undefined") {
            this._curPlatform = PlatformType.QQMiniGame;
            return;
        }
        // tt mini game
        if (typeof window['tt'] !== "undefined") {
            this._curPlatform = PlatformType.TTMiniGame;
            this.instanceSDK(new TTSDK());
            return;
        }
        // meizu mini game
        if (typeof window['mz'] !== "undefined" && window['mz'].getProvider().toLowerCase().indexOf("meizu") > -1) {
            this._curPlatform = PlatformType.MEIZUMiniGame;
            return;
        }
        // WeiXin mini game
        if (typeof window['wx'] !== "undefined") {
            this._curPlatform = PlatformType.WXMiniGame;
            this.instanceSDK(new WXSDK());
            return;
        }
        // HuaWei mini game
        if (typeof window['hbs'] !== "undefined") {
            this._curPlatform = PlatformType.HUAWEIMiniGame;
            return;
        }
        // 4399 mini game
        if (typeof window['gamebox'] !== "undefined") {
            this._curPlatform = PlatformType.Gamebox4399;
            return;
        }
        //Android
        if (typeof window.jsb !== "undefined" || typeof window['conch'] !== "undefined" || window["DBApp"] != null) {
            this._curPlatform = PlatformType.Android;
            return;
        }
        //默认
        this.instanceSDK(new SDK());
    }

    private static getProviderName(platform: any): string {
        if (!platform || typeof platform.getProvider !== 'function') {
            return '';
        }
        try {
            return String(platform.getProvider() || '').toLowerCase();
        } catch (error) {
            console.warn('读取平台信息失败:', error);
            return '';
        }
    }

    private static checkSystem() {

        // if (/android/i.test(navigator.userAgent)) {
        //     console.log("This is Android'browser."); //这是Android平台下浏览器
        // }
        // if (/(iPhone|iPad|iPod|iOS)/i.test(navigator.userAgent)) {
        //     console.log("This is iOS'browser."); //这是iOS平台下浏览器
        // }
        // if (/Linux/i.test(navigator.userAgent)) {
        //     console.log("This is Linux'browser."); //这是Linux平台下浏览器
        // }
        // if (/Linux/i.test(navigator.platform)) {
        //     console.log("This is Linux operating system."); //这是Linux操作系统平台
        // }
        // if (/MicroMessenger/i.test(navigator.userAgent)) {
        //     console.log("This is MicroMessenger'browser."); //这是微信平台下浏览器
        // }

        let isAndroid: boolean = uniSdk.BrowersUtils.isAndroid();
        console.log("isAndroid", isAndroid)

    }

    /**
     * 根据当前平台实例化SDK
     */
    private static instanceSDK(sdk: SDK) {
        this._curSDK = sdk;
        const finishInitialization = () => {
            if (SDKSystem.isInitFinished) return;
            SDKSystem.isInitFinished = true;
            if (SDKSystem.initTimeout !== null) {
                clearTimeout(SDKSystem.initTimeout);
                SDKSystem.initTimeout = null;
            }
        };

        // SDK 回调可能受网络或平台接口影响，不能阻塞启动流程。
        SDKSystem.initTimeout = setTimeout(finishInitialization, SDKSystem.InitializationTimeoutMs);
        try {
            this._curSDK.init(finishInitialization);
        } catch (error) {
            console.error('SDK 初始化失败，继续启动游戏:', error);
            finishInitialization();
        }
    }
}
