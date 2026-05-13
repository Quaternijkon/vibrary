# Vibrary 用户操作手册

适用版本：Vibrary 0.1.0 MVP
适用对象：直接使用 Windows 桌面端和 Android 客户端的用户

Vibrary 是一个本地优先的多设备资料库。Windows 电脑负责保存资料库正本、构建索引、运行 Qdrant 检索和向手机分发文件；Android 手机负责选择本机文件或文件夹、维护上传队列、发起搜索、打开本地副本或按需下载缓存。Android 不运行 Qdrant，也不会直接访问 Qdrant。

## 1. 下载内容

发布目录通常包含：

```text
release/
  desktop/
    Vibrary 0.1.0.exe
  android/
    Vibrary-debug.apk
  Vibrary_User_Manual_zh-CN.md
  manifest.json
  SHA256SUMS.txt
```

文件用途：

- `desktop/Vibrary 0.1.0.exe`：Windows 桌面程序，双击运行。
- `android/Vibrary-debug.apk`：Android 安装包。
- `Vibrary_User_Manual_zh-CN.md`：本操作手册。
- `manifest.json`：发布文件大小和 SHA-256 校验信息。
- `SHA256SUMS.txt`：可用于校验下载文件完整性。

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

Windows 收到文件并复制到资料库后，会生成索引任务。索引任务负责解析文件、生成 embedding、写入 Qdrant。当前桌面端提供手动 `Process` 按钮处理索引队列。

缓存：

缓存只包含应用自己创建的临时文件、下载副本、缩略图或预览。清理缓存不会删除手机原始文件、Windows 外部源文件或 Windows 资料库正本。

## 4. 快速开始

单机 Windows 使用：

1. 打开 `release/desktop/`。
2. 双击 `Vibrary 0.1.0.exe`。
3. 等待顶部状态区显示 Qdrant 和 Backend 正在运行。
4. 在 `Library Import` 区域点击 `Choose Files` 或 `Choose Folder`。
5. 导入完成后，到 `Index Queue` 区域点击 `Process`。
6. 在 `Search` 区域输入关键词并点击 `Search`。

Windows + Android 使用：

1. 在 Windows 上启动桌面端。
2. 如果需要手机连接，建议用局域网模式启动桌面端，见“8. Android 配对 Windows”。
3. 在 Android 上安装并打开 `Vibrary-debug.apk`。
4. 在 Android 的 `Pair` 页面输入 Windows 后端地址和配对 token。
5. 在 Android 的 `Select` 页面选择文件或文件夹。
6. 文件进入 Android 上传队列后，等待上传到 Windows。
7. 在 Windows 桌面端处理索引队列。
8. 在 Android 或 Windows 上搜索资料。

## 5. Windows 桌面端

### 5.1 启动和停止

双击 `Vibrary 0.1.0.exe` 后，桌面端会自动启动两个隐藏 sidecar：

- Qdrant：本地向量数据库，只绑定 `127.0.0.1`。
- Backend：Vibrary 后端 API，负责资料库、上传、索引、搜索和缓存。

桌面顶部按钮：

- `Refresh`：刷新服务状态、上传队列、索引队列和缓存统计。
- `Start`：启动 Qdrant 和 Backend sidecar。如果已经启动，不会重复启动。
- `Stop`：停止由桌面端管理的 sidecar。

状态区：

- `Qdrant`：显示 Qdrant 是否运行。
- `Backend`：显示后端地址。
- `LAN API`：提示后端可在显式开启后用于局域网访问。
- `Data Root`：显示数据目录模式和位置。

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

在 `Library Import` 区域：

1. 点击 `Choose Files`。
2. 在系统文件选择器中选择一个或多个文件。
3. 确认后，桌面端会把文件路径提交给后端。
4. 后端会计算内容哈希，把文件复制到 Windows 资料库正本目录。
5. 如果重复导入相同内容，后端会识别为重复文件，避免重复索引。

导入结果指标：

- `Files selected`：本次选择的文件数量。
- `Imported`：实际进入资料库的新文件数量。
- `Duplicates`：检测到的重复文件数量。

### 5.4 导入 Windows 文件夹

在 `Library Import` 区域：

1. 点击 `Choose Folder`。
2. 选择一个文件夹。
3. 后端会递归扫描文件夹。
4. 每个可导入文件都会先复制到 Windows 资料库正本，再进入索引队列。

注意事项：

- 大文件夹可能需要较长时间。
- 当前版本没有提供图形化排除规则界面。
- 文件夹导入不会把外部原文件当作唯一正本，索引前仍会复制到 Vibrary 资料库。

### 5.5 查看上传队列

`Upload Queue` 显示 Android 上传到 Windows 的任务。常见状态：

- `queued`：等待处理。
- `preflight`：上传前检查。
- `uploading`：分片上传中。
- `server_indexing`：服务端已接收，等待或正在索引。
- `completed`：完成。
- `failed`：失败，需要检查网络、权限或文件状态。

