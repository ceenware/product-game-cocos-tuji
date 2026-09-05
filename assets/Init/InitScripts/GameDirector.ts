import { _decorator, Component, Node, Prefab, instantiate, Vec3 } from 'cc';
import GlobalData from '../Config/GlobalData';
import { GlobalEnum } from '../Config/GlobalEnum';
import EventManager from '../Managers/EventManager';
import { EventTypes } from '../Managers/EventTypes';
import { PlatformType, SDKSystem } from '../SystemSDK/SDKSystem';
import { StorageSystem } from '../SystemStorage/StorageSystem';
import { UIEnum } from '../SystemUI/UIEnum';
import { UISystem } from '../SystemUI/UISystem';
import { clog } from '../Tools/ColorLog';
import GlobalPool from '../Tools/GlobalPool';
import Loader from '../Tools/Loader';
const { ccclass, property } = _decorator;
/**
 * 控制整个游戏的流程
 */
@ccclass('GameDirector')
export class GameDirector extends Component {
    private _levelManager: Node = null;
    private _isOver = false;

    // #region ---------------------生命周期--------------------
    protected onLoad() {
        this.onEvents();
    }

    protected onEvents() {
        EventManager.on(EventTypes.GameEvents.GameStart, this.onGameStart, this);
        EventManager.on(EventTypes.GameEvents.GameOver, this.onGameOver, this);
        EventManager.on(EventTypes.GameEvents.SetLevelManagerEnable, this.onSetLevelManagerEnable, this);
        EventManager.on(EventTypes.GameEvents.SetTouchMaskEnable, this.onSetTouchMaskEnable, this);
        EventManager.on(EventTypes.GameEvents.LoadSubPkg, this.onLoadSubPkg, this);
    }

    // #endregion

    // #region ---------------------加载方法--------------------

    /**必须加载的额外子包 */
    private subPackgeArr = ['Game', 'Effect', 'Roles'];
    /**记录加载状态 */
    private subPackgeRec: { [bound: string]: boolean } = {};
    /**加载必要的子包 */
    protected loadSubBound(cb) {
        if (this.subPackgeArr.length == 0) {
            cb && cb();
            return;
        }

        let hasFailed = false;
        let loadFinishCb = (boundName: string, error?: any) => {
            if (hasFailed) return;
            if (error) {
                hasFailed = true;
                console.error('加载必要子包失败:', boundName, error);
                cb && cb(error);
                return;
            }
            this.subPackgeRec[boundName] = true;
            // 检测是否加载完毕
            let isFinished = true;
            for (const key in this.subPackgeRec) {
                isFinished = isFinished && this.subPackgeRec[key];
            }
            if (isFinished) {
                cb && cb();
            }
        }
        for (let i = 0, c = this.subPackgeArr.length; i < c; ++i) {
            const boundName = this.subPackgeArr[i];
            if (undefined === this.subPackgeRec[boundName]) {
                this.subPackgeRec[boundName] = false;
            }
            if (!this.subPackgeRec[boundName]) {
                Loader.loadBundle(this.subPackgeArr[i], (error?: any) => {
                    loadFinishCb(boundName, error);
                }, false, false);
            } else {
                loadFinishCb(boundName);
            }
        }
    }
    //记录加载状态
    private isLoadFinish = false;
    //加载游戏中必要的资源
    private loadGameAssets(cb) {
        if (this.isLoadFinish) {
            cb && cb();
        } else {
            //先加载自定义资源
            this.loadCustomPrefabs((error?: any) => {
                if (error) {
                    cb && cb(error);
                    return;
                }
                //获取 levelManager
                this._levelManager = GlobalPool.get('LevelManager');
                if (!this._levelManager) {
                    const levelError = new Error('LevelManager prefab is missing');
                    console.error(levelError);
                    cb && cb(levelError);
                    return;
                }
                this._levelManager.setPosition(Vec3.ZERO);
                this._levelManager.parent = this.node;

                this.isLoadFinish = true;
                clog.log('-----游戏中预制体加载完成-----');
                cb && cb();
            })
        }
    }

    /**游戏自定义的预制体路径,bound : url */
    private customPrefabUrl: { [bound: string]: string } = {
        'Game': 'Prefabs', //默认主要流程预制体的路径
        'Effect': 'Prefabs', //美术-特效包
    };
    /**自定义预制加载状态记录 */
    private customPrefabState: { [bound: string]: boolean } = {};

    /**加载关卡自定义的预制体 并创建对象池 */
    private loadCustomPrefabs(cb) {
        let hasFailed = false;
        let loadPerfabFinish = (boundName: string, error?: any) => {
            if (hasFailed) return;
            if (error) {
                hasFailed = true;
                console.error('加载游戏预制体失败:', boundName, error);
                cb && cb(error);
                return;
            }
            this.customPrefabState[boundName] = true;
            // 检测是否加载完毕
            let isFinished = true;
            for (const key in this.customPrefabState) {
                isFinished = isFinished && this.customPrefabState[key];
            }
            if (isFinished) {
                cb && cb();
            }
        }

        for (const bound in this.customPrefabUrl) {
            if (undefined == this.customPrefabState[bound]) {
                this.customPrefabState[bound] = false;
            }
            if (!this.customPrefabState[bound]) {
                const url = this.customPrefabUrl[bound];
                Loader.loadBundle(bound, (error?: any) => {
                    if (error) {
                        loadPerfabFinish(bound, error);
                        return;
                    }
                    Loader.loadBundleDir(bound, url, (prefabs: Prefab[]) => {
                        if (!prefabs) {
                            loadPerfabFinish(bound, new Error(`预制体目录加载失败: ${bound}/${url}`));
                            return;
                        }
                        for (let i = 0; i < prefabs.length; i++) {
                            const p = prefabs[i];
                            GlobalPool.createPool(p.data.name, p);
                        }
                        loadPerfabFinish(bound);
                    }, Prefab, false);
                }, false);
            } else {
                loadPerfabFinish(bound);
            }
        }
    }

