import { Asset, assetManager, BlockInputEvents, clamp01, error, Label, log, Node, ProgressBar } from "cc";
import GlobalData from "../Config/GlobalData";
import { GlobalEnum } from "../Config/GlobalEnum";
import EventManager from "../Managers/EventManager";
import { EventTypes } from "../Managers/EventTypes";

export default class Loader {
    private static readonly BundleLoadTimeoutMs = 12000;
    /**记录文件夹路径对应的资源数组 */
    protected static dirAsset: { [key: string]: Asset[] } = {};
    /**记录所有加载完成的资源，包括通过文件夹加载的资源 */
    protected static singleAsset: { [key: string]: Asset } = {};

    //#region ------------进度条及触摸遮罩-----------------
    private static isInitLoaderUI = false;
    private static loadUIData: { ui: Node, progressBar: ProgressBar, blockInput: BlockInputEvents } =
        { ui: null, progressBar: null, blockInput: null };
    /**初始化 加载UI界面信息 */
    public static initLoaderUI() {
        if (this.isInitLoaderUI) return;
        let cvas = GlobalData.get(GlobalEnum.GlobalDataType.Canvas) as Node;
        let ui = cvas.getChildByName('LoaderUI');
        this.loadUIData.ui = ui;
        this.loadUIData.progressBar = ui.getComponentInChildren(ProgressBar);
        this.loadUIData.blockInput = ui.getComponent(BlockInputEvents);
        this.isInitLoaderUI = true;
        uniSdk.setOwnerNameLabel(ui.getChildByName("OwnerLabel").getComponent(Label));
    }

    /**显示进度条：发送事件，通知UI节点显示进度 */
    protected static showProgressBar(rate?: number) {
        if (undefined === rate) {
            rate = 0;
        }
        this.showMask();
        if (this.loadUIData.ui) {
            this.loadUIData.ui.active = true;
        }
    }
    /**
     * 根据资源加载进度更新进度条
     * @param completedCount    已加载完成的资源数量
     * @param totalCount        要加载的资源总数量
     * @param item              当前加载完成的资源
     */
    protected static updateProgress(completedCount: number, totalCount: number, item: any) {
        let rate = clamp01(completedCount / totalCount);
        if (this.loadUIData.progressBar) {
            this.loadUIData.progressBar.progress = clamp01(rate);
        }
    }
    protected static hideProgressBar() {
        if (this.loadUIData.ui) {
            this.loadUIData.ui.active = false;
        }
        this.hideMask();
    }
    //显示遮罩，只屏蔽触摸事件，不显示进度条，不变暗屏幕
    protected static showMask() {
        if (this.loadUIData.blockInput) {
            this.loadUIData.blockInput.enabled = true;
        }
    }
    protected static hideMask() {
        if (this.loadUIData.blockInput) {
            this.loadUIData.blockInput.enabled = false;
        }
    }
    //#endregion

