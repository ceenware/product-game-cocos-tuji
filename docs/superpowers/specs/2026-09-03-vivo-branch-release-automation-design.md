# vivo 分支独立构建与发布自动化设计

## 背景

`product-game-cocos-tuji` 仓库同时维护 vivo、OPPO、小米、华为、抖音等平台。每个平台使用自己的长期分支，平台包的版本、签名、构建修补和 GitHub Release 不能相互影响。

当前 `vivo` 分支尚无自动发布工作流。之前用于 vivo 审核包的可用修补和验证脚本位于 `/Users/vicky/Documents/勇者火线突围/tmp/vivo_rebuild`，但这些脚本包含本机绝对路径、互相冲突的硬编码版本、对本机 Cocos 安装目录的直接修改，以及本地私钥读取逻辑，不能直接进入共享仓库。

本设计先在 `vivo` 分支落地一套可复现的独立发布链路。其他平台后续沿用相同约定，但拥有各自的配置、脚本、工作流、标签和 Release，不共享版本序列。

## 目标

- `vivo` 分支每次符合条件的代码推送自动构建 vivo 小游戏包并创建 GitHub Release。
- vivo 版本只根据 `vivo-v*` 标签递增，不受其他平台标签或分支影响。
- 上一次已提交 vivo 平台的版本为 `1.0.10`、版本号代码为 `11`；首次自动发布应生成 `1.0.11`、版本号代码 `12`。
- 默认使用 GitHub 托管 Runner，不能依赖自托管 Runner 才能发布。
- 手动执行时可切换 GitHub 托管 Windows、GitHub 托管 macOS、自托管 Windows 或自托管 macOS。
- Runner 检测操作系统和 Cocos Creator 3.6.2；版本正确时跳过安装，缺失或版本不符时自动安装到工作流可控的工具目录。
- Release 同时提供已签名平台包、校验和、构建元数据和验证报告，作为平台上传时的唯一可信产物。
- 私钥和证书只来自 GitHub Secrets 或本地显式传入路径，绝不写入 Git 历史或 Release。

## 非目标

- 本次不创建 OPPO、小米、华为或抖音的发布工作流。
- 本次不自动登录 vivo 开放平台，也不自动提交平台审核。
- 本次不迁移旧目录中的 `node_modules`、`build`、`dist`、`dist_temp`、RPK、日志、录像或审核材料。
- 本次不提交任何现有 `private.pem`、`certificate.pem` 或其他私密签名材料。
- 本次不要求 Linux Runner 执行 Cocos Creator 3.6.2 源工程导出。

## 分支与 Release 约定

每个平台分支只触发本平台工作流。vivo 工作流仅监听 `vivo` 分支，发布标签采用 `vivo-v<semver>`，例如 `vivo-v1.0.11`。

版本计算规则如下：

1. 完整拉取 Git 历史和标签。
2. 若当前提交已经存在一个合法的 `vivo-v*` 标签，重跑时复用该版本，不再次递增。
3. 否则读取最新合法 vivo 标签，并将补丁版本加一。
4. 若仓库还没有 vivo 标签，则使用配置中的基线 `1.0.10` / `11`，生成 `1.0.11` / `12`。
5. 不读取 `oppo-v*`、`huawei-v*` 等其他平台标签。
6. 同一时间只允许一个 vivo 发布任务执行，后续任务排队且不取消正在发布的任务，避免两个提交计算出相同版本。

自动发布只增加当前发布系列的补丁位。`versionCode` 使用 `基线 versionCode + 新补丁号 - 基线补丁号` 计算，因此基线 `1.0.10` / `11` 的下一版必然为 `1.0.11` / `12`。需要切换到新的主版本或次版本时，先在 `release.json` 中显式更新版本基线和 `versionCode` 基线；工作流不得自行猜测跨系列的版本号代码。

GitHub Release 名称与标签一致，目标提交固定为触发工作流的 vivo 提交。工作流在构建和验证全部通过后才创建标签与 Release。若创建 Release 后上传产物中断，重新运行同一提交时复用标签并覆盖上传同名产物，以便恢复而不产生空版本。

## 仓库结构

新增内容按平台隔离：

