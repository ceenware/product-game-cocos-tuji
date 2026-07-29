import { _decorator, Component, Node, UIOpacity, tween, Label, v3, Tween, isValid } from 'cc';
import { BasicUI } from '../../Init/Basic/BasicUI';
import { EventTypes } from '../../Init/Managers/EventTypes';
import { AudioEnum } from '../../Init/SystemAudio/AudioEnum';
import { AudioSystem } from '../../Init/SystemAudio/AudioSystem';
import { SDKSystem, PlatformType } from '../../Init/SystemSDK/SDKSystem';
import { StorageSystem } from '../../Init/SystemStorage/StorageSystem';
import { UIEnum } from '../../Init/SystemUI/UIEnum';
import { UISystem } from '../../Init/SystemUI/UISystem';
const { ccclass, property } = _decorator;

@ccclass('HomeUI')
export class HomeUI extends BasicUI {
    @property(Node)
    protected panel: Node = null;
    @property(Node)
    protected touchMask: Node = null;
    @property(Node)
    private privacyBtn: Node = null;

    @property(Node)
    protected finger: Node = null;

    @property(Node)
    private gameAdBtn: Node = null;

    protected isLoadLvFinish = false;
    protected isEnterGame = false;

    private get startBtn(): Node {
        return this.panel ? this.panel.getChildByName('startBtn') : null;
    }

    private boundStartBtn: Node = null;

    protected onEvents() {
        this.on(EventTypes.TouchEvents.TouchStart, this.onGameStartClick, this);
        this.on(EventTypes.GameEvents.EnterChooseLv, this.onEnterChooseLv, this);
        this.on(EventTypes.UIEvents.PrivacyConfirm, this.onPrivacyConfirm, this);
        if (isValid(this.boundStartBtn)) {
            this.boundStartBtn.off(Node.EventType.TOUCH_END, this.onGameStartClick, this);
        }
        this.boundStartBtn = this.startBtn;
        if (isValid(this.boundStartBtn)) {
            this.boundStartBtn.on(Node.EventType.TOUCH_END, this.onGameStartClick, this);
        }
    }

    public offEvents() {
        try {
            if (isValid(this.boundStartBtn)) {
                this.boundStartBtn.off(Node.EventType.TOUCH_END, this.onGameStartClick, this);
            }
        } finally {
            this.boundStartBtn = null;
            super.offEvents();
        }
    }

    public show(d) {
        super.show(d);

        console.log("HomeUI.show");

        if(uniSdk.Global.isVivogame) uniSdk.createBoxAd();
        else if(uniSdk.Global.isOppogame) uniSdk.showBanner();
        this.gameAdBtn.active = uniSdk.Global.isOppogame;

        this.isEnterGame = false;
        this.isLoadLvFinish = false;
        this.touchMask.active = false;
        this.panel.active = true;
        this.finger.active = false;
        this.bgOpacity.opacity = 255;

        UISystem.showUI(UIEnum.PlayerAssetsUI);

        this.setLvNum();
        this.privacyBtn.active = false;
        if (SDKSystem._curPlatform == PlatformType.OPPOMiniGame ||
            SDKSystem._curPlatform == PlatformType.VIVOMiniGame ||
            SDKSystem._curPlatform == PlatformType.PCMiniGame) {
            this.privacyBtn.active = true;

            //检测隐私政策是否已同意
            // if (!StorageSystem.getData().userSetting.showPrivacy) {
            // }
        }

        //自动进入
        this.showLvScene();
        // if (GlobalTmpData.UIData.isEnterLv) {
        // } else {
        // }
        AudioSystem.playBGM(AudioEnum.homeBgm);
    }

