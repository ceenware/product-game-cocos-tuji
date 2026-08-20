import { _decorator, Component, Node, UIOpacity, tween, Label, v3, Tween, isValid, UITransform, Graphics, Color, LabelOutline } from 'cc';
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
    private isStartRequested = false;
    private sidebarRevisitBtn: Node = null;

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
            if (isValid(this.sidebarRevisitBtn)) {
                this.sidebarRevisitBtn.off(Node.EventType.TOUCH_END, this.onShowSidebarRevisit, this);
            }
        } finally {
            this.boundStartBtn = null;
            this.sidebarRevisitBtn = null;
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
        this.isStartRequested = false;
        this.touchMask.active = false;
        this.panel.active = true;
        this.syncSidebarRevisitEntry();
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
        if (this.isEnterGame || this.isStartRequested) return;
        this.isStartRequested = true;
        if (!this.isLoadLvFinish) {
            this.showLvScene();
            return;
        }
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

    public syncSidebarRevisitEntry() {
        let sidebarBtn = isValid(this.sidebarRevisitBtn) ? this.sidebarRevisitBtn : null;
        if (!sidebarBtn && this.panel) {
            sidebarBtn = this.panel.getChildByName('sidebarRevisitBtn');
        }

        if (SDKSystem._curPlatform != PlatformType.TTMiniGame) {
            if (isValid(sidebarBtn)) {
                sidebarBtn.active = false;
                sidebarBtn.off(Node.EventType.TOUCH_END, this.onShowSidebarRevisit, this);
            }
            this.sidebarRevisitBtn = sidebarBtn;
            return;
        }

        if (!this.panel) return;

        if (!isValid(sidebarBtn)) {
            sidebarBtn = new Node('sidebarRevisitBtn');
            sidebarBtn.layer = this.panel.layer;
            sidebarBtn.setPosition(v3(238, 338, 0));

            const transform = sidebarBtn.addComponent(UITransform);
            transform.setContentSize(164, 54);

            const bg = sidebarBtn.addComponent(Graphics);
            bg.fillColor = new Color(35, 48, 74, 235);
            bg.roundRect(-82, -27, 164, 54, 12);
            bg.fill();

            const labelNode = new Node('sidebarRevisitLabel');
            labelNode.layer = sidebarBtn.layer;
            labelNode.setPosition(v3(0, 0, 0));
            sidebarBtn.addChild(labelNode);

            const labelTransform = labelNode.addComponent(UITransform);
            labelTransform.setContentSize(164, 54);

            const label = labelNode.addComponent(Label);
            label.string = '侧边栏复访任务';
            label.fontSize = 22;
            label.lineHeight = 30;
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.verticalAlign = Label.VerticalAlign.CENTER;
            label.color = new Color(255, 238, 118, 255);

            const outline = labelNode.addComponent(LabelOutline);
            outline.color = new Color(53, 36, 6, 255);
            outline.width = 3;

            this.panel.addChild(sidebarBtn);
        }

        sidebarBtn.active = true;
        sidebarBtn.off(Node.EventType.TOUCH_END, this.onShowSidebarRevisit, this);
        sidebarBtn.on(Node.EventType.TOUCH_END, this.onShowSidebarRevisit, this);
        this.sidebarRevisitBtn = sidebarBtn;
    }

    public getSidebarRevisitGuideText() {
        return [
            '侧边栏复访任务指引',
            '1. 点击确定后将打开抖音侧边栏。',
            '2. 从抖音首页侧边栏进入《勇者火线突围》。',
            '3. 返回本游戏即可完成复访任务并继续游玩。',
        ].join('\n');
    }

    protected onShowSidebarRevisit() {
        AudioSystem.playEffect(AudioEnum.BtnClick);
        if (typeof uniSdk !== 'undefined' && uniSdk.showPopup) {
            uniSdk.showPopup(
                this.getSidebarRevisitGuideText(),
                () => {
                    this.emit(EventTypes.SDKEvents.NavigateToSidebar);
                },
                null,
                this,
                false,
                '侧边栏复访任务',
                '确定',
                '取消',
            );
            return;
        }
        this.emit(EventTypes.SDKEvents.NavigateToSidebar);
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

        if (this.isStartRequested) {
            this.enterGame();
        }
    }

    // #endregion

}
