# Vibrary 用户操作手册

适用版本：Vibrary 0.1.2 MVP
适用对象：直接使用 Windows 桌面端和 Android 客户端的用户

Vibrary 是一个本地优先的多设备资料库。Windows 电脑负责保存资料库正本、构建索引、运行 Qdrant 检索和向手机分发文件；Android 手机负责选择本机文件或文件夹、维护上传队列、发起搜索、打开本地副本或按需下载缓存。Android 不运行 Qdrant，也不会直接访问 Qdrant。

## 目录

- [1. 下载内容](#1-下载内容)
- [2. 系统要求](#2-系统要求)
- [3. 重要概念](#3-重要概念)
- [4. 快速开始](#4-快速开始)
- [5. Windows 桌面端](#5-windows-桌面端)
- [6. Android 客户端](#6-android-客户端)
- [7. Windows 与 Android 配对](#7-windows-与-android-配对)
- [8. 搜索结果和传输策略](#8-搜索结果和传输策略)
- [9. 安全和隐私](#9-安全和隐私)
- [10. 常见问题](#10-常见问题)
- [11. 重新构建发布包](#11-重新构建发布包)
- [12. 当前 MVP 功能边界](#12-当前-mvp-功能边界)
- [13. 推荐使用流程](#13-推荐使用流程)

## 1. 下载内容

发布目录通常包含：

```text
release/
  desktop/
    Vibrary 0.1.2.exe
  android/
    Vibrary-debug.apk
  Vibrary_User_Manual_zh-CN.md
  manifest.json
  SHA256SUMS.txt
```

文件用途：

- `desktop/Vibrary 0.1.2.exe`：Windows 桌面程序，双击运行。
- `android/Vibrary-debug.apk`：Android 安装包。
- `Vibrary_User_Manual_zh-CN.md`：本操作手册。
- `manifest.json`：发布文件大小和 SHA-256 校验信息。
- `SHA256SUMS.txt`：可用于校验下载文件完整性。

阅读方式：

- 直接打开 `Vibrary_User_Manual_zh-CN.md` 即可阅读。
- 如果 Windows 记事本显示乱码，请用 VS Code、Typora、Obsidian、浏览器 Markdown 插件或其他支持 UTF-8 的 Markdown 阅读器打开。
- 本手册是纯文本 Markdown 文件，不依赖网络，也不需要启动 Vibrary 程序。

校验下载完整性：

1. 打开 PowerShell。
2. 进入 `release/` 目录。
3. 运行：

```powershell
Get-FileHash -Algorithm SHA256 ".\desktop\Vibrary 0.1.2.exe"
Get-FileHash -Algorithm SHA256 ".\android\Vibrary-debug.apk"
Get-FileHash -Algorithm SHA256 ".\Vibrary_User_Manual_zh-CN.md"
```

4. 把输出的哈希值和 `SHA256SUMS.txt` 中对应条目比较。如果一致，说明文件未损坏。

## 2. 系统要求

Windows 端：

- Windows 10 或 Windows 11，64 位。
- 首次运行需要允许本地程序启动后端和 Qdrant sidecar。
- 如果需要 Android 连接 Windows，手机和电脑需要在同一局域网内。
- 不需要用户手动安装 Docker、Qdrant 或 Python。

Android 端：

- Android 设备需要允许安装本地 APK。
- 文件选择依赖 Android 系统文件选择器和 Storage Access Framework 授权。
- 与 Windows 配对和上传时，需要手机能访问 Windows 后端地址。

## 3. 重要概念

资料库正本：

所有进入索引的文件最终都会复制到 Windows 资料库内部。这样即使手机原始文件被删除、Windows 外部文件夹被移动，已经进入资料库的文件仍可以被搜索和下载。

来源副本：

同一份资料可能同时存在于多个位置，例如 Android 原始文件、Windows 资料库正本、Android 下载缓存、Windows 缓存。搜索结果会先判断请求设备是否已有本地副本，尽量避免重复传输。

上传队列：

Android 选择文件或文件夹后，不会立刻把文件都塞进界面。它会把文件记录到本地上传队列，满足条件时由后台 WorkManager 上传到 Windows。

索引队列：

Windows 收到文件并复制到资料库后，会生成索引任务。索引任务负责解析文件、生成 embedding、写入 Qdrant。默认情况下后端会自动处理索引队列，桌面端仍保留 `处理索引` 按钮作为手动兜底。

缓存：

缓存只包含应用自己创建的临时文件、下载副本、缩略图或预览。清理缓存不会删除手机原始文件、Windows 外部源文件或 Windows 资料库正本。

## 4. 快速开始

单机 Windows 使用：

1. 打开 `release/desktop/`。
2. 双击 `Vibrary 0.1.2.exe`。
3. 等待顶部状态区显示 Qdrant 和 Backend 正在运行。
4. 在 `资料导入` 区域点击 `选择文件` 或 `选择文件夹`。
5. 导入完成后，等待自动索引；也可以在 `索引队列` 区域点击 `处理索引` 手动触发。
6. 在 `搜索` 区域输入关键词并点击 `搜索`。

Windows + Android 使用：

1. 在 Windows 上启动桌面端。
2. 默认局域网模式已开启，桌面端会在 `设备` 面板显示 6 位验证码。
3. 在 Android 上安装并打开 `Vibrary-debug.apk`。
4. Android 会自动发现附近可加入的 Vibrary 电脑端。
5. 在 Android 的 `配对` 页面选择发现到的电脑，输入 Windows 上显示的 6 位验证码。
6. 配对成功后，Android 会记住这台电脑；除非在手机或电脑端移除设备，下次启动不需要重新配对。
7. 在 Android 的 `资料` 页面选择文件或文件夹。
8. 文件进入 Android 上传队列后，等待上传到 Windows。
9. Windows 后端会自动处理索引队列；桌面端 `索引队列` 会显示处理状态。
10. 在 Android 或 Windows 上搜索资料。

## 5. Windows 桌面端

### 5.1 启动和停止

双击 `Vibrary 0.1.2.exe` 后，桌面端会自动启动两个隐藏 sidecar：

- Qdrant：本地向量数据库，只绑定 `127.0.0.1`。
- Backend：Vibrary 后端 API，负责资料库、上传、索引、搜索和缓存。

桌面顶部按钮：

- `刷新`：刷新服务状态、上传队列、索引队列和缓存统计。
- `启动服务`：启动 Qdrant 和 Backend sidecar。如果已经启动，不会重复启动。
- `停止服务`：停止由桌面端管理的 sidecar。

状态区：

- `Qdrant`：显示 Qdrant 是否运行。
- `Backend`：显示后端地址。
- `局域网 API`：显示手机可访问的局域网后端地址。默认开启，可在 `设置` 中关闭。
- `数据目录`：显示数据目录模式和位置。

### 5.2 数据保存位置

默认模式：

```text
%LOCALAPPDATA%/Vibrary/
```

如果你希望便携模式运行，在桌面 EXE 同级创建：

```text
portable.flag
```

存在 `portable.flag` 时，数据会保存到：

```text
<EXE 所在目录>/portable-data/
```

主要数据目录：

- `data/library/files/`：Windows 资料库正本。
- `data/qdrant/storage/`：Qdrant 索引数据。
- `data/cache/`：应用缓存。
- `data/models/`：FastEmbed 模型缓存。
- `config/`：配置和本地密钥。
- `data/app.sqlite`：Vibrary 元数据数据库。

不要手动删除 `data/library/files/` 或 `data/qdrant/storage/`，除非你明确要清空资料库或索引。

### 5.3 导入 Windows 文件

在 `资料导入` 区域：

1. 点击 `选择文件`。
2. 在系统文件选择器中选择一个或多个文件。
3. 确认后，桌面端会把文件路径提交给后端。
4. 后端会计算内容哈希，把文件复制到 Windows 资料库正本目录。
5. 如果重复导入相同内容，后端会识别为重复文件，避免重复索引。

导入结果指标：

- `已选文件`：本次选择的文件数量。
- `已导入`：实际进入资料库的新文件数量。
- `重复`：检测到的重复文件数量。

### 5.4 导入 Windows 文件夹

在 `资料导入` 区域：

1. 点击 `选择文件夹`。
2. 选择一个文件夹。
3. 后端会递归扫描文件夹。
4. 每个可导入文件都会先复制到 Windows 资料库正本，再进入索引队列。

注意事项：

- 大文件夹可能需要较长时间。
- 当前版本没有提供图形化排除规则界面。
- 文件夹导入不会把外部原文件当作唯一正本，索引前仍会复制到 Vibrary 资料库。

### 5.5 查看上传队列

`上传队列` 显示 Android 上传到 Windows 的任务。常见状态：

- `queued`：等待处理。
- `preflight`：上传前检查。
- `uploading`：分片上传中。
- `server_indexing`：服务端已接收，等待或正在索引。
- `completed`：完成。
- `failed`：失败，需要检查网络、权限或文件状态。

Windows 本地导入不会经过 Android 上传队列，但会进入索引队列。

### 5.6 处理索引队列

`索引队列` 显示等待、正在处理或已完成的索引任务。

操作方式：

1. 导入文件或 Android 上传完成后，点击 `刷新`。
2. 默认自动索引开启时，后端会在后台持续处理队列。
3. 如果想立即手动触发，可以点击 `处理索引`。
4. 每次 `处理索引` 默认处理一批任务。
5. 处理完成后底部消息栏会显示已索引数量和失败数量。
6. 如果仍有任务，继续观察自动处理状态，或再次点击 `处理索引`。

索引过程中会使用 FastEmbed 生成向量，并写入 Qdrant。首次使用模型时可能需要下载模型文件，因此第一次索引可能更慢。

### 5.7 搜索

在 `搜索` 区域：

1. 在输入框中输入关键词。
2. 点击 `搜索`。
3. 结果列表会显示文件标题、结果分数、后端推荐的传输方式和本地副本策略。

搜索覆盖：

- 文本检索。
- 图片语义检索的后端接口路径。
- 来源感知结果解析。

当前 Windows 桌面界面主要用于展示搜索结果和传输策略。Android 端提供结果 `打开` 操作。Windows 后端已经具备 `open_library` / `download_to_cache` 等解析策略；后续桌面 UI 可以继续补直接打开结果文件的按钮。

### 5.8 缓存管理

`缓存` 区域显示下载缓存大小，并提供：

- `清理下载缓存`：清理 Windows 端应用拥有的下载缓存。

清理缓存不会删除：

- Windows 资料库正本。
- Windows 外部源文件。
- Android 原始授权文件。
- Qdrant 索引数据。
- SQLite 元数据。
- FastEmbed 模型。

### 5.9 设备 / 模型 / 设置面板

当前版本中，这些面板用于设备管理、模型状态和基础设置：

- `设备`：显示手机加入用的 6 位验证码、当前局域网服务地址和已配对 Android 设备。可以刷新验证码，也可以移除已配对设备。
- `模型`：embedding 模型、版本和本地可用性的入口。
- `设置`：提供局域网连接开关、自动发现广播开关和自动索引开关。关闭局域网连接后，手机将无法发现或访问电脑端。

设置会保存到本机配置目录。切换局域网或自动索引设置后，桌面端会自动重启后台服务以应用新设置。

## 6. Android 客户端

Android 默认使用中文界面，底部有五个页面：

- `配对`
- `资料`
- `队列`
- `搜索`
- `缓存`

### 6.1 安装 Android APK

1. 把 `release/android/Vibrary-debug.apk` 传到 Android 设备。
2. 在 Android 上打开 APK。
3. 如果系统提示禁止安装未知来源应用，根据系统提示允许本次安装。
4. 安装完成后打开 Vibrary。

当前交付的是 debug APK，适合测试和内部使用。正式发布前建议配置 release 签名。

### 6.2 配对页面：配对 Windows

页面字段：

- `验证码`：输入 Windows 桌面端 `设备` 面板显示的 6 位数字验证码。
- `附近可加入设备`：Android 自动发现同一局域网内的 Vibrary 电脑端，点击对应设备的 `加入`。
- `手动连接`：自动发现失败时的备用方式，可以手动输入电脑地址，例如 `http://192.168.1.23:8765` 或 `192.168.1.23:8765`。

配对成功后：

- Android 会保存服务器地址。
- Android 会保存后端返回的设备 bearer token。
- 后续搜索、上传、下载都会自动使用这个 token。
- 除非在 Android 上点击 `移除此电脑`，或在 Windows `设备` 面板移除这台手机，否则下次启动不需要重新配对。

验证码默认有效期约 10 分钟。过期后在 Windows `设备` 面板点击 `刷新验证码`。

### 6.3 资料页面：选择手机文件或文件夹

按钮：

- `选择文件`：选择一个或多个文件。
- `选择文件夹`：选择一个文件夹。

选择文件后：

1. Android 会向系统申请持久读取权限。
2. 文件信息会写入 Android 本地数据库。
3. 文件会进入本地上传队列。
4. WorkManager 会在后台执行上传任务。

选择文件夹后：

1. Android 会向系统申请该文件夹的读取权限。
2. 当前版本会枚举文件夹下的文件。
3. 枚举到的文件会进入上传队列。

注意：选择文件或文件夹并不会把原文件复制到 Android 应用内部存储。原始文件仍在原位置，Vibrary 保存的是系统授权引用。

### 6.4 队列页面：查看上传状态

页面展示每个文件的真实上传流程状态、已上传字节数、总大小、百分比和错误信息：

- `queued` / `Waiting`：等待上传。
- `preflight` / `Preflight`：上传前检查，服务端判断是否已有该文件或已有部分分片。
- `uploading` / `Uploading`：正在分片上传。
- `server_indexing` / `Indexing`：服务端已接收，电脑端正在或即将自动索引。

上传机制：

- Android 会流式读取 SAF 文件。
- 上传前会计算 SHA-256。
- 大文件会按分片上传。
- 每个分片有独立 SHA-256 校验。
- 如果上传中断，下次可以跳过服务端已收到的分片。

### 6.5 搜索页面：搜索资料

操作方式：

1. 输入关键词。
2. 点击 `搜索`。
3. Android 会向当前配对的 Windows 后端发起搜索。
4. 搜索结果会显示标题和推荐动作。

如果没有配对服务器，搜索会失败并显示“尚未配对 Windows”或相关错误。

### 6.6 打开搜索结果

在搜索结果卡片上点击 `打开`。

Vibrary 会按以下顺序处理：

1. 如果 Android 本地仍有原始授权文件，优先打开本地原文件。
2. 如果本地原始授权失效，会通知服务端该引用已撤销。
3. 如果 Android 本地没有可用副本，会从 Windows 资料库下载到 Android 应用缓存。
4. 下载缓存后，会用 Android FileProvider 打开缓存副本。
5. 缓存副本会记录到 Android 本地数据库，后续同一文件可以优先使用缓存。

这种策略可以避免重复传输，也避免因为原文件被删除导致资料库搜索结果不可用。

### 6.7 缓存页面：清理 Android 缓存

按钮：

- `清理应用缓存`

该操作只清理 Android 应用自己创建的缓存条目。不会删除：

- 手机上的原始文件。
- 手机上通过 SAF 授权的原文件夹。
- Windows 资料库正本。
- Windows Qdrant 索引。

## 7. Windows 与 Android 配对

### 7.1 单机模式和局域网模式

默认启动桌面端时，局域网模式已开启。桌面端会让 Backend 监听局域网地址，供已配对手机访问。

默认规则：

- Backend 可以绑定到局域网地址。
- Qdrant 仍然只绑定 `127.0.0.1`，不会暴露给手机。
- Android 仍必须通过 6 位验证码配对并获取 bearer token。
- 可以在 Windows 桌面端 `设置` 面板关闭局域网连接；关闭后 Android 无法发现或访问电脑端。

如果 Windows 防火墙提示是否允许网络访问，需要允许同一局域网内访问 Vibrary 后端端口。

### 7.2 获取配对信息

在 Windows 桌面端打开 `设备` 面板：

1. 查看 `手机输入验证码` 下方的 6 位数字。
2. 确认面板中显示的地址是局域网地址，例如 `http://192.168.1.23:8765`。
3. 在 Android `配对` 页面等待发现这台电脑。
4. 输入 6 位验证码，点击对应电脑旁边的 `加入`。

如果 Android 没有自动发现电脑，可以在 Android `手动连接` 区域输入 Windows 面板显示的地址，再输入同一个验证码加入。

Android 当前版本允许对 localhost、`.local` 和局域网私有地址使用 HTTP 明文连接，以支持 `http://192.168.x.x:8765` 这类本地配对地址。应用会拒绝公网域名的 HTTP 地址；公网地址必须使用 HTTPS。

### 7.3 配对失败排查

配对失败时检查：

- Android 和 Windows 是否在同一 Wi-Fi 或同一局域网。
- Windows 桌面端是否仍在运行。
- Windows `设置` 面板中的局域网连接是否开启。
- Windows 防火墙是否允许访问。
- 6 位验证码是否过期。
- 自动发现失败时，Android 手动输入的地址是否包含端口，例如 `http://192.168.1.23:8765` 或 `192.168.1.23:8765`。
- 如果旧版 APK 显示 `CLEARTEXT communication ... not permitted by network security policy`，请安装更新后的 APK；新版已允许局域网 HTTP 配对。

## 8. 搜索结果和传输策略

搜索结果包含两类信息：

- 匹配信息：文件标题、分数、匹配方式、片段。
- 交付策略：当前设备应该打开本地副本、从 Windows 下载到缓存，还是使用 Windows 资料库正本。

常见策略：

- `local_reference`：请求设备已有可用本地副本，直接打开本地引用。
- `open_library`：Windows 本机有资料库正本，可从资料库打开。
- `download_to_cache`：请求设备没有可用副本，从 Windows 资料库下载到应用缓存。

Vibrary 的目标是：能本地打开就本地打开，只有需要时才传输文件。

## 9. 安全和隐私

本地优先：

- 文件资料库保存在你的 Windows 电脑本地。
- Qdrant 只在 Windows 本机监听。
- Android 不直接访问 Qdrant。
- Android 只访问 Windows 后端 API。

配对和访问控制：

- Android 需要通过一次性 6 位验证码配对。
- 配对成功后使用 bearer token 调用后端。
- 远程请求会校验 token 和 `device_id` 是否匹配。
- Windows 文件导入接口只允许本机调用，不允许 Android 远程提交任意 Windows 路径。

缓存清理：

- 清理缓存只删除应用内部缓存。
- 不删除授权源文件。
- 不删除 Windows 资料库正本。
- 不删除 Qdrant 正式索引数据。

## 10. 常见问题

### 10.1 双击桌面程序后没有搜索结果

先确认：

1. `服务状态` 中 Qdrant 和 Backend 是否运行。
2. 是否已经通过 `选择文件` 或 `选择文件夹` 导入资料。
3. `索引队列` 是否还有待处理任务，或是否显示 `索引中`。
4. `设置` 中是否开启自动处理索引队列；也可以点击 `处理索引` 手动触发。
5. 搜索关键词是否过短或与资料内容无关。

### 10.2 Qdrant 端口 6333 被占用怎么办

当前桌面端会优先使用 `6333`，如果该端口被占用，会自动选择后续可用的 localhost 端口，并把正确 URL 传给后端。用户通常不需要处理。

### 10.3 Android 无法连接 Windows

检查：

- Windows `设置` 中局域网连接是否开启。
- Android 是否发现了 Windows 电脑端，或手动输入的 URL 是否是 Windows 局域网 IP，而不是 `127.0.0.1`。
- Windows 防火墙是否允许访问。
- 手机和电脑是否在同一网络。
- 验证码是否过期。

### 10.4 Android 打开结果失败

可能原因：

- 原始 SAF 权限被撤销。
- 原始文件被移动或删除。
- Windows 后端不可达，无法下载缓存副本。
- Android 没有可用应用打开该文件类型。

Vibrary 会在本地引用失效时尝试从 Windows 下载缓存副本。如果仍失败，请先确认 Windows 桌面端正在运行且 Android 已配对。

### 10.5 清理缓存会不会删除原文件

不会。缓存清理只删除 Vibrary 自己创建的缓存副本或临时文件，不会删除手机原始文件、Windows 外部文件或 Windows 资料库正本。

### 10.6 可以直接删除 `portable-data` 或 `%LOCALAPPDATA%/Vibrary` 吗

可以，但这相当于清空 Vibrary 本地数据。删除后可能丢失：

- 资料库正本。
- SQLite 元数据。
- Qdrant 索引。
- 配对设备信息。
- 缓存和模型。

如果只是想释放缓存空间，请优先使用应用内缓存清理功能。

## 11. 重新构建发布包

如果你拿到的是源码仓库，可以在 Windows 上重新构建：

```powershell
.\scripts\build_release.ps1
```

脚本会执行：

1. 创建或复用后端构建环境。
2. 安装后端依赖和 PyInstaller。
3. 构建 `backend.exe`。
4. 下载官方 Windows x64 Qdrant。
5. 构建 Electron portable 桌面程序。
6. 构建 Android debug APK。
7. 生成 `release/manifest.json` 和 `release/SHA256SUMS.txt`。

如果只想重新构建后端 sidecar：

```powershell
.\scripts\build_release.ps1 -SkipDesktop -SkipAndroid
```

如果本机已经有 `qdrant.exe`，可以跳过下载：

```powershell
.\scripts\build_release.ps1 -SkipQdrantDownload
```

## 12. 当前 MVP 功能边界

已经可用：

- Windows 桌面程序无感启动 Backend 和 Qdrant。
- Windows 默认开启局域网连接，并可在设置中关闭。
- Windows UDP 局域网发现广播。
- Android 自动发现附近可加入的 Windows 端。
- Android 通过 6 位验证码加入，不需要手动输入 URL 和端口。
- 手机和电脑配对状态持久保存，可在任一端移除设备。
- Windows 文件和文件夹导入。
- Android 文件和文件夹选择。
- Android 本地上传队列。
- Android 队列页显示真实上传状态、字节进度和错误信息。
- 分片上传、断点续传和 SHA-256 校验。
- Windows 资料库正本。
- Windows 自动索引队列和手动处理索引按钮。
- FastEmbed + Qdrant 检索路径。
- 来源感知搜索结果解析。
- Android 搜索结果本地打开或下载缓存。
- Windows 和 Android 应用缓存清理策略。
- 6 位验证码配对和 bearer token 认证。

当前需要注意：

- Windows 桌面端搜索结果当前主要展示结果和交付策略，尚未提供完整的结果行直接打开按钮。
- Windows `模型` 面板仍是基础入口，模型高级管理界面后续完善。
- Android APK 是 debug 构建，正式对外发布前建议做 release 签名。
- 首次索引可能需要下载 embedding 模型，受网络环境影响。

## 13. 推荐使用流程

Windows 单机资料库：

1. 启动 Windows 桌面端。
2. 导入文件或文件夹。
3. 等待自动索引，必要时手动处理索引队列。
4. 搜索资料。
5. 定期清理下载缓存。

Android + Windows 资料库：

1. 启动 Windows 桌面端，确认 `设置` 中局域网连接已开启。
2. 在 Windows `设备` 面板查看 6 位验证码。
3. Android 自动发现电脑后输入验证码加入。
4. Android 选择文件或文件夹。
5. 等待上传完成。
6. 等待 Windows 自动索引，必要时点击 `处理索引`。
7. Android 搜索并打开结果。
8. Android 定期清理应用缓存。