```text
platforms/
  vivo/
    release.json
    scripts/
      resolve-version.js
      ensure-cocos.js
      build.js
      patch-cocos-build.js
      patch-min-platform.js
      patch-runtime.js
      sign-rpk.js
      verify-cocos-build.py
      verify-startup-entry.py
      verify-release-rpk.py
      write-build-metadata.js
    tests/
      fixtures/
      *.test.js
      test_*.py
.github/
  workflows/
    release-vivo.yml
```

脚本名称可在实施时根据测试边界微调，但职责必须保持分离。生成目录统一位于工作区临时路径或 `artifacts/vivo`，并由 `.gitignore` 排除。

## 平台配置

`platforms/vivo/release.json` 是 vivo 构建参数的唯一来源，至少包含：

- 平台标识和标签前缀 `vivo` / `vivo-v`。
- 包名 `com.yongzhe.huoxiantuwei.vivominigame`。
- Cocos Creator 版本 `3.6.2`。
- 基线版本名 `1.0.10` 和基线 `versionCode` 11。
- 最低平台版本 `1206`。
- 主包 4 MiB、总包 20 MiB 的大小限制。
- 预期分包名称。
- Windows 官方安装包 `https://download.cocos.com/CocosCreator/v3.6.2/CocosCreator-v3.6.2-win-102813.zip`。
- macOS 官方安装包 `https://download.cocos.com/CocosCreator/v3.6.2/CocosCreator-v3.6.2-mac-102813.zip`。
- 默认 GitHub 托管 Runner `windows-2022` 和手动可选 Runner 映射，其中托管 macOS 固定为 `macos-15-intel`。

修补、签名、验证和元数据脚本全部读取这份配置以及本次计算出的版本文件，禁止各脚本再次写死版本、包名或分包列表。

## Runner 选择与工具安装

### 触发方式

- `push` 到 `vivo`：自动使用 `windows-2022`，保证无需自托管资源即可发布。纯 Markdown 和 `docs/**` 修改不触发平台包发布；游戏源码、资源、设置、vivo 配置、脚本或工作流修改均触发。
- `workflow_dispatch`：提供 `auto`、`windows`、`macos`、`self-hosted-windows`、`self-hosted-macos` 选项。
- `auto` 与自动推送相同，选择 GitHub 托管 Windows。
- GitHub 托管 macOS 使用 `macos-15-intel`，不使用会漂移的 `macos-latest`。若 GitHub 后续退役该标签，必须通过代码评审更新 `release.json`，不能在运行时静默切换系统版本。
- 自托管 Windows 使用 `['self-hosted', 'Windows', 'X64', 'cocos-vivo']`，自托管 macOS 使用 `['self-hosted', 'macOS', 'X64', 'cocos-vivo']`，避免任务落到 Linux、错误操作系统或错误架构机器。

轻量选择任务根据触发类型输出唯一的 `runs-on` JSON；只有一个构建任务运行，不能使用同时构建多个系统的矩阵，以免一次提交创建多个竞争 Release。

### 环境检测

构建任务先根据 `RUNNER_OS` 选择 Windows 或 macOS 逻辑，并拒绝 Linux。工具检测按以下顺序执行：

1. 优先使用显式环境变量 `COCOS_CREATOR` 指向的可执行文件。
2. 检查 Runner 工具缓存和 Cocos Creator 的标准安装目录。
3. 调用可执行文件或读取应用元数据，确认精确版本为 `3.6.2`。
4. 版本正确则记录路径并跳过下载。
5. 缺失或版本不符时，下载配置中的官方安装包，校验下载结果，并安装或解压到 Runner 工具缓存。
6. 再次检测版本；仍不正确时立即失败，不能继续使用未知版本构建。

GitHub 托管 Runner 每次可能是全新环境，因此使用 `actions/cache` 缓存按操作系统和 Cocos 版本命名的安装目录。自托管 Runner 可直接复用已有安装；自动安装只写入工作流工具目录，不修改全局系统安装。

Node.js、Python 和 vivo 打包依赖同样先检测版本。项目依赖采用锁文件和确定性安装命令；如果旧 vivo 工程没有可复用锁文件，实施时生成并提交平台专用锁文件。

## 构建流程

单次发布按以下顺序执行：

