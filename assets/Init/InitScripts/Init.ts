import { _decorator, Component, Node, Camera, Canvas } from 'cc';
import GlobalData from '../Config/GlobalData';
import { GlobalEnum } from '../Config/GlobalEnum';
import EventManager from '../Managers/EventManager';
import { EventTypes } from '../Managers/EventTypes';
import { AdvertSystem } from '../SystemAdvert/AdvertSystem';
import { AudioSystem } from '../SystemAudio/AudioSystem';
import { SDKSystem } from '../SystemSDK/SDKSystem';
import { StorageSystem } from '../SystemStorage/StorageSystem';
import { UIEnum } from '../SystemUI/UIEnum';
import { UISystem } from '../SystemUI/UISystem';
import { clog } from '../Tools/ColorLog';
import Loader from '../Tools/Loader';
const { ccclass, property } = _decorator;

@ccclass('Init')
export class Init extends Component {
    protected uiLayer: Node = null;

    /**判断系统是否初始化完成 */
    private isSysInitFish = false;
    private isMainUIShown = false;

    protected onLoad() {
        //
        GlobalData.set(GlobalEnum.GlobalDataType.Canvas, this.node);
        //
        GlobalData.set(GlobalEnum.GlobalDataType.CameraUI,
            this.node.getChildByName('CameraUI').getComponent(Camera));

        this.uiLayer = this.node.getChildByName('UILayer');

        this.initSystems();
    }

    //#region --------------------系统初始化-------------
    /**初始化各个系统 */
    protected initSystems() {
        StorageSystem.init();
        AudioSystem.init();
        SDKSystem.init();
        UISystem.init(this.uiLayer);
        AdvertSystem.init(this.uiLayer);
    }

    protected update(dt) {
        this.checkSysInitState();
    }

    /**检测各个系统是否加载完成-防止异步*/
    protected checkSysInitState() {
        if (!this.isSysInitFish) {
            let isFinish = true;
            isFinish = isFinish && StorageSystem.isInitFinished;
            isFinish = isFinish && AudioSystem.isInitFinished;
            isFinish = isFinish && AdvertSystem.isInitFinished;
            isFinish = isFinish && SDKSystem.isInitFinished;
            isFinish = isFinish && UISystem.isInitFinished;
            this.isSysInitFish = isFinish;
            if (this.isSysInitFish) {
                this.enterGame();
            }
        }
    }
    //#endregion

    // #region -------------------进入游戏---------------
    protected enterGame() {
        EventManager.emit(EventTypes.GameEvents.InitLoadFinished);
        clog.log('#进入游戏');

        if (!StorageSystem.getData().userSetting.showPrivacy) {
            this.showMainUI();
            return;
        }

        EventManager.once(EventTypes.UIEvents.PrivacyConfirm, this.showMainUI, this);
        UISystem.showUI(UIEnum.PrivacyUI, { isLobby: false });
        return;
    }

    private showMainUI() {
        if (this.isMainUIShown) return;
        this.isMainUIShown = true;

        // 定时器要释放
        let timeout: number = setTimeout(() => {
            clearTimeout(timeout);
            //广告
            UISystem.showUI(UIEnum.CustomAdUI);

            UISystem.showUI(UIEnum.HomeUI);

            setTimeout(() => {
                this.preLoadBound();
            }, 100);
        }, 100);
    }
    // #endregion

    //#region --------------------预加载子包-------------
    /**预先加载的包名 非必须*/
    private preLoadBounds = ['AudioAssets', 'Game',];
    /**预先加载子包 */
    protected preLoadBound() {
        for (let i = 0, c = this.preLoadBounds.length; i < c; ++i) {
            Loader.loadBundle(this.preLoadBounds[i], null, false, false);
        }
    }
    // #endregion
}
