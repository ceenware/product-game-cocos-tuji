import EventManager from "../Managers/EventManager";
import { EventTypes } from "../Managers/EventTypes";
import { AudioSystem } from "../SystemAudio/AudioSystem";
import SDK from "./SDK";

declare const tt: any;

export class TTSDK extends SDK {
    protected onEvents() {
        super.onEvents();
        EventManager.on(EventTypes.GameEvents.GameRun, this.onGameRun, this);
        EventManager.on(EventTypes.GameEvents.GameOver, this.onGameOver, this);
        //
        EventManager.on(EventTypes.SDKEvents.StartRecord, this.onStartRecord, this);
        EventManager.on(EventTypes.SDKEvents.PauseRecord, this.onPauseRecord, this);
        EventManager.on(EventTypes.SDKEvents.ResumeRecord, this.onResumeRecord, this);
        EventManager.on(EventTypes.SDKEvents.StopRecord, this.onStopRecord, this);
        EventManager.on(EventTypes.SDKEvents.ShareRecord, this.onShareRecord, this);
        EventManager.on(EventTypes.SDKEvents.NavigateToSidebar, this.onNavigateToSidebar, this);
    }

    protected setAdCfg(): void {
        this.adConfig.adBannerIdList = ["65c9m3ciga529uqhwg"];    // 指定 Banner 单元广告ID //65c9m3ciga529uqhwg
        this.adConfig.adVideoIdList = ["750hfa7ie428397efd"];        // 指定激励视频广告ID,
        this.adConfig.adInterstitialId = "d5gsrvfjic732lk6lh"; // 指定插屏广告ID
        // this.adConfig.adCustomIdList = [""];     // 指定原生模板广告ID，原生模板广告支持多个
        this.adConfig.shareInfoArr = [{ title: "一起来玩吧!", img: "" }]; // 自定义分享

        this.onShareAppMessage();
        this.checkSidebarSceneSupport();
    }

    //#region -------------功能------
    //注册菜单分享事件
    protected onShareAppMessage() {
        window['tt'].onShareAppMessage(() => {
            return {
                title: '',
                imageUrl: '',
                // title: '这是要转发的小程序标题',
                // desc: '这是默认的转发文案，用户可以直接发送，也可以在发布器内修改',
                // path: '/pages/index/index?from=sharebuttonabc&otherkey=othervalue', // ?后面的参数会在转发页面打开时传入onLoad方法
                // imageUrl: 'https://e.com/e.png', // 支持本地或远程图片，默认是小程序 icon
                // templateId: '这是开发者后台设置的分享素材模板id',
                // success() {
                //     console.log('转发发布器已调起，并不意味着用户转发成功，微头条不提供这个时机的回调');
                // },
                // fail() {
                //     console.log('转发发布器调起失败');
                // }
            }

        });
    }

    private checkSidebarSceneSupport() {
        if (typeof tt === "undefined" || !tt || typeof tt.checkScene !== "function") return;

        try {
            tt.checkScene({
                scene: "sidebar",
                success: (res) => {
                    console.log("tt.checkScene sidebar success", res);
                },
                fail: (res) => {
                    console.warn("tt.checkScene sidebar fail", res);
                },
            });
        } catch (err) {
            console.warn("tt.checkScene sidebar unavailable", err);
        }
    }

    protected onNavigateToSidebar() {
        if (typeof tt === "undefined" || !tt || typeof tt.navigateToScene !== "function") return;

        try {
            tt.navigateToScene({
                scene: "sidebar",
                success: (res) => {
                    console.log("navigate to sidebar success", res);
                },
                fail: (res) => {
                    console.warn("navigate to sidebar fail", res);
                },
            });
        } catch (err) {
            console.warn("tt.navigateToScene sidebar unavailable", err);
        }
    }