    /**根据实际关卡需要 来加载额外的资源 -todo*/
    private loadExtralAssets(cb) {

        cb();
    }

    /**配置预先需要创建的预制 */
    private preLoadCfg: { [name: string]: number } = {

    }
    /**预先需要创建的预制 */
    private preLoadPrefabs() {
        for (const key in this.preLoadCfg) {
            if (Object.prototype.hasOwnProperty.call(this.preLoadCfg, key)) {
                const num = this.preLoadCfg[key];
                GlobalPool.preCreate(key, num);
            }
        }
    }

    // #endregion

    // #region ---------------------事件回调--------------------
    /**控制touchMask显隐 */
    private _touchMask: Node = null;
    protected onSetTouchMaskEnable(isEnable = false) {
        if (!this._touchMask) {
            let cvs = GlobalData.get(GlobalEnum.GlobalDataType.Canvas) as Node;
            this._touchMask = cvs.getChildByName('TouchMask');
        }
        this._touchMask.active = isEnable;
        clog.warn('TouchMask: ' + isEnable);
    }

    /**控制游戏内容显隐 */
    protected onSetLevelManagerEnable(isEnable) {
        if (undefined == isEnable || !this._levelManager) return;
        this._levelManager.active = isEnable;
    }

    /**开始游戏 */
    protected onGameStart(cb?) {
        //开启initUI
        EventManager.emit(EventTypes.GameEvents.SetInitUIEnable, true);
        //
        this._isOver = false;
        //加载游戏必须的其他子包
        this.loadSubBound((error?: any) => {
            if (error) {
                console.error('游戏启动资源加载失败:', error);
                cb && cb(error);
                return;
            }
            //加载关卡额外需要的分包
            this.loadExtralAssets(() => {
                //加载关卡必须的预制体
                this.loadGameAssets((error?: any) => {
                    if (error) {
                        console.error('游戏预制体加载失败:', error);
                        cb && cb(error);
                        return;
                    }
                    //预先创建指定的预制数量
                    this.preLoadPrefabs();
                    //激活游戏内容
                    this._levelManager.active = true;
                    //关闭initUI
                    EventManager.emit(EventTypes.GameEvents.SetInitUIEnable, false);
                    //回调
                    cb && cb();
                })
            });
        })
    }

    /**游戏结束 */
    protected onGameOver(isWin) {
        if (this._isOver) return;
        this._isOver = true;

        UISystem.hideUI(UIEnum.LevelController);
        if (isWin) {

            switch (SDKSystem._curPlatform) {
                case PlatformType.PCMiniGame:
                case PlatformType.WXMiniGame:
                    //宝箱页面
                    UISystem.showUI(UIEnum.FinishAwardBoxUI, () => {
                        UISystem.showUI(UIEnum.WinUI);
                        //关卡+1
                        StorageSystem.addLv();
                    })
                    break;
                default:
                    UISystem.showUI(UIEnum.WinUI);
                    //关卡+1
                    StorageSystem.addLv();
                    break;
            }

        } else {
            UISystem.showUI(UIEnum.LoseUI);
        }
    }

    private _tmpLoadState: { [bound: string]: boolean } = {};
    /**动态加载指定的分包资源 并实例化预制体-创建对象池*/
    protected onLoadSubPkg(data: { [bound: string]: { isLoadPrefab: boolean, prefabUrl: string, isMask: boolean } }, cb) {
        //初始化状态
        this._tmpLoadState = {};

        let hasFailed = false;
        let loadPerfabFinish = (boundName: string, error?: any) => {
            if (hasFailed) return;
            if (error) {
                hasFailed = true;
                console.error('动态加载分包失败:', boundName, error);
                cb && cb(error);
                return;
            }
            this._tmpLoadState[boundName] = true;
            // 检测是否加载完毕
            let isFinished = true;
            for (const key in this._tmpLoadState) {
                isFinished = isFinished && this._tmpLoadState[key];
            }
            console.log('#2 动态加载分包:', boundName, '完成');
            if (isFinished) {
                cb && cb();
            }
        }

        for (const bound in data) {
            const d = data[bound];
            this._tmpLoadState[bound] = false;
            const isMask = d.isMask || false;
            console.log('#1 动态加载分包开始:', bound);

            Loader.loadBundle(bound, (error?: any) => {
                if (error) {
                    loadPerfabFinish(bound, error);
                    return;
                }
                //加载预制体-创建对象池
                if (d.isLoadPrefab) {
                    const url = d.prefabUrl || '';
                    Loader.loadBundleDir(bound, url, (prefabs: Prefab[]) => {
                        if (!prefabs) {
                            loadPerfabFinish(bound, new Error(`动态预制体目录加载失败: ${bound}/${url}`));
                            return;
                        }
                        for (let i = 0; i < prefabs.length; i++) {
                            const p = prefabs[i];
                            GlobalPool.createPool(p.data.name, p);
                        }
                        loadPerfabFinish(bound);
                    }, Prefab, isMask);
                } else {
                    loadPerfabFinish(bound);
                }
            }, isMask);
        }
    }

    // #endregion

}