    //#region 子包、资源包加载
    /**子包加载状态记录 */
    protected static subpackageRecords: { [name: string]: SubpackageRecord } = {};
    /**需要加载的子包队伍 */
    protected static subpackageSequence: string[] = [];
    /**
     * 加载资源包（与原加载子包接口用法一致）
     * @param name      资源包名称
     * @param cb        回调函数，只需后台预加载资源时，传入null即可
     * @param mask      加载过程中是否需要显示进度条并阻断玩家触摸操作，当需要加载完成后才能进行下一步操作时，请传入true
     * @param insert    插队加载，为true时，会在当前任务加载完后立即加载该资源包，队列中的其他任务延后加载
     */
    public static loadBundle(name: string, cb: Function, mask = false, insert: boolean = false) {
        this.initLoaderUI();
        this.loadSubpackage(name, cb, mask, insert);
    }
    /**
     * 加载子包资源
     * @param name      子包名称
     * @param cb        回调函数，只需后台预加载资源时，传入null即可
     * @param mask      加载过程中是否需要显示进度条并阻断玩家触摸操作，当需要加载完成后才能进行下一步操作时，请传入true
     * @param insert    插队加载，为true时，会在当前任务加载完后立即加载该资源包，队列中的其他任务延后加载
     */
    private static loadSubpackage(name: string, cb: Function, mask?: boolean, insert?: boolean) {
        if (undefined === mask) {
            mask = false;
        }
        if (undefined === insert) {
            insert = false;
        }
        let record = this.subpackageRecords[name];
        if (!record) {
            record = new SubpackageRecord(name, cb, mask);
            this.subpackageRecords[name] = record;
        }
        switch (record.state) {
            case LoadState.inited: {
                if (mask) this.showSubpackageProgress();
                if (insert && this.subpackageSequence.length > 0) {
                    this.subpackageSequence.splice(1, 0, name);
                    record.enterSequence();
                } else {
                    this.subpackageSequence.push(name);
                    if (this.subpackageSequence.length > 1) {
                        record.enterSequence();
                    } else {
                        this._loadSubpackage(name);
                    }
                }
                break;
            }
            case LoadState.waiting: {
                if (mask) this.showSubpackageProgress();
                record.pushCb(cb, mask);

                if (insert && this.subpackageSequence.length > 0) {
                    let index = this.subpackageSequence.indexOf(name);
                    if (index > 1) {
                        this.subpackageSequence.splice(index, 1);
                        this.subpackageSequence.splice(1, 0, name);
                        record.enterSequence();
                    }
                    // } else {
                    //     this.subpackageSequence.push(name);
                    //     if (this.subpackageSequence.length > 1) {
                    //         record.enterSequence();
                    //     } else {
                    //         this._loadSubpackage(name);
                    //     }
                }

                break;
            }
            case LoadState.turnTo: {
                if (mask) this.showSubpackageProgress();
                record.pushCb(cb, mask);
                this._loadSubpackage(name);
                break;
            }
            case LoadState.loading: {
                if (mask) this.showSubpackageProgress();
                record.pushCb(cb, mask);
                break;
            }
            case LoadState.finished: {
                setTimeout(() => {
                    if (!!cb) cb();
                }, 0);
                break;
            }
            case LoadState.failed: {
                setTimeout(() => {
                    if (!!cb) cb(record.error);
                }, 0);
                break;
            }
        }
    }

    private static loadNextSubpackage() {
        if (this.subpackageSequence.length === 0) {
            this.hideSubpackageProgress();
            return;
        }

        const name = this.subpackageSequence[0];
        const record = this.subpackageRecords[name];
        if (!record) {
            console.error("Loader: 子包队列记录不存在：", name);
            this.subpackageSequence.shift();
            this.loadNextSubpackage();
            return;
        }
        record.turnToLoad();
        this.loadSubpackage(name, null, !!record.maskCount);
    }

    private static finishSubpackage(name: string, err?: any) {
        const index = this.subpackageSequence.indexOf(name);
        if (index >= 0) {
            this.subpackageSequence.splice(index, 1);
        }

        if (err) {
            this.subpackageRecords[name].loadFail(err);
        } else {
            this.subpackageRecords[name].loadFinish();
        }
        this.hideSubpackageProgress();
        this.loadNextSubpackage();
    }

    private static _loadSubpackage(name) {
        console.log("Loader: 开始加载子包：", name);
        // console.log("子包加载队列：", this.subpackageSequence.toString());
        this.subpackageRecords[name].loadStart();
        this.runTimedLoad(`子包 ${name}`, (done) => assetManager.loadBundle(name, done), (err, bundle) => {
            if (err) {
                console.error("Loader: 子包加载出错：", name);
                console.error(err);
                this.finishSubpackage(name, err);
                return;
            }
            console.log("Loader: 子包加载完成：", name);
            this.finishSubpackage(name);
        });
    }

    private static runTimedLoad(label: string, start: (done: Function) => void, finish: Function) {
        let settled = false;
        const timeout = setTimeout(() => {
            if (settled) return;
            settled = true;
            const error = new Error(`加载超时: ${label}`);
            console.error('Loader:', error.message);
            finish(error, null);
        }, this.BundleLoadTimeoutMs);

        const done = (...args: any[]) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            finish(...args);
        };