Windows 本地导入不会经过 Android 上传队列，但会进入索引队列。

### 5.6 处理索引队列

`Index Queue` 显示等待索引的文件。

操作方式：

1. 导入文件或 Android 上传完成后，点击 `Refresh`。
2. 如果 `Index Queue` 中出现任务，点击 `Process`。
3. 每次 `Process` 默认处理一批任务。
4. 处理完成后底部消息栏会显示 `Indexed X, failed Y`。
5. 如果仍有任务，继续点击 `Process`，直到队列清空或失败项需要排查。

索引过程中会使用 FastEmbed 生成向量，并写入 Qdrant。首次使用模型时可能需要下载模型文件，因此第一次索引可能更慢。

### 5.7 搜索

在 `Search` 区域：

1. 在输入框中输入关键词。
2. 点击 `Search`。
3. 结果列表会显示文件标题、结果分数、后端推荐的传输方式和本地副本策略。

搜索覆盖：

- 文本检索。
- 图片语义检索的后端接口路径。
- 来源感知结果解析。

当前 Windows 桌面界面主要用于展示搜索结果和传输策略。Android 端提供结果 `Open` 操作。Windows 后端已经具备 `open_library` / `download_to_cache` 等解析策略；后续桌面 UI 可以继续补直接打开结果文件的按钮。

### 5.8 缓存管理

`Cache` 区域显示下载缓存大小，并提供：

- `Clear Downloads`：清理 Windows 端应用拥有的下载缓存。

清理缓存不会删除：

- Windows 资料库正本。
- Windows 外部源文件。
- Android 原始授权文件。
- Qdrant 索引数据。
- SQLite 元数据。
- FastEmbed 模型。

### 5.9 Devices / Models / Settings 面板

当前版本中，这些面板主要作为功能入口和状态说明：

- `Devices`：设备配对、可信 Android 客户端和最近在线状态的入口。
- `Models`：embedding 模型、版本和本地可用性的入口。
- `Settings`：便携模式、数据目录、后端 URL 和 LAN 分享设置的入口。

MVP 中部分设置已经由配置和环境变量支持，但图形化设置项仍处于基础阶段。

## 6. Android 客户端

Android 底部有五个页面：

- `Pair`
- `Select`
- `Queue`
- `Search`
- `Cache`

### 6.1 安装 Android APK

1. 把 `release/android/Vibrary-debug.apk` 传到 Android 设备。
2. 在 Android 上打开 APK。
3. 如果系统提示禁止安装未知来源应用，根据系统提示允许本次安装。
4. 安装完成后打开 Vibrary。

当前交付的是 debug APK，适合测试和内部使用。正式发布前建议配置 release 签名。

### 6.2 Pair 页面：配对 Windows

页面字段：

- `Server URL`：Windows 后端地址。
- `Pairing token`：Windows 后端生成的一次性配对 token。
- `Pair`：提交配对。

配对成功后：

- Android 会保存服务器地址。
- Android 会保存后端返回的设备 bearer token。
- 后续搜索、上传、下载都会自动使用这个 token。

配对 token 默认有效期约 10 分钟。过期后需要重新生成。

### 6.3 Select 页面：选择手机文件或文件夹

按钮：

- `Files`：选择一个或多个文件。
- `Folder`：选择一个文件夹。

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

### 6.4 Queue 页面：查看上传状态

页面展示上传流程状态：

- `queued` / `Waiting`：等待上传。
- `preflight` / `Preflight`：上传前检查，服务端判断是否已有该文件或已有部分分片。
- `uploading` / `Uploading`：正在分片上传。
- `server_indexing` / `Indexing`：服务端已接收并等待索引。

上传机制：

- Android 会流式读取 SAF 文件。
- 上传前会计算 SHA-256。
- 大文件会按分片上传。
- 每个分片有独立 SHA-256 校验。
- 如果上传中断，下次可以跳过服务端已收到的分片。

### 6.5 Search 页面：搜索资料

操作方式：

1. 输入关键词。
2. 点击 `Search`。
3. Android 会向当前配对的 Windows 后端发起搜索。
4. 搜索结果会显示标题和推荐动作。

如果没有配对服务器，搜索会失败并显示 `No paired server` 或相关错误。

### 6.6 打开搜索结果

在搜索结果卡片上点击 `Open`。

Vibrary 会按以下顺序处理：

1. 如果 Android 本地仍有原始授权文件，优先打开本地原文件。
2. 如果本地原始授权失效，会通知服务端该引用已撤销。
3. 如果 Android 本地没有可用副本，会从 Windows 资料库下载到 Android 应用缓存。
4. 下载缓存后，会用 Android FileProvider 打开缓存副本。
5. 缓存副本会记录到 Android 本地数据库，后续同一文件可以优先使用缓存。

