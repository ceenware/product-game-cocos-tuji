import { clamp, JsonAsset, sys } from "cc";
import { BasicSystem } from "../Basic/BasicSystem";
import { GetRandomLvData, LevelConfig } from "../Config/LevelConfig";
import EventManager from "../Managers/EventManager";
import { EventTypes } from "../Managers/EventTypes";
import { clog } from "../Tools/ColorLog";
import Loader from "../Tools/Loader";
import { LevelDataTmp, LvModelData, StorageTemp } from "./StorageTemp";

export class StorageSystem extends BasicSystem {
    //存档名称+版本号构成存储的Id
    private static _storageName = 'RoadCreator' + '01';
    private static _data: StorageTemp;

    public static init(d?: any): void {
        if (this.isInit) return;
        this.isInit = true;

        let newData = new StorageTemp();
        //获取存档
        let data = sys.localStorage.getItem(this._storageName);
        if (data) {
            //解析数据
            let res = JSON.parse(data);
            if (res) {
                //同步新的数据结构到存档中
                this.copyObject(res, newData);
                this._data = res;
            } else {
                //解析失败 
                this._data = newData;
            }
        } else {
            this._data = newData;
        }
        //再次存档一次
        this.saveData();
        //读取关卡数据
        this.loadLevelData();

        //test

    }
    //#region ----------------存档操作-对外--------------
    /**获取存档 */
    public static getData() {
        return this._data;
    }
    //获取json数据
    public static getJsonData(key: string) {
        return this._allJsonData[key];
    }
    /**
     * 修改存档
     * @param cb 
     * @param isSave 是否储存到本地
     */
    public static setData(cb: (d: StorageTemp) => void, isSave = false) {
        cb(this._data);
        isSave && this.saveData();
    }
    /**
     * 发送数据变更事件, 手动调用, 用于更新资源在UI上的显示
     * @param isAnim 如果时金币等资源变更需要动画显示 则传入true
     */
    public static updateToAssets(isAnim = false, isMask = true) {
        EventManager.emit(EventTypes.GameEvents.UserAssetsChanged, isAnim, isMask);
    }

    /**更新到存档中 */
    public static saveData() {
        sys.localStorage.setItem(this._storageName, JSON.stringify(this._data));
    }
    /**关卡+1 */
    public static addLv() {
        // if (this._data.levelAssets.curLv == this._data.levelAssets.maxLv) {
        //     let _maxLv = Object.keys(this._levelData).length;
        //     this._data.levelAssets.maxLv = clamp(++this._data.levelAssets.maxLv, 1, _maxLv);
        // }
        // this._data.levelAssets.curLv = clamp(++this._data.levelAssets.curLv, 1, this._data.levelAssets.maxLv);
        this._data.levelAssets.curLv++;
        this.saveData();
    }
    /**获取指定关卡数据-默认为当前关卡数据 */
    public static getLvData(lv?: number): LevelDataTmp {
        if (undefined === lv) {
            lv = this._data.levelAssets.curLv;
        }
        // if (!this._levelData[lv]) {
        //     let n = Object.keys(this._levelData).length;
        //     lv = n;
        // }
        // let data = this._levelData[lv] as LevelDataTmp;       
        // lv = 23; //test
        let data; 
        let maxLv = Object.keys(LevelConfig).length;
        if (lv > maxLv) {
            clog.warn('随机');
            //随机
            data = GetRandomLvData(lv)
        } else {
            data = LevelConfig[lv];
        }
        clog.warn('当前关卡 :' + lv);

        // data = LevelConfig[16]; //test
        // //获取配置数据
        // data = GetRandomLvData(lv)//test

        return data;
    }

    //获取最大关卡数
    public static getMaxLvCount() {
        return Object.keys(this._levelData).length;
    }

    //#endregion

    //#region ----------------关卡数据---------
    /**关卡数据Bound */
    private static levelDataBound = 'LevelData';
    /**关卡数据 */
    private static levelDataJson = 'LevelData';

    /**关卡数据-数据格式*/
    private static _levelData: { [lv: number]: {} } = {};
    /**所有的json数据 */
    private static _allJsonData: { [name: string]: any } = {};

    //加载关卡数据
    private static loadLevelData() {
        Loader.loadBundle(this.levelDataBound, (error?: any) => {
            if (error) {
                console.error('关卡数据资源包加载失败，使用内置关卡配置:', error);
                this._allJsonData = {};
                this._levelData = {};
                this.isInitFinished = true;
                return;
            }
            //加载json数据
            Loader.loadBundleDir(this.levelDataBound, '/', (res: JsonAsset[]) => {
                if (!res) {
                    console.error('关卡数据目录加载失败，使用内置关卡配置');
                    this._allJsonData = {};
                    this._levelData = {};
                    this.isInitFinished = true;
                    return;
                }
                res.forEach(e => {
                    this._allJsonData[e.name] = e.json;
                })
                this._levelData = this._allJsonData[this.levelDataJson];

                this.isInitFinished = true;
            }, JsonAsset, false);
        })
    }
    //#endregion


    /**数据类型变化时,复制旧的数据 到新的存档-*/
    private static copyObject(oldData: any, newData: any) {
        for (let key in newData) {
            switch (typeof newData[key]) {
                case "number":
                case "boolean":
                case "string": {
                    oldData[key] = undefined !== oldData[key] ? oldData[key] : newData[key];
                    break;
                }
                case "object": {
                    if (Array.isArray(newData[key])) {
                        if (undefined == oldData[key]) {
                            oldData[key] = [].concat(newData[key]);
                        }
                    } else {
                        if (undefined == oldData[key]) oldData[key] = {};
                        this.copyObject(oldData[key], newData[key]);
                    }
                    break;
                }
                default: {
                    break;
                }
            }
        }
    }
}