1. Checkout `vivo` 分支触发提交，并拉取全部标签。
2. 解析或复用 vivo 版本，生成本次只读版本数据文件。
3. 检测并准备 Cocos Creator 3.6.2、Node.js、Python 和打包工具。
4. 使用 Cocos Creator CLI 从仓库根工程导出 `vivo-mini-game` 构建目录。
5. 根据平台配置修补 Cocos 编译配置和 manifest。
6. 在构建目录安装固定版本的 `quickgame-cli` 等打包依赖。
7. 对复制到构建目录的运行时和适配器执行 vivo 修补；不得修改 Cocos Creator 安装目录中的原始文件。
8. 生成分包并使用临时签名文件创建最终 RPK。
9. 对 Cocos 输出、启动入口、分包结构、版本、包名、大小和签名执行验证。
10. 将最终 RPK、验证报告、构建元数据和 `SHA256SUMS` 汇总到 `artifacts/vivo`。
11. 验证全部通过后创建或恢复 `vivo-v<version>` Release，并上传全部产物。

任何步骤失败都不得创建新的成功 Release。构建目录每次从干净状态产生，不能使用仓库中历史生成物作为输入。

## 旧 vivo 脚本迁移原则

以下能力保留并重构：

- `patch-vivo-cocos-build.js`：保留 compile config 和 manifest 的平台字段修补，参数改为配置文件、版本文件和构建目录。
- `patch-vivo-min-platform.js`：保留 quickgame-cli 最低平台版本兼容修补，但增加依赖版本和目标代码特征校验；上游代码不匹配时明确失败。
- `patch-vivo-runtime.js`：保留已验证的运行时、分包加载和入口修复，只修改构建目录副本；所有 Cocos 路径通过参数或检测结果传入。
- `resign-vivo-rpk-with-online-cert.js`：改为通用的参数化签名脚本，从临时文件路径读取 Secrets 解码后的密钥和证书，不再引用 `/Users` 或 `/tmp` 固定路径。
- 三个验证脚本：统一读取平台配置和版本文件，不再固定 `1.0.9`、`1.0.10`、固定哈希文件名或本机目录。

迁移时不得复制旧工程的生成物和依赖目录。旧 `package.json` 中错误的平台描述、历史版本和非确定依赖不能直接沿用。

## 签名与 Secrets

GitHub 仓库需要配置以下 Actions Secrets：

- `VIVO_SIGN_PRIVATE_KEY_B64`：release 私钥的 Base64 内容。
- `VIVO_SIGN_CERTIFICATE_B64`：release 证书的 Base64 内容。

仓库当前尚未配置这两个 Secrets。工作流和无签名测试可以先合入，但启用 push 自动发布及创建首个正式 Release 前必须完成配置。

工作流只在签名步骤将 Secrets 解码到 Runner 临时目录，设置最小文件权限，并在任务结束时清理。日志禁止输出密钥、证书正文或包含 Secrets 的命令行参数。

签名前验证私钥和证书可以配对，签名后验证 RPK 的签名结构和证书指纹。构建元数据可以记录证书公开指纹，但不得包含证书私密材料。Secrets 缺失或配对失败时，发布任务明确失败，不生成测试签名包冒充正式包。

本地构建通过命令行参数或环境变量提供密钥路径；仓库内不提供默认私钥路径。

## 验证与发布产物

自动验证至少覆盖：

- Cocos 构建目录包含预期编译配置、manifest、入口和引擎适配文件。
- 包名、`versionName`、`versionCode` 和 `minPlatformVersion` 与本次发布配置一致。
- 外层 RPK、`main.rpk` 和所有配置分包均可解压且没有损坏成员。
- manifest 分包声明与实际分包文件、`src/settings.json` 一致。
- 启动入口和运行时加载路径使用 RPK 内正确路径，不含旧的目录穿越加载逻辑。
- 主包不超过 4 MiB，总包不超过配置限制。
- 最终包使用提供的 release 证书签名。
- 最终包 SHA-256 与 `SHA256SUMS` 一致。

Release 附件至少包含：

- `com.yongzhe.huoxiantuwei.vivominigame-v<version>.rpk`
- `SHA256SUMS`
- `build-metadata.json`
- `validation-report.json`
- `validation-report.txt`