这种策略可以避免重复传输，也避免因为原文件被删除导致资料库搜索结果不可用。

### 6.7 Cache 页面：清理 Android 缓存

按钮：

- `Clean app cache`

该操作只清理 Android 应用自己创建的缓存条目。不会删除：

- 手机上的原始文件。
- 手机上通过 SAF 授权的原文件夹。
- Windows 资料库正本。
- Windows Qdrant 索引。

## 7. Windows 与 Android 配对

### 7.1 单机模式和局域网模式

默认启动桌面端时，后端只监听 `127.0.0.1`。这适合 Windows 单机使用，但 Android 手机无法访问。

如果需要 Android 连接 Windows，需要用局域网模式启动桌面端。打开 PowerShell，进入桌面 EXE 所在目录，然后运行：

```powershell
$env:VIBRARY_ENABLE_LAN='1'
& ".\Vibrary 0.1.0.exe"
```

局域网模式下：

- Backend 可以绑定到局域网地址。
- Qdrant 仍然只绑定 `127.0.0.1`，不会暴露给手机。
- Android 仍必须通过配对 token 获取 bearer token。

如果 Windows 防火墙提示是否允许网络访问，需要允许同一局域网内访问 Vibrary 后端端口。

### 7.2 获取配对信息

在 Windows 桌面端启动后，在 Windows 本机浏览器打开：

```text
http://127.0.0.1:8765/v1/pairing/qr
```

返回内容包含：

```json
{
  "server_url": "http://<Windows 局域网 IP>:8765",
  "pairing_token": "<一次性 token>"
}
```

把 `server_url` 填入 Android `Pair` 页面的 `Server URL`。
把 `pairing_token` 填入 Android `Pair` 页面的 `Pairing token`。
然后点击 Android 上的 `Pair`。

如果 `server_url` 返回的是 `http://127.0.0.1:8765`，说明桌面端不是局域网模式启动。请关闭桌面端，用 `VIBRARY_ENABLE_LAN=1` 重新启动。

### 7.3 配对失败排查

配对失败时检查：

- Android 和 Windows 是否在同一 Wi-Fi 或同一局域网。
- Windows 桌面端是否仍在运行。
- Windows 是否以局域网模式启动。
- Windows 防火墙是否允许访问。
- `pairing_token` 是否过期。
- Android 输入的 `Server URL` 是否包含 `http://` 和端口，例如 `http://192.168.1.23:8765`。

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

- Android 需要通过一次性 pairing token 配对。
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

1. `Service Status` 中 Qdrant 和 Backend 是否运行。
2. 是否已经通过 `Choose Files` 或 `Choose Folder` 导入资料。
3. `Index Queue` 是否还有待处理任务。
4. 是否点击过 `Process`。
5. 搜索关键词是否过短或与资料内容无关。

### 10.2 Qdrant 端口 6333 被占用怎么办

当前桌面端会优先使用 `6333`，如果该端口被占用，会自动选择后续可用的 localhost 端口，并把正确 URL 传给后端。用户通常不需要处理。

### 10.3 Android 无法连接 Windows

检查：

- Windows 是否用局域网模式启动。
- Android 输入的 URL 是否是 Windows 局域网 IP，而不是 `127.0.0.1`。
- Windows 防火墙是否允许访问。
- 手机和电脑是否在同一网络。
- 配对 token 是否过期。

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
- Windows 文件和文件夹导入。
- Android 文件和文件夹选择。
- Android 本地上传队列。
- 分片上传、断点续传和 SHA-256 校验。
- Windows 资料库正本。
- Windows 索引队列。
- FastEmbed + Qdrant 检索路径。
- 来源感知搜索结果解析。
- Android 搜索结果本地打开或下载缓存。
- Windows 和 Android 应用缓存清理策略。
- 配对 token 和 bearer token 认证。

当前需要注意：

- Windows 桌面端搜索结果当前主要展示结果和交付策略，尚未提供完整的结果行直接打开按钮。
- Windows `Devices`、`Models`、`Settings` 面板是基础入口，部分高级设置仍通过环境变量或后端接口完成。
- Android APK 是 debug 构建，正式对外发布前建议做 release 签名。
- 首次索引可能需要下载 embedding 模型，受网络环境影响。

## 13. 推荐使用流程

Windows 单机资料库：

1. 启动 Windows 桌面端。
2. 导入文件或文件夹。
3. 处理索引队列。
4. 搜索资料。
5. 定期清理下载缓存。

Android + Windows 资料库：

1. 用局域网模式启动 Windows 桌面端。
2. 在 Windows 本机获取 pairing token。
3. Android 配对 Windows。
4. Android 选择文件或文件夹。
5. 等待上传完成。
6. Windows 处理索引队列。
7. Android 搜索并打开结果。
8. Android 定期清理应用缓存。