        try {
            start(done);
        } catch (error) {
            done(error, null);
        }
    }
    protected static subpackageProgressTimer: number = null;
    /**显示子包加载进度条 */
    protected static showSubpackageProgress() {
        if (null === this.subpackageProgressTimer) {
            this.showProgressBar();
            this.subpackageProgress = 0;
            this.subpackageProgressTimer = setInterval(this.updateSubpackageProgress.bind(this), 100);
        }
    }
    protected static subpackageProgress: number = 0;
    protected static updateSubpackageProgress() {
        this.subpackageProgress += 0.03;
        if (this.subpackageProgress >= 1) {
            this.subpackageProgress = 0;
        }

    }
    protected static hideSubpackageProgress() {
        if (null !== this.subpackageProgressTimer) {
            let count = 0;
            for (let i = this.subpackageSequence.length - 1; i >= 0; --i) {
                count += this.subpackageRecords[this.subpackageSequence[i]].maskCount;
            }
            if (count == 0) {
                clearInterval(this.subpackageProgressTimer);
                this.subpackageProgressTimer = null;
                this.subpackageProgress = 0;
                this.hideProgressBar();
            }
        }
    }
    //#endregion

    //#region 资源加载
    /**
     * 从资源包加载单个资源，调用前请确保该资源包已加载完成
     * @param bundle    资源包名
     * @param url       资源相对路径
     * @param cb        加载回调
     * @param mask      加载过程中是否阻挡玩家触摸操作，默认阻挡
     */
    public static loadBundleRes(bundle: string, url: string, cb: (asset: any) => void, type?: typeof Asset | boolean, mask?: boolean) {
        let b = assetManager.getBundle(bundle);
        if (!b) {
            console.error("资源包 " + bundle + " 尚未加载，无法获取资源:", url);
            cb(null);
            return;
        }
        let assetType = null;
        if (undefined === type) {
            mask = true;
        } else if (typeof type === "boolean") {
            mask = !!type;
        } else {
            assetType = type;
            if (undefined === mask) {
                mask = true;
            }
        }
        if (mask) {
            this.showMask();
        }
        this.runTimedLoad(`资源 ${bundle}/${url}`, (done) => {
            if (null !== assetType) {
                b.load(url, assetType, done);
            } else {
                b.load(url, done);
            }
        }, (err, res) => {
                if (mask) {
                    this.hideMask();
                }
                if (err) {
                    error(err.message || err);
                    cb(null);
                    return;
                }
                cb(res);
            });
    }
    /**
     * 从资源包加载多个资源，调用前请确保该资源包已加载完成
     * @param bundle    资源包名
     * @param urls      资源相对路径
     * @param cb        加载回调
     * @param type      要加载的资源类型
     * @param mask      加载过程中是否显示加载进度条并阻挡玩家操作，默认为true
     */
    public static loadBundleArray(bundle: string, urls: string[], cb: (assets: any) => void, type?: typeof Asset | boolean, mask?: boolean) {
        let b = assetManager.getBundle(bundle);
        if (!b) {
            console.error("资源包 " + bundle + " 尚未加载，无法获取资源数组:", urls);
            cb(null);
            return;
        }
        let assetType = null;
        if (undefined === type) {
            mask = true;
        } else if (typeof type === "boolean") {
            mask = !!type;
        } else {
            assetType = type;
            if (undefined === mask) {
                mask = true;
            }
        }
        if (mask) {
            this.showProgressBar();
        }
        this.runTimedLoad(`资源数组 ${bundle}`, (done) => {
            if (!!assetType) {
                b.load(urls, assetType, this.updateProgress.bind(this), done);
            } else {
                b.load(urls, this.updateProgress.bind(this), done);
            }
        }, (err, res) => {
                if (mask) {
                    this.hideProgressBar();
                }
                if (err) {
                    error(err.message || err);
                    cb(null);
                    return;
                }
                cb(res);
            });
    }
    /**
     * 从资源包中加载文件夹，调用前请确保该资源包已加载完成
     * @param bundle    资源包名
     * @param dir       文件夹路径
     * @param cb        加载回调
     * @param type      要加载的文件夹中的资源类型
     * @param mask      加载过程中是否显示加载进度条并阻挡玩家操作，默认为true
     */
    public static loadBundleDir(bundle: string, dir: string, cb: (assets: any[]) => void, type?: typeof Asset | boolean, mask?: boolean) {
        let b = assetManager.getBundle(bundle);
        if (!b) {
            console.error("资源包 " + bundle + " 尚未加载，无法获取资源文件夹:", dir);
            cb(null);
            return;
        }
        let assetType = null;
        if (undefined === type) {
            mask = true;
        } else if (typeof type === "boolean") {
            mask = !!type;
        } else {
            assetType = type;
            if (undefined === mask) {
                mask = true;
            }
        }
        if (mask) {
            this.showProgressBar();
        }
        this.runTimedLoad(`资源目录 ${bundle}/${dir}`, (done) => {
            if (!!assetType) {
                b.loadDir(dir, assetType, this.updateProgress.bind(this), done);
            } else {
                b.loadDir(dir, this.updateProgress.bind(this), done);
            }
        }, (err, arr) => {
                if (mask) {
                    this.hideProgressBar();
                }
                if (err) {
                    log(err);
                    cb(null);
                    return;
                }
                cb(arr);
            });

    }
    public static loadBundleScene(bundle: string, scene: string, cb: (res) => void, mask?) {
        let b = assetManager.getBundle(bundle);
        if (!b) {
            console.error("资源包 " + bundle + " 尚未加载，无法加载场景:", scene);
            cb(null);
            return;
        }
        if (undefined === mask) {
            mask = true;
        }
        if (mask) {
            this.showProgressBar();
        }
        this.runTimedLoad(`场景 ${bundle}/${scene}`, (done) => b.loadScene(scene, this.updateProgress.bind(this), done), (err, res) => {
            if (mask) {
                this.hideProgressBar();
            }
            if (!!err) {
                console.error(err);
                cb(null);
                return;
            }
            cb(res);
        });
    }
    //#endregion

    //#region 预加载
    /**
     * 预加载资源包中的单个资源，调用完后，你仍然需要通过 `loadBundleRes` 来完成加载。
     * @param bundle    资源包名称
     * @param url       资源路径
     * @param assetType 资源类型
     */
    public static preLoadBundleRes(bundle: string, url: string, assetType?) {
        let b = assetManager.getBundle(bundle);
        if (!b) {
            return;
        }
        if (undefined === assetType) {
            b.preload(url);
        } else {
            b.preload(url, assetType);
        }
    }
    /**
     * 预加载资源包中的资源数组，调用完后，你仍然需要通过 `loadBundleRes` 或'loadBundleArray'来完成加载。
     * @param bundle    资源包名称
     * @param urls      资源路径数组
     * @param assetType 资源类型
     */
    public static preLoadBundleArray(bundle: string, urls: string[], assetType?) {
        let b = assetManager.getBundle(bundle);
        if (!b) {
            return;
        }
        if (undefined === assetType) {
            b.preload(urls);
        } else {
            b.preload(urls, assetType);
        }
    }
    /**
     * 预加载资源包中的文件夹，调用完后，你仍然需要通过 `loadBundleDir` 来完成加载。
     * @param bundle    资源包名称
     * @param dir       资源文件夹名称
     * @param assetType 资源类型
     */
    public static preLoadBundleDir(bundle: string, dir: string, assetType?) {
        let b = assetManager.getBundle(bundle);
        if (!b) {
            return;
        }
        if (undefined === assetType) {
            b.preloadDir(dir);
        } else {
            b.preloadDir(dir, assetType);
        }
    }
    /**
     * 预加载资源包中的场景文件，调用完后，你仍然需要通过 `loadBundleScene` 来完成加载。
     * @param bundle    资源包名称
     * @param scene     场景名
     */
    public static preLoadBundleScene(bundle: string, scene: string) {
        let b = assetManager.getBundle(bundle);
        if (!b) {
            return;
        }
        b.preloadScene(scene);
    }
    //#endregion
}