`build-metadata.json` 记录平台、版本、`versionCode`、源提交、触发方式、Runner OS/架构、Cocos 版本、Node/Python 版本、构建时间和证书公开指纹。验证报告记录每项检查的结果和实测包体大小，方便上传 vivo 平台前复核。

## 测试策略

### 脚本测试

- 使用临时目录和最小 JSON fixture 测试版本计算、配置修补和幂等性。
- 覆盖“无 vivo 标签”“存在其他平台标签”“当前提交已有 vivo 标签”“标签格式非法”和并发前置条件。
- 构造最小嵌套 ZIP/RPK fixture，验证缺少分包、版本错误、包体超限、入口错误和损坏压缩包都能失败。
- 使用临时测试密钥验证签名脚本输入输出；测试密钥只能在测试运行时生成，不提交 release 私钥。
- Windows 和 macOS 路径处理逻辑通过单元测试覆盖，脚本不依赖 POSIX shell 路径语义。

### 工作流验证

- 对 YAML、Node.js、Python 和 shell/PowerShell 包装层执行静态检查。
- 在不创建 Release 的验证模式运行配置解析和 fixture 测试。
- 首次正式发布前分别手动运行 GitHub 托管 Windows 和 GitHub 托管 macOS 构建，确认产物校验和一致或解释可接受的打包差异。
- 自托管 Windows/macOS 是可选路径，各自至少完成一次环境检测和构建冒烟测试；其不可用不能阻塞默认托管 Runner 发布。

## 错误处理与恢复

- 环境检测、下载校验、Cocos 导出、修补、签名或验证任一失败时立即停止，并在 Actions 摘要中标明失败阶段。
- Cocos 安装包下载失败时允许有限次数重试，但不回退到未经确认的其他版本。
- Secrets 缺失时在签名前失败，并列出缺失的 Secret 名称，不输出值。
- 标签或 Release 创建发生竞争时重新拉取标签；若同版本已指向其他提交则失败并要求人工检查，不能强制移动标签。
- 同一提交已有标签时，重跑只恢复该 Release 和产物，不生成下一版本。
- Release 上传完成后再次通过 GitHub API 核对必需附件列表和大小。

## 平台扩展约定

后续新增其他平台时，每个平台分支复制的是发布接口和目录约定，不直接共享 vivo 的平台修补脚本。平台配置、标签前缀、版本基线、签名 Secrets、Runner 默认值和验证规则必须独立，例如：

- `oppo` 分支只创建 `oppo-v*`。
- `huawei` 分支只创建 `huawei-v*`。
- 各平台工作流只监听自己的分支。
- 各平台 Release 只附加该平台可上传的包。

可以共享无平台语义的通用测试或版本解析库，但平台分支必须能独立构建和发布，不能依赖另一个平台分支上的文件。

## 实施顺序

1. 为版本计算、配置修补和 RPK 验证建立失败测试。
2. 新增 `release.json` 和跨平台版本解析器。
3. 参数化迁移旧 vivo 修补、签名和验证能力。
4. 实现 Cocos 检测、缓存安装和跨平台构建入口。
5. 新增 `release-vivo.yml`，先只启用不会创建标签或 Release 的手动验证模式。
6. 在 GitHub 托管 Windows/macOS 上完成验证，并配置正式签名 Secrets。
7. 启用 `vivo` 分支 push 自动发布，由启用提交生成首个 `vivo-v1.0.11` Release。

## 完成标准

- `vivo` 分支可在没有自托管 Runner 的情况下生成正式签名 RPK 和 GitHub Release。
- 首个自动版本严格为 `1.0.11` / `12`，后续每个新提交只递增一次。
- 同一提交重跑不会产生额外版本。
- GitHub 托管 Windows 和 macOS 均能自动检测或安装 Cocos Creator 3.6.2 并完成构建。
- 自托管 Windows/macOS 在具备对应标签时可以手动选择，已有正确工具会被复用。
- Release 包通过全部结构、启动、大小、版本、签名和校验和验证。
- Git 历史、Actions 日志和 Release 中没有私钥或证书私密内容。
- `README.md` 的现有用户修改保持独立，不与设计文档或后续自动化提交意外混合。
