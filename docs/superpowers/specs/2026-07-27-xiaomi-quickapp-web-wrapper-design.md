# 小米快应用 Web 容器设计

## 目标

为《勇者火线突围》生成符合小米快应用规范的 RPK，并提交内测。当前 Cocos 构建产物是 `type: game` 的小游戏包，平台以“参数有误，请检查后重新上传”拒绝，因此不能仅修改包名后继续使用。

## 方案选择

采用标准快应用 Web 容器方案：

- 将现有 Cocos Web Mobile 构建部署到 GitHub Pages 的 `/game/` 路径。
- 创建包名为 `com.yongzhe.huoxiantuwei.quickapp` 的标准快应用工程。
- 快应用首页使用 Web 组件加载 `https://ceenware.github.io/product-game-cocos-tuji/game/`。
- 隐私政策继续使用现有 HTTPS 地址 `https://ceenware.github.io/product-game-cocos-tuji/privacy/`。

未采用的方案：

- 仅修改小游戏 RPK 包名：包体仍为 `type: game`，已被平台拒绝。
- 原生重写为快应用：需要重构 Cocos 游戏运行层，超出本次发布范围。
- 放弃快应用：不符合本次继续提交快应用内测的目标。

## 架构与数据流

1. GitHub Pages 提供静态游戏文件和隐私政策，全部使用 HTTPS。
2. 快应用启动后进入唯一首页。
3. 首页 Web 组件加载 `/game/`，游戏资源继续由 GitHub Pages 提供。
4. 快应用本身不新增账号、支付、聊天、定位、通讯录、相机或麦克风能力。

## 发布信息

- 应用名称：勇者火线突围
- 快应用包名：`com.yongzhe.huoxiantuwei.quickapp`
- 版本名称：`1.0.1`
- 版本号：`2`
- 兼容设备：手机
- 联网类型：需要网络
- 年龄分级：12+
- 隐私数据：涉及平台运行所需的设备信息、网络状态和运行日志
- 隐私政策：`https://ceenware.github.io/product-game-cocos-tuji/privacy/`

## 错误处理

- Web 页面加载失败时显示明确的网络重试提示。
- 快应用 RPK 上传失败时保留平台原始错误，不提交空包或错误类型包。
- GitHub Pages 未返回 HTTP 200、关键游戏资源缺失或包名不一致时停止提交内测。

## 验证

- 检查 `/game/` 返回 HTTP 200，首页和关键资源可访问。
- 检查 RPK 小于平台限制，`manifest.json` 包名、版本和路由正确。
- 使用快应用构建工具完成 release 构建，并检查签名产物。
- 上传后确认平台成功解析应用名称、包名和版本。
- 填写全部必填项、上传软著后，确认页面无校验错误再提交内测。

## 发布边界

本次只部署已有游戏 Web 构建、创建快应用容器并提交小米内测，不改动游戏玩法、账号体系、支付功能或原小游戏发布包。