    /**
 * 拉起激励视频广告 --无广告版本
 */
    protected showRewardedVideo(cb: Function | { success: Function, fail: Function, cancel: Function }) {
        let success = null;
        let fail = null;
        let cancel = null;
        if (typeof cb === 'object') {
            success = cb.success;
            fail = cb.fail;
            cancel = cb.cancel;
        } else {
            success = cb;
        }
        success && success();
        //暂停游戏
        // EventManager.emit(EventTypes.GameEvents.GamePause);
        // AudioSystem.pauseBGM();
        // //
        // console.warn('观看视频中');
        // uniSdk.showRewardedVideo(0, (status: number) => {
        //     if (status == 1) {
        //         console.log("激励视频已观看完毕 ");
        //         success && success();
        //         //恢复游戏
        //         EventManager.emit(EventTypes.GameEvents.GameResume);
        //         AudioSystem.resumeBGM();
        //     }
        //     else if (status == 0) {
        //         console.log("激励视频未观看完毕 ");
        //         cancel && cancel();
        //         EventManager.emit(EventTypes.GameEvents.GameResume);
        //         AudioSystem.resumeBGM();
        //     }
        //     else {
        //         console.log("激励视频加载失败 ");
        //         fail && fail();
        //         EventManager.emit(EventTypes.GameEvents.GameResume);
        //         AudioSystem.resumeBGM();
        //     }

        // }, this);
    }

    /**
     * 插屏广告
     */
    protected showInterstitial(cb1?, cb2?) {
        console.log("showInterstitial-SDK");
        //触摸屏蔽
        // EventManager.emit(EventTypes.GameEvents.SetTouchMaskEnable,)
        uniSdk.showInterstitial((showed: boolean) => {
            if (showed) {
                console.log("插屏广告显示成功");
            }
            else {
                console.log("插屏广告显示失败， 这里处理失败的逻辑");
                // 插屏广告显示失败， 尝试原生模板
                // uniSdk.showCustomAd(0);
            }
            cb1 && cb1(showed);
        }, () => {
            console.log("插屏广告被用户关闭， 这里处理广告关闭后的逻辑");
            cb2 && cb2();
        }, this);

    }

    //#endregion

    //#region --------事件---------
    protected onGameRun() {
        this.onStartRecord();
    }

    protected onGameOver() {
        this.onStopRecord();
    }

    //--录屏
    protected onStartRecord() {
        uniSdk.AdPlat.instance.startRecord();
    }
    protected onPauseRecord() {
        uniSdk.AdPlat.instance.pauseRecord();
    }
    protected onResumeRecord() {
        uniSdk.AdPlat.instance.resumeRecord();
    }
    //停止录屏（头条）
    protected onStopRecord() {
        uniSdk.AdPlat.instance.stopRecord();
    }
    //分享录屏（头条）
    protected onShareRecord(success: Function, fail: Function = null) {
        uniSdk.AdPlat.instance.share({ channel: 'video' }, (isSuccess) => {
            if (isSuccess) {
                console.log('分享成功!')
                success && success();
            } else {
                console.log('分享失败!')
                fail && fail();
            }
        }, () => {
            this.showMessage('录屏时间少于3秒');
        }
        );
    }

    //#endregion
}
/**录屏数据记录 */
class RecordVideoData {
    public startTime: number;
    public endTime: number;
    public gameShareCount: number;
    public dayShareCount: number;
    public constructor(data) {
        this.startTime = 0;
        this.endTime = 0;
        this.gameShareCount = 0;
        if (!!data) {
            this.dayShareCount = data.dayShareCount;
        } else {
            this.dayShareCount = 0;
        }
    }
    /**录屏开始 */
    public onStart() {
        this.startTime = Date.now();
        this.endTime = Date.now();
    }
    /**录屏结束 */
    public onEnd() {
        this.endTime = Date.now();
    }
    /**录屏时长，单位：秒 */
    public get totalTime() {
        return (this.endTime - this.startTime) * 0.001;
    }
    /**分享成功 */
    public onShare() {
        this.gameShareCount++;
        this.dayShareCount++;
    }
}