/**子包加载状态 */
class SubpackageRecord {
    /**子包名称 */
    public name: string;
    /**加载状态 */
    public state: LoadState;
    /**回调数组 */
    public cbs: Function[];
    public maskCount: number;
    public error: any = null;

    public constructor(name: string, cb: Function, mask: boolean) {
        this.name = name;
        this.state = LoadState.inited;
        this.cbs = [];
        if (!!cb) this.pushCb(cb);
        this.maskCount = mask ? 1 : 0;
    }

    public pushCb(cb: Function, mask?: boolean) {
        if (!!cb) this.cbs.push(cb);
        if (!!mask) this.maskCount++;
    }
    public enterSequence() {
        this.state = LoadState.waiting;
    }
    public loadStart() {
        this.state = LoadState.loading;
    }
    public loadFinish() {
        this.error = null;
        while (this.cbs.length > 0) {
            let cb = this.cbs.shift();
            if (!!cb) cb();
        }
        this.state = LoadState.finished;
        this.maskCount = 0;
    }
    public loadFail(err: any) {
        this.error = err;
        while (this.cbs.length > 0) {
            let cb = this.cbs.shift();
            if (!!cb) cb(err);
        }
        this.state = LoadState.failed;
        this.maskCount = 0;
    }
    public turnToLoad() {
        this.state = LoadState.turnTo;
    }
}
/**资源加载状态 */
enum LoadState {
    /**已准备好加载 */
    inited = 1,
    /**在队列中等待加载 */
    waiting,
    /**正在加载中 */
    loading,
    /**已加载完成 */
    finished,
    /**在队列中，轮到加载它了 */
    turnTo,
    /**加载失败，后续调用应立即收到失败结果 */
    failed,
}
