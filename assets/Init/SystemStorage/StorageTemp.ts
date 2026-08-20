import { size, Size, v2, v3, Vec2, Vec3 } from "cc";
import { GlobalEnum } from "../Config/GlobalEnum";

export class StorageTemp {
    userSetting: UserSetting;
    userAssets: UserAsstes;
    levelAssets: LevelAssets;
    constructor() {
        this.userSetting = new UserSetting();
        this.userAssets = new UserAsstes();
        this.levelAssets = new LevelAssets();
    }
}
/**玩家的设置 */
export class UserSetting {
    // 音频开关
    AudioSwith = true;
    // 震动开关
    ShakeSwith = true;
    //显示隐私政策-一次
    showPrivacy = true;
    //已同意的隐私政策版本。为空或旧版本时需重新明示同意。
    privacyVersion = '';
}

//玩家的关卡数据记录
export class LevelAssets {
    curLv = 1;
    maxLv = 1;
    data: LevelDataTmp = new LevelDataTmp();
    //记录随机关卡顺序
    randLvArr: number[] = [];
}

//玩家获取的资源数据
export class UserAsstes {
    //表示金币/钱 等数据
    asset = 5;
    //皮肤数据
    skin = {
        choose: 0,
        unlock: [0],
    };
    //抽免费奖次数
    turntableNum = 1;

    //签到记录
    signData = { lastTime: 0, count: -1, };
    isDoubleSign = false;

    //成长属性
    props = {
        RoleNumLv: 1,
        GoldRateLv: 1,
        GiantLv: 1
    }

    //商品解锁Id
    unlockGoods = [0];
    //商品展示Id
    displayGoods = [0];
    //当前选中的武器类型
    chooseWeapon = 0;

    //体力恢复时间
    lastRecoverTime = Date.now();
    //免费提示次数
    tipNum = 1;
    //
    // 解锁进度-记录关卡数量
    unlockLvRec = {
        curId: 1,
        curLv: 0,
    }

    //分享复活次数
    shareResuergenceNum = 0;

}

//详细的关卡数据-根据游戏变化
export class LevelDataTmp {
    /**等级 */
    lv = 1;
    /**路径 */
    path: string[] = [];
    /**敌人 { pathId: number, type: number, min: number, max: number }*/
    enemy: any[][] = [];
    /**道具 { propType: GlobalEnum.PropType, eleType: number, val: any }*/
    prop: any[][] = [];
}

//场景数
export class LvModelData {
    lv = 1;
    sceneType: string = 'SceneCity';
    models: { [name: string]: { p: Vec3, r: Vec3, s: Vec3 }[] } = {};
    camera: { p: Vec3, r: Vec3, height: number } = {
        p: v3(5.5, 12, 4), r: v3(-60, 60, 0), height: 3
    }
}
