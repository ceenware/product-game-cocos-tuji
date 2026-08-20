import { _decorator, Component, Node, Label } from 'cc';
import { BasicUI } from '../../Init/Basic/BasicUI';
import { Init } from '../../Init/InitScripts/Init';
import { EventTypes } from '../../Init/Managers/EventTypes';
import { StorageSystem } from '../../Init/SystemStorage/StorageSystem';
import { UIEnum } from '../../Init/SystemUI/UIEnum';
import { UISystem } from '../../Init/SystemUI/UISystem';
const { ccclass, property } = _decorator;

const PRIVACY_POLICY_TEXT = [
    '勇者火线突围隐私政策',
    '更新日期：2026年8月20日',
    '生效日期：2026年8月20日',
    '开发者/运营者：巴中宜辰网络科技有限公司',
    '联系地址：四川省巴中市巴州区巴州大道37号办公楼202号',
    '联系邮箱：vicky@ceenmobi.com',
    '请您在进入游戏前完整阅读本政策。点击“同意”表示您已阅读并同意本政策，随后进入游戏；点击“拒绝”表示不同意本政策，游戏将退出或停止进入流程。我们不会默认勾选、默认同意或强制您同意隐私政策。',
    '一、我们如何收集和使用信息',
    '《勇者火线突围》当前版本为单机休闲动作闯关小游戏，不提供账号注册、登录、充值、交易、聊天、社区、排行榜、用户生成内容等功能。游戏本身不主动收集姓名、身份证号、通讯录、精确定位、相册、麦克风、摄像头等个人敏感信息。',
    '为保障游戏在抖音小游戏平台环境中的基础运行、问题排查、安全风控、广告展示或平台统计，接入的平台能力或系统服务可能按照其规则处理设备信息、网络状态、操作日志、崩溃日志、广告展示与点击数据等必要信息。相关信息的处理以实现基础服务、安全合规和改进体验为目的。',
    '二、设备权限',
    '当前版本不主动申请通讯录、短信、电话、摄像头、麦克风、精确定位、相册等敏感权限。如后续版本需要新增权限，我们会在使用前按照法律法规和平台要求进行提示，并在取得授权后使用。',
    '三、信息共享、转让和公开披露',
    '我们不会将您的个人信息出售给任何第三方。除法律法规规定、监管部门要求、平台服务必要或获得您授权外，我们不会向无关第三方共享、转让或公开披露您的个人信息。',
    '四、信息存储和保护',
    '我们会采取合理的技术和管理措施保护相关信息安全。若因法律法规、平台规则或服务安全需要保留必要日志，我们会在实现目的所需的期限内保存，并在超出保存期限后删除或匿名化处理。',
    '五、未成年人保护',
    '我们重视未成年人个人信息保护。未成年人应在监护人同意和指导下使用本游戏。若监护人发现未成年人信息被不当处理，可通过本政策载明的联系方式与我们联系。',
    '六、政策更新',
    '我们可能根据产品功能、法律法规或平台规则变化更新本政策。政策更新后，我们会以适当方式提示用户；涉及个人信息处理规则的重大变化时，将再次征得您的明示同意。',
    '七、联系我们',
    '如您对本政策或个人信息保护事项有任何疑问、意见或请求，可通过以下方式联系我们：公司名称：巴中宜辰网络科技有限公司；地址：四川省巴中市巴州区巴州大道37号办公楼202号；邮箱：vicky@ceenmobi.com。',
].join('\n');

@ccclass('PrivacyUI')
export class PrivacyUI extends BasicUI {
    @property(Node)
    closeBtn: Node = null;
    @property(Node)
    btnLayer: Node = null;

    onLoad() {
        const privacyLabel = this.node.getChildByPath("bg/ScrollView/view/content/label1").getComponent(Label);
        privacyLabel.string = PRIVACY_POLICY_TEXT;
    }

    show(d: { isLobby: boolean }) {
        super.show();
        this.btnLayer.active = !d.isLobby;
        this.closeBtn.active = d.isLobby;
    }

    onClose() {
        UISystem.hideUI(UIEnum.PrivacyUI);
    }

    onCancel() {
        //退出游戏
        this.emit(EventTypes.SDKEvents.ExitApp);
    }
    //同意
    onConfirm() {
        UISystem.hideUI(UIEnum.PrivacyUI);
        StorageSystem.setData((d) => {
            d.userSetting.showPrivacy = false;
            d.userSetting.privacyVersion = Init.PrivacyPolicyVersion;
        }, true);

        //进入游戏
        this.emit(EventTypes.UIEvents.PrivacyConfirm);
    }
}
