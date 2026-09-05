import { _decorator, Component, Node, Prefab, instantiate } from 'cc';
import { BasicSystem } from '../Basic/BasicSystem';
import { BasicUI } from '../Basic/BasicUI';
import EventManager from '../Managers/EventManager';
import { EventTypes } from '../Managers/EventTypes';
import { clog } from '../Tools/ColorLog';
import GlobalPool from '../Tools/GlobalPool';
import Loader from '../Tools/Loader';
import { UIEnum } from './UIEnum';
const { ccclass, property } = _decorator;

@ccclass('UISystem')
export class UISystem extends BasicSystem {
    private static uiLayer: Node;
    //记录所有加载过的UI
    private static uiRecs: { [ui: string]: { cmp: BasicUI, node: Node } };
    private static uiBound: string = 'UI';
    /**当前显示的UI队列,越顶层的ui越靠后 */
    private static activeUIQueue: UIEnum[];

    public static init(uiLayer: Node) {
        if (this.isInit) return;
        this.isInit = true;

        this.uiLayer = uiLayer;
        this.uiRecs = {};
        this.activeUIQueue = [];

        //加载UI包资源
        this.loadUIBound();
    }

    //#region -----------------对外方法----------------
    /**
     * 显示对应的UI
     * @param ui ,UI枚举类型,名称需要和所在文件夹名称,对应的预制体一致 
     * @param d 
     */
    public static showUI(ui: UIEnum, d?: any) {
        this.loadUI(ui, (node: Node) => {
            this.uiRecs[ui].cmp.show(d);
            clog.log('show UI:', ui);
            EventManager.emit(EventTypes.GameEvents.UIChanged,);
        })
    }
    /**隐藏指定UI */
    public static hideUI(ui: UIEnum, d?) {
        if (this.uiRecs[ui]) {
            this.uiRecs[ui].cmp.hide(d);
            clog.warn('hide UI:', ui);
            EventManager.emit(EventTypes.GameEvents.UIChanged,);
        }
    }

    //#endregion
    //#region -----------------私有方法----------------
    //加载UI bound
    private static loadUIBound() {
        Loader.loadBundle(this.uiBound, (error?: any) => {
            if (error) {
                console.error('UI资源包加载失败:', error);
                this.isInitFinished = true;
                return;
            }
            this.loadUICustomPerfabs(() => {
                this.isInitFinished = true;
            })
        })
    }
    private static uiCustomPerfabsUrl = 'Assets/CustomPerfabs';
    //加载UI 自定义的预制体 并创建对象池
    private static loadUICustomPerfabs(cb) {
        Loader.loadBundleDir(this.uiBound, this.uiCustomPerfabsUrl, (perfabs: Prefab[]) => {
            if (!perfabs) {
                console.error('UI预制体目录加载失败:', this.uiCustomPerfabsUrl);
                cb && cb();
                return;
            }
            //创建对象池
            for (let i = 0; i < perfabs.length; i++) {
                const p = perfabs[i];
                GlobalPool.createPool(p.data.name, p);
            }
            cb && cb();
        }, Prefab, true);
    }

    /**加载UI资源 */
    private static loadUI(ui: UIEnum, cb: (node: Node) => void) {
        if (!this.uiRecs[ui]) {
            Loader.loadBundleRes(this.uiBound, ui + "/" + ui, (res: Prefab) => {
                if (!res) {
                    console.error('要显示的UI:' + ui + '不存在');
                } else {
                    //实例化预制体
                    let node = instantiate(res);
                    node.active = false;
                    let cmp = node.getComponent(BasicUI);
                    let parent = this.uiLayer.getChildByName(ui);
                    if (parent) {
                        node.parent = parent;
                    } else {
                        console.error('UILayer 子节点中不存在:' + ui);
                        return;
                    }

                    this.uiRecs[ui] = { cmp: cmp, node: node };
                    cb && cb(node);
                }
            }, Prefab, true);

        } else {
            cb && cb(this.uiRecs[ui].node);
        }
    }
    //#endregion
}