    private onClickGameAdIcon() {
        uniSdk.createBoxAd();
    }
    //进入游戏
    public enterGame() {
        if (this.isEnterGame) return;
        this.isEnterGame = true;

        console.warn("enterGame 开始游戏-----");

        if(uniSdk.Global.isVivogame || uniSdk.Global.isOppogame) {
            uniSdk.destroyBoxAd();
            uniSdk.showBanner();
        }

        this.panel.active = false;
        this.touchMask.active = true;
        //
        this.emit(EventTypes.GameEvents.GameRun);
        this.emit(EventTypes.GuideEvents.ShowGuideAnim);
        this.emit(EventTypes.TouchEvents.SetTouchEnable, true);
        this.emit(EventTypes.GameEvents.GameResume);

        UISystem.hideUI(UIEnum.HomeUI);
        AudioSystem.playBGM(AudioEnum.lvBgm);
    }
    //显示场景
    public showLvScene(cb?) {

        // AudioSystem.playEffect(AudioEnum.enterGame);
        //先显示 MappingUI
        // UISystem.showUI(UIEnum.MappingUI, () => {
        // });
        //再开始游戏
        this.emit(EventTypes.GameEvents.GameStart, () => {
            setTimeout(() => {
                //通知加载完成
                this.emit(EventTypes.GameEvents.GameLoadFinish);
                this.onGameLoadFinish();
                cb && cb();
            }, 0);
        });
    }

    // #region -----------------私有-----------

    @property(UIOpacity)
    private bgOpacity: UIOpacity = null;
    //隐藏背景动画
    private hideBg(cb?) {
        if (this.bgOpacity) {
            let o = { a: 255 }
            this.bgOpacity.opacity = o.a;
            tween(o).to(0.2, { a: 0 }, {
                onUpdate: () => {
                    this.bgOpacity.opacity = o.a;
                }
            }).call(() => {
                cb && cb();
            }).start();
        } else {
            cb && cb();
        }
    }

    @property(Label)
    protected lvLabel: Label = null;
    /**关卡序号 */
    private setLvNum() {
        if (this.lvLabel) {
            let lv = StorageSystem.getData().levelAssets.curLv;
            this.lvLabel.string = lv.toFixed(0);
        }
    }

    // #endregion

    // #region -----------------按钮--------------
    /**点击开始按钮 */
    public onGameStartClick() {
        this.enterGame();
    }

    /**显示转盘 */
    protected onShowTurntableUI() {
        AudioSystem.playEffect(AudioEnum.BtnClick);
        UISystem.showUI(UIEnum.TurntableUI);
    }
    /**显示签到 */
    protected onShowSignUI() {
        AudioSystem.playEffect(AudioEnum.BtnClick);
        UISystem.showUI(UIEnum.SignUI);
    }

    /**显示设置 */
    protected onShowSettingUI() {
        AudioSystem.playEffect(AudioEnum.BtnClick);
        UISystem.showUI(UIEnum.SettingUI);
    }

    //隐私
    protected onShowPrivacyUI() {
        UISystem.showUI(UIEnum.PrivacyUI, { isLobby: true });
    }

    /**显示商城 */
    protected onShowShopUI() {
        AudioSystem.playEffect(AudioEnum.BtnClick);

        this.panel.active = false;
        UISystem.showUI(UIEnum.ShopUI, {
            hideCb: () => {
                this.panel.active = true;
            }
        });
    }

    // #endregion

    // #region -----------------事件------------
    //隐私政策同意之后 进入游戏
    protected onPrivacyConfirm() {
        // if (StorageSystem.getData().levelAssets.curLv == 1) {
        //     this.enterGame();
        // }
    }
    //进入指定关卡
    protected onEnterChooseLv(lv: number) {
        StorageSystem.setData((d) => {
            d.levelAssets.curLv = lv;
        });
        this.enterGame();
    }
    //显示指定关卡-不扣除体力
    protected onShowLevelScene(lv) {
        if (lv) {
            StorageSystem.setData((d) => {
                d.levelAssets.curLv = lv;
            });
        }
        this.showLvScene();
    }

    //关卡内容加载完毕之后
    protected onGameLoadFinish() {
        this.isLoadLvFinish = true;
        this.finger.active = true;
        //显示触摸
        UISystem.showUI(UIEnum.LevelController);
        //
        UISystem.showUI(UIEnum.LevelInfoUI);

        //隐藏首页背景
        this.hideBg(() => {
        });
    }

    // #endregion

}
