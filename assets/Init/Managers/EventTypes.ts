
/**存放所有的事件枚举值
 * 每个枚举需指定起始的Index,防止冲突
*/
export namespace EventTypes {
    /**SDK专属 */
    export enum SDKEvents {
        Index = 0,
        ShowBanner,
        HideBanner,
        ShowVideo,
        ShowInsertAd,
        ShowCustomAd,
        HideCustomAd,
        Share,
        ExitApp,

        //TT
        StartRecord,            //头条：开始录屏
        PauseRecord,            //头条：暂停录屏
        ResumeRecord,           //头条：继续录屏
        StopRecord,             //头条：结束录屏
        RecordSaved,            //头条：录制视频保存成功
        ShareRecord,            //头条：分享录屏

        //ALD
        ReportAldEvent,
        ReportAldStageStart,
        ReportAldStageWin,
        ReportAldStageFail,
        ReportAldStageAward,
        ReportAldStageTools,
        ReportEvent,
        NavigateToSidebar,
    }

    /**游戏框架事件 */
    export enum GameEvents {
        Index = 1000,

        //主要流程
        InitLoadFinished,      //初始场景加载完成
        GameStart,             //游戏开始
        GameLoadFinish,        //游戏关卡资源加载完成
        GameRun,               //运行游戏
        GamePause,             //暂停游戏
        GameResume,            //继续游戏
        GameOver,              //游戏结束
        //框架UI控制
        SetInitUIEnable,       //设置initUI 显隐
        SetLevelManagerEnable, //设置关卡管理器显隐 -清除/显示 关卡场景
        SetGameTimeScale,      //设置dt缩放 
        UserAssetsChanged,     //通知存储信息变更 用于UI数据同步显示  
        SetTouchMaskEnable,    //设置TouchMask 显隐  
        LoadSubPkg,            //动态加载分包资源

        ShowTips,              //提示信息
        UIChanged,
        EnterChooseLv,         //进入指定关卡
    }
    /**游戏中的触摸事件 */
    export enum TouchEvents {
        Index = 1100,
        SetTouchEnable,
        //获取UI坐标系下的触点
        TouchStart,
        TouchMove,
        TouchEnd,
        //触摸对象
        TouchStartObj,
        TouchMoveObj,
        TouchEndObj,
    }
    /**游戏中的相机事件 */
    export enum CameraEvents {
        Index = 1200,
        SetCameraPos,   //直接设置坐标
        SetFollowPos,   //设置跟随的坐标
        SetCameraSelfRot,   //设置相机本身的旋转
        SetCameraSelfPos,   //设置相机本身的位置
        SetCameraSelfOffset,//设置相机本身的位置偏移
        SetCameraOrthoHeightOffset,   //设置相机正交视角的视野高度偏移
    }
    /**UI 事件 */
    export enum UIEvents {
        Index = 1300,
        PrivacyConfirm, //同意隐私政策
        AddGoldEffect,
        ShowCutEnergyAnim,
        ShowTestBanner,
        //-------

    }
    /**wx 广告导出 */
    export enum WXCustomAD {
        Index = 1400,
        ShowGridAd,         //单个格子
        ShowHorizonAd,      //单行水平
        ShowVerticalAd,     //单行垂直
        HideAdByAdId,
    }

    /**地图网格 碰撞管理 */
    export enum GridMapEvents {
        Index = 2000,
        CreateMapData,
        HideMapGrid,
    }

    //#region -------------------自定义----------------
    //关卡流程事件
    export enum CurLevelEvents {
        Index = 2050,
        //------------
        GetEndPathInfo,
        CreateProps,            //创建道具
        HideIncreaceProp,       //隐藏道具
        CreateDrones,            //创建无人机
        ShowHomeCamera,
        HideWeaponProp,
    }

    /** 角色对应的事件*/
    export enum RoleEvents {
        Index = 2300,
        LoadFinish,     //加载完成时
        Lvprops,        //升级属性时
        HitByEnemy,     //被击中
        AddHP,          //回血
        SetRolePos,     //设置位置
        Resurgence,     //复活
        CanceResurgence,//取消复活
        LvupWeapon,
        //      
        AddRoles,       //增加人数
        SetWeapon,      //设置武器
        Death,
        LvupGaint,      //升级巨人
    }


    /**特效事件 */
    export enum EffectEvents {
        Index = 2400,
        ShowBoomErea,       //爆炸区域
        ShowEmoji,          //显示表情
        ShowTrail,          //显示拖尾
        HideTrail,          //隐藏拖尾
        //2d特效        
        showHomeUILvupEffect,
        show3DTo2DEffect,
        showUIEffect,
        //3d
        showParticleEffect,
        showDropGolds,
        showMergeEffect,
        showFrameEffect,

        showObjs,
    }

    /**敌人事件 */
    export enum EnemyEvents {
        Index = 2500,
        CreateEnemys,
    }


    export enum GuideEvents {
        Index = 2600,
        ShowGuideAnim,

    }

    //#endregion
}
