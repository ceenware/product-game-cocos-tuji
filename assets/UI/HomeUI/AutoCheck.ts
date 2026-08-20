import { _decorator, Component, Node } from 'cc';
import { GlobalTmpData } from '../../Init/Config/GlobalTmpData';
import EventManager from '../../Init/Managers/EventManager';
import { EventTypes } from '../../Init/Managers/EventTypes';
import { SDKSystem, PlatformType } from '../../Init/SystemSDK/SDKSystem';
import { StorageSystem } from '../../Init/SystemStorage/StorageSystem';
import { UIEnum } from '../../Init/SystemUI/UIEnum';
import { UISystem } from '../../Init/SystemUI/UISystem';
const { ccclass, property } = _decorator;

@ccclass('AutoCheck')
export class AutoCheck extends Component {

    onEnable() {
        setTimeout(() => {
            this.autoShowUI();
        }, 100);
    }

    autoShowUI() {
        if (SDKSystem._curPlatform == PlatformType.PCMiniGame) return;

        this.checkPrivacyUI();
        this.checkSignUI();
        this.checkTurnTableUI();
    }

    checkPrivacyUI() {
        //自动弹出一次
        if (SDKSystem._curPlatform == PlatformType.OPPOMiniGame ||
            SDKSystem._curPlatform == PlatformType.VIVOMiniGame) {
            if (StorageSystem.getData().userSetting.showPrivacy) {
                UISystem.showUI(UIEnum.PrivacyUI, { isLobby: false });
            }
        }
    }

    /**检测签到 */
    checkSignUI() {
        let data = StorageSystem.getData();
        let signData = data.userAssets.signData;
        //判断当天是否签到
        let d1 = new Date(signData.lastTime);
        let d2 = new Date();
        let _isChecked = d1.getFullYear() == d2.getFullYear() && d1.getMonth() == d2.getMonth() && d1.getDate() == d2.getDate();

        if (!_isChecked && data.levelAssets.curLv >= 1) {
            UISystem.showUI(UIEnum.SignUI);
        }
    }

    //检测转盘
    checkTurnTableUI() {
        if (GlobalTmpData.UIData.isShowTurnTableUI) {
            GlobalTmpData.UIData.isShowTurnTableUI = false;
            setTimeout(() => {
                UISystem.showUI(UIEnum.TurntableUI);

                switch (SDKSystem._curPlatform) {
                    case PlatformType.WXMiniGame:

                        break;
                    case PlatformType.TTMiniGame:
                        //100%概率
                        EventManager.emit(EventTypes.SDKEvents.ShowInsertAd);
                        break;
                    default:
                        break;
                }

            }, 100);
        }
    }
}
