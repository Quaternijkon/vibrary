# Agent 开发计划书 v2：Android + Windows 本地资料库、上传队列、来源感知检索与 Qdrant 索引

> 目标：实现一个面向普通用户的本地离线资料搜索中心。Android 端负责选择文件/文件夹、维护上传队列、发起查询、展示结果和按需接收资料；Windows 端既是桌面客户端，也是局域网服务器，负责资料库持久化、索引构建、Qdrant 检索、跨设备传输决策和文件分发。核心向量数据库固定使用 Qdrant。

---

## 0. 本版相对于 v1 的关键重排

本版计划书把系统从“简单上传 + 检索”重排为以下核心模型：

1. **资料库资产 Asset**：按内容哈希识别，代表一个可搜索资料。
2. **资料来源 Source**：资料可能来自 Android 原始文件、Android 文件夹授权、Windows 本地文件、Windows 文件夹导入或应用内部资料库。
3. **资料副本 Replica**：同一个资产可同时存在于多个位置：手机原始位置、Windows 资料库、手机缓存、Windows 缓存、用户另存的位置。
4. **上传队列 Upload Queue**：手机选择文件/文件夹后不立即强制上传，而是进入队列，满足条件时上传。
5. **索引队列 Index Queue**：所有解析、embedding、Qdrant upsert 都在 Windows 端完成。
6. **来源感知检索 Source-aware Retrieval**：检索结果先返回资产 ID 与命中信息，再由系统判断请求设备是否已有本地副本；已有则不传输，未有则按需传输。
7. **缓存与授权源文件分离**：清理缓存只能删除应用内部缓存/临时预览/下载副本，不能删除用户授权给应用访问的原始文件。

---

## 1. 强制架构约束

1. Windows 是唯一索引构建和检索执行端。
2. Android 不运行 embedding，不运行 Qdrant，不直接访问 Qdrant。
3. Android 只访问 Windows 后端 API。
4. Qdrant 只绑定 `127.0.0.1`，由 Windows 后端访问。
5. Windows 后端绑定局域网地址只暴露应用 API，不暴露 Qdrant。
6. 最终用户不依赖 Docker。Docker 只允许作为开发环境。
7. Windows 端必须支持免安装运行。
8. 所有文件导入都先进入任务队列，不要在 UI 线程直接解析或建索引。
9. 所有资产、文件副本、上传任务、索引任务都必须有可恢复状态。
10. 清理缓存不能影响授权源文件，也不能误删 Windows 资料库正本。
11. 检索返回结果必须经过“副本解析器”决定是否需要传输文件。
12. 所有模型、collection、schema、索引配置必须带版本号。

---

## 2. 推荐技术栈

### 2.1 Windows 桌面端

- Electron + TypeScript
- React + Vite
- Electron main process 负责 sidecar 进程管理
- Electron renderer 作为 Windows 客户端 UI
- electron-builder 输出 Windows portable 版本

### 2.2 Windows 后端服务

- Python 3.11/3.12
- FastAPI + Uvicorn
- SQLite：资产、任务、设备、副本、缓存、索引状态
- Qdrant Client + FastEmbed
- PyInstaller 或 Nuitka 打包为 `backend.exe`

### 2.3 向量数据库

- Qdrant Server sidecar
- 由 Electron 主进程启动 `qdrant.exe`
- Qdrant HTTP API：`127.0.0.1:6333`
- Qdrant API key 必须启用
- Android 不得访问 Qdrant

### 2.4 Android 客户端

- Kotlin
- Jetpack Compose
- Room：本地上传队列、设备本地副本映射、缓存状态
- WorkManager：条件上传、断点续传、后台任务
- OkHttp / Retrofit：API 调用与分片上传
- Android Storage Access Framework：文件/文件夹选择与持久 URI 权限

---

## 3. 核心概念定义

### 3.1 Asset：资料库资产

Asset 是系统内部用于表示资料的主对象。一个 Asset 由内容哈希、文件类型、大小、版本等确定。

```text
Asset
  asset_id
  content_sha256
  original_name
  normalized_ext
  mime_type
  size_bytes
  created_at
  first_seen_device_id
  library_status
  index_status
```

Asset 不等同于“某个设备上的某个路径”。同一个资产可能同时有多个副本。

### 3.2 Source：资料来源

Source 表示资产最初或当前被应用知道的位置。

来源类型：

```text
android_file_grant        Android 单文件授权
android_tree_grant        Android 文件夹授权
windows_file_import       Windows 单文件导入
windows_folder_import     Windows 文件夹导入
library_file              Windows 资料库正本
cache_file                应用内部缓存副本
exported_file             用户另存到别处的副本
```

### 3.3 Replica：资料副本

Replica 表示某设备上是否拥有资产的一份可打开副本。

副本类型：

```text
source_original   用户原始文件，应用只被授权访问，不拥有
library_copy      Windows 资料库正本，应用拥有
cache_copy        应用内部缓存，应用可清理
export_copy       用户另存副本，通常不由应用管理
thumbnail_cache   缩略图缓存
preview_cache     预览缓存
```

### 3.4 Library Copy：Windows 资料库正本

所有进入资料库并可被稳定检索的文件，最终都应在 Windows 资料库中拥有一份 `library_copy`。

MVP 阶段采用强规则：

```text
只要要索引，就必须先复制到 Windows 资料库。
```

这样做的原因：

1. Android 上传后的原始文件可能被用户删除或撤销权限。
2. Windows 外部文件夹可能移动或删除。
3. Qdrant 索引必须能对应稳定可读取的文件实体。
4. 搜索结果需要能在任意设备上按需分发。

后续可增加“只索引外部文件、不复制到资料库”的高级模式，但 MVP 不实现。

### 3.5 Cache：应用内部缓存

缓存包括：

```text
Android 下载到应用内部的文件副本
Android 缩略图
Android 预览文件
Windows 缩略图
Windows 解析临时文件
临时上传分片
临时导出文件
```

清理缓存只允许删除这些内容。

不得删除：

```text
Android 原始授权文件
Windows 原始授权文件
Windows 资料库正本
用户另存到外部位置的文件
Qdrant 正式索引数据
SQLite 资产数据库
```

---

## 4. 进程拓扑

```text
Windows Electron App
  ├─ Electron Main Process
  │   ├─ 启动 qdrant.exe
  │   ├─ 启动 backend.exe
  │   ├─ 检查端口和健康状态
  │   ├─ 控制局域网分享开关
  │   └─ 向 renderer 暴露安全 IPC
  │
  ├─ Electron Renderer
  │   ├─ 资料库导入
  │   ├─ 搜索界面
  │   ├─ 上传/索引队列状态
  │   ├─ Android 设备配对
  │   ├─ 文件预览 / 打开 / 导出
  │   └─ 缓存管理
  │
  ├─ FastAPI Backend
  │   ├─ 设备配对
  │   ├─ 上传队列接收
  │   ├─ 资料库写入
  │   ├─ 索引队列调度
  │   ├─ embedding worker
  │   ├─ Qdrant 查询
  │   ├─ 副本解析器
  │   ├─ 文件传输服务
  │   └─ SQLite 元数据
  │
  └─ Qdrant Sidecar
      ├─ 127.0.0.1:6333
      ├─ collections
      └─ vector/payload indexes

Android App
  ├─ 文件/文件夹选择
  ├─ 本地上传队列
  ├─ 条件上传 worker
  ├─ 搜索请求
  ├─ 本地副本解析
  ├─ 按需下载到缓存
  └─ 清理缓存 / 另存为
```

---

## 5. 数据目录规范

### 5.1 Windows 默认目录

```text
%LOCALAPPDATA%/<ProductName>/
  config/
    app-config.json
    qdrant-config.yaml
    device-pairing.json
  data/
    app.sqlite
    library/
      files/
        ab/
          <sha256>.<ext>
      manifests/
      deleted/
    cache/
      thumbnails/
      previews/
      downloads/
      upload-temp/
      parse-temp/
    qdrant/
      storage/
      snapshots/
    models/
      fastembed/
    logs/
```

### 5.2 Portable 模式

如果 exe 同级存在：

```text
portable.flag
```

则使用：

```text
<app-dir>/portable-data/
```

### 5.3 Android 本地目录

```text
app internal storage/
  db/
    app-local.sqlite
  cache/
    thumbnails/
    previews/
    downloads/
  upload-temp/
```

Android 原始文件和原始文件夹通过 SAF 授权访问，不复制到 app internal storage，除非用户显式选择缓存或导入。

---

## 6. 文件生命周期

### 6.1 Android 文件/文件夹选择

用户在 Android 端选择：

```text
选择单个文件
选择多个文件
选择文件夹
```

客户端行为：

1. 通过 SAF 获取 URI。
2. 尝试申请 persistable URI permission。
3. 枚举文件夹中的文件。
4. 为每个文件创建本地 `upload_queue_item`。
5. 记录本地 source reference，不把 URI 明文上传给服务器。
6. 根据上传条件启动 WorkManager。

上传条件建议：

```text
已配对 Windows 服务器在线
同一局域网可达
用户允许当前网络上传
文件仍可访问
设备电量满足策略
队列未暂停
资料库空间未超限
```

### 6.2 Android 上传队列状态

```text
queued
checking
hashing
preflight
uploading
paused
retry_wait
uploaded
server_imported
server_indexing
server_indexed
failed
cancelled
```

### 6.3 Windows 导入文件/文件夹

Windows 端也可以选择文件或文件夹导入资料库。

MVP 规则：

1. 递归扫描文件夹。
2. 对每个文件计算 SHA-256。
3. 拷贝到 Windows 资料库 `library/files/<prefix>/<sha256>.<ext>`。
4. 创建或复用 Asset。
5. 创建 `library_copy` Replica。
6. 加入索引队列。

不在 MVP 阶段实现“只索引外部路径”。

### 6.4 资料库写入规则

所有进入资料库的文件都必须满足：

```text
有 content_sha256
有 stable library path
有 SQLite asset record
有 replica record
有 index job record
```

重复文件处理：

1. 如果 SHA-256 已存在，不重复复制文件。
2. 只增加来源记录和设备副本记录。
3. 若索引已完成，不重复建索引。
4. 若旧索引版本过期，创建 reindex job。

---

## 7. 传输与断点续传设计

### 7.1 上传预检

Android 上传前调用：

```http
POST /v1/uploads/preflight
```

请求字段：

```json
{
  "device_id": "...",
  "local_ref_id": "...",
  "file_name": "photo.jpg",
  "mime_type": "image/jpeg",
  "size_bytes": 123456,
  "last_modified_at": "2026-05-12T10:00:00Z",
  "quick_fingerprint": "size+mtime+name"
}
```

响应：

```json
{
  "upload_id": "...",
  "decision": "upload_required | already_exists | need_hash | rejected",
  "chunk_size": 8388608,
  "existing_asset_id": null
}
```

### 7.2 内容哈希策略

MVP 可以采用：

```text
上传时由 Android 流式计算 SHA-256
同时服务器端再次计算 SHA-256 校验
```

大文件优化后续实现：

```text
客户端先传 quick fingerprint
服务端命中疑似重复时要求客户端补传 hash
未命中时边上传边 hash
```

### 7.3 分片上传

大于阈值的文件使用分片上传：

```http
PUT /v1/uploads/{upload_id}/chunks/{chunk_index}
POST /v1/uploads/{upload_id}/complete
GET /v1/uploads/{upload_id}/status
```

必须支持：

```text
断点续传
失败重试
服务端 chunk 校验
上传任务恢复
重复 complete 幂等
```

### 7.4 传输任务与索引任务分离

上传完成不代表可搜索。

流程：

```text
upload completed
  ↓
server verifies checksum
  ↓
server writes library copy
  ↓
asset imported
  ↓
index job queued
  ↓
parse / embedding / qdrant upsert
  ↓
indexed
```

Android UI 要显示：

```text
已上传，等待索引
索引中
可搜索
索引失败
```

---

## 8. SQLite 数据模型

### 8.1 devices

```sql
CREATE TABLE devices (
  device_id TEXT PRIMARY KEY,
  device_name TEXT NOT NULL,
  device_type TEXT NOT NULL, -- windows | android
  pairing_public_key TEXT,
  paired_at TEXT,
  last_seen_at TEXT,
  is_trusted INTEGER NOT NULL DEFAULT 0
);
```

### 8.2 assets

```sql
CREATE TABLE assets (
  asset_id TEXT PRIMARY KEY,
  content_sha256 TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  normalized_ext TEXT,
  mime_type TEXT,
  size_bytes INTEGER NOT NULL,
  first_seen_device_id TEXT,
  first_seen_at TEXT NOT NULL,
  library_status TEXT NOT NULL, -- present | missing | quarantined | deleted
  index_status TEXT NOT NULL,   -- not_indexed | queued | indexing | indexed | failed | stale
  active_version_id TEXT
);
```

### 8.3 asset_versions

```sql
CREATE TABLE asset_versions (
  asset_version_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  mime_type TEXT,
  parser_version TEXT,
  embedding_profile_id TEXT,
  created_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);
```

### 8.4 library_files

```sql
CREATE TABLE library_files (
  library_file_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  asset_version_id TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  storage_class TEXT NOT NULL, -- library_copy
  created_at TEXT NOT NULL,
  verified_at TEXT,
  exists_flag INTEGER NOT NULL DEFAULT 1
);
```

### 8.5 device_asset_refs

记录某设备是否拥有该资产的某种本地副本。

```sql
CREATE TABLE device_asset_refs (
  ref_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  asset_version_id TEXT,
  ref_type TEXT NOT NULL,
  -- source_original | library_copy | cache_copy | export_copy | thumbnail_cache | preview_cache
  local_ref_id TEXT,
  display_name TEXT,
  size_bytes INTEGER,
  last_known_mtime TEXT,
  content_sha256 TEXT,
  permission_status TEXT, -- granted | revoked | unknown | not_applicable
  created_at TEXT NOT NULL,
  last_verified_at TEXT,
  is_available INTEGER NOT NULL DEFAULT 1
);
```

说明：

- Android 的 `local_ref_id` 是客户端本地数据库中的别名，不是原始 URI。
- Windows 的 `local_ref_id` 可以指向资料库相对路径或外部授权记录。
- 服务端不应要求 Android 上传原始 URI。

### 8.6 upload_jobs

```sql
CREATE TABLE upload_jobs (
  upload_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  local_ref_id TEXT,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER NOT NULL,
  quick_fingerprint TEXT,
  content_sha256 TEXT,
  status TEXT NOT NULL,
  bytes_received INTEGER NOT NULL DEFAULT 0,
  chunk_size INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  resulting_asset_id TEXT,
  error_message TEXT
);
```

### 8.7 upload_chunks

```sql
CREATE TABLE upload_chunks (
  upload_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  offset_bytes INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL,
  chunk_sha256 TEXT,
  status TEXT NOT NULL,
  received_at TEXT,
  PRIMARY KEY (upload_id, chunk_index)
);
```

### 8.8 index_jobs

```sql
CREATE TABLE index_jobs (
  index_job_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  asset_version_id TEXT NOT NULL,
  job_type TEXT NOT NULL, -- text | image | ocr | audio | video | code
  status TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  parser_version TEXT,
  embedding_profile_id TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0
);
```

### 8.9 qdrant_points

```sql
CREATE TABLE qdrant_points (
  point_id TEXT PRIMARY KEY,
  collection_name TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  asset_version_id TEXT NOT NULL,
  logical_unit_id TEXT,
  logical_unit_type TEXT, -- chunk | image | page | frame | audio_segment
  vector_name TEXT,
  embedding_profile_id TEXT NOT NULL,
  payload_hash TEXT,
  upserted_at TEXT NOT NULL
);
```

### 8.10 cache_entries

```sql
CREATE TABLE cache_entries (
  cache_entry_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  asset_id TEXT,
  cache_type TEXT NOT NULL, -- thumbnail | preview | downloaded_file | upload_temp | parse_temp
  relative_path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  last_accessed_at TEXT,
  can_delete INTEGER NOT NULL DEFAULT 1
);
```

---

## 9. Qdrant 设计

### 9.1 官方能力依据

本计划依赖 Qdrant 的以下能力：

- payload：向量点可附加结构化元数据，并可在搜索时用过滤条件约束。
- payload index：对高选择性字段建立索引，提升过滤效率。
- Query API：支持相似度检索、按 ID 检索、分组、排序和 hybrid search 等查询形态。
- snapshots：用于 collection 备份/恢复和迁移。

官方文档参考：

- https://qdrant.tech/documentation/concepts/payload/
- https://qdrant.tech/documentation/manage-data/indexing/
- https://qdrant.tech/documentation/search/
- https://qdrant.tech/documentation/tutorials-operations/create-snapshot/
- https://qdrant.tech/documentation/guides/security/

### 9.2 Collection 策略

MVP 使用分 collection，而不是把所有模态塞进一个 collection。

```text
text_chunks_v1
image_semantic_v1
ocr_text_v1
```

后续扩展：

```text
audio_segments_v1
video_frames_v1
code_chunks_v1
web_snapshots_v1
```

选择分 collection 的原因：

1. 不同模态模型维度不同。
2. 文本搜索、图片搜索、OCR 搜索的召回逻辑不同。
3. 重建某一类索引时不影响其他模态。
4. Qdrant payload filter 可通过 asset_id 聚合回同一个资产。

### 9.3 文本 collection

```text
collection: text_chunks_v1
vector:
  name: dense
  dimension: depends on embedding_profile
  distance: cosine
payload:
  asset_id
  asset_version_id
  content_sha256
  chunk_id
  chunk_index
  text_preview
  mime_type
  file_ext
  original_name
  source_device_id
  created_at
  imported_at
  parser_version
  embedding_profile_id
```

应建立 payload index：

```text
asset_id: keyword
asset_version_id: keyword
content_sha256: keyword
mime_type: keyword
file_ext: keyword
source_device_id: keyword
created_at: datetime
imported_at: datetime
```

### 9.4 图片 collection

```text
collection: image_semantic_v1
vector:
  name: image_text_shared
  dimension: 512 for CLIP ViT-B/32 profile
  distance: cosine
payload:
  asset_id
  asset_version_id
  content_sha256
  image_id
  width
  height
  mime_type
  original_name
  thumbnail_cache_key
  source_device_id
  imported_at
  embedding_profile_id
```

文本搜图片时：

```text
query text → CLIP/SigLIP text encoder → vector → image_semantic_v1
```

图片搜图片时：

```text
query image → CLIP/SigLIP image encoder → vector → image_semantic_v1
```

### 9.5 OCR collection

MVP 可先不做 OCR。若做 OCR，则 OCR 文本进入：

```text
ocr_text_v1
```

OCR 不应与图片语义 collection 混用。截图搜索应同时召回：

```text
图片语义相似
+
OCR 文本相似
+
文件名/路径关键词
```

---

## 10. Embedding Profile 设计

### 10.1 Profile 表

```text
embedding_profile_id
model_name
model_revision
modality
dimension
distance
runtime
local_model_path
license_note
is_default
created_at
```

### 10.2 MVP 默认模型

建议 MVP 使用轻量稳定方案：

```text
文本：sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
图片图文共空间：Qdrant/clip-ViT-B-32-vision + Qdrant/clip-ViT-B-32-text
```

### 10.3 后续高质量模型包

后续增加模型包：

```text
文本高质量：multilingual-e5-large 或 bge-m3
图文高质量：jina-clip-v2 或 Chinese-CLIP
```

### 10.4 模型切换规则

1. 不同 embedding profile 不能写入同一个 vector 字段。
2. 切换模型时创建新 collection 或新 vector name。
3. 保留旧索引，直到新索引完成。
4. UI 标记当前索引版本。
5. 允许后台重建索引。

---

## 11. 检索流程

### 11.1 查询入口

Windows 桌面端和 Android 端都调用同一后端：

```http
POST /v1/search
```

请求示例：

```json
{
  "device_id": "android-001",
  "query": "红色汽车",
  "search_types": ["text", "image", "ocr"],
  "limit": 20,
  "filters": {
    "mime_types": ["image/jpeg", "image/png"],
    "date_range": null
  }
}
```

### 11.2 检索步骤

```text
1. 识别 query 类型
2. 对文本资料生成文本 embedding
3. 对图片语义搜索生成 CLIP/SigLIP text embedding
4. 查询 Qdrant text_chunks_v1
5. 查询 Qdrant image_semantic_v1
6. 查询 OCR / SQLite FTS / 文件名索引
7. 融合结果
8. 按 asset_id 聚合
9. 对每个资产执行副本解析
10. 返回可打开/可预览/需下载的结果
```

### 11.3 搜索结果结构

```json
{
  "results": [
    {
      "asset_id": "asset_123",
      "asset_version_id": "ver_123",
      "title": "red_car.jpg",
      "mime_type": "image/jpeg",
      "score": 0.82,
      "matched_by": ["image_semantic"],
      "snippet": null,
      "thumbnail_url": "/v1/assets/asset_123/thumbnail",
      "availability": {
        "requesting_device": {
          "has_local_original": true,
          "has_cache_copy": false,
          "local_ref_id": "local_alias_789",
          "recommended_action": "open_local"
        },
        "server": {
          "has_library_copy": true,
          "can_stream": true
        }
      },
      "delivery": {
        "mode": "local_reference",
        "download_url": null,
        "stream_url": null
      }
    }
  ]
}
```

---

## 12. 副本解析器 / 传输决策器

这是本版计划的核心模块。

### 12.1 输入

```text
asset_id
asset_version_id
requesting_device_id
request_context
```

### 12.2 查询数据

```text
assets
library_files
device_asset_refs
cache_entries
```

### 12.3 决策优先级

对请求设备：

```text
1. 如果设备有 source_original 且 permission_status=granted：返回 open_local
2. 如果设备有 cache_copy 且文件存在：返回 open_cache
3. 如果请求设备就是 Windows 且 server 有 library_copy：返回 open_library
4. 如果 server 有 library_copy 且文件较小：返回 download_to_cache
5. 如果 server 有 library_copy 且文件较大：返回 stream_or_download
6. 如果 server 没有 library_copy：返回 unavailable
```

### 12.4 Android 本地解析

服务端不能直接验证 Android URI 是否仍有效。

因此：

1. 服务端根据 `device_asset_refs` 返回 `local_ref_id`。
2. Android 客户端用本地 Room 表把 `local_ref_id` 解析为 SAF URI。
3. Android 尝试打开。
4. 若权限失效，Android 调用：

```http
POST /v1/devices/{device_id}/refs/{ref_id}/permission-revoked
```

5. 后端更新 `permission_status=revoked`。
6. Android 再从服务器下载到缓存。

### 12.5 Windows 本地解析

Windows 端可以直接打开：

```text
library_copy
cache_copy
source_original if still exists
```

但打开外部路径前必须检查文件是否存在、hash 是否仍匹配。若不匹配，标记 source stale，但不删除用户文件。

---

## 13. 缓存与另存为

### 13.1 Android 缓存

Android 下载的文件默认写入 app internal storage：

```text
cache/downloads/<asset_id>/<filename>
```

清理缓存时可删除。

### 13.2 Windows 缓存

Windows 缓存包括：

```text
缩略图
预览文件
解析临时文件
上传临时分片
```

不包括：

```text
library/files
qdrant/storage
app.sqlite
models
```

模型缓存可提供单独清理入口，但不能归入普通缓存清理。

### 13.3 另存为

用户可以把应用内部文件保存到别处。

流程：

```text
选择搜索结果
点击另存为
选择目标位置
复制文件
完成后不再把该文件视为应用缓存
```

可选：询问用户是否把另存位置注册为新的 source reference。

MVP 不需要自动跟踪另存文件。

---

## 14. API 设计

### 14.1 设备配对

```http
GET  /v1/pairing/qr
POST /v1/pairing/claim
GET  /v1/devices
DELETE /v1/devices/{device_id}
```

### 14.2 上传

```http
POST /v1/uploads/preflight
PUT  /v1/uploads/{upload_id}/chunks/{chunk_index}
GET  /v1/uploads/{upload_id}/status
POST /v1/uploads/{upload_id}/complete
POST /v1/uploads/{upload_id}/cancel
```

### 14.3 Android source refs 同步

```http
POST /v1/devices/{device_id}/refs/sync
POST /v1/devices/{device_id}/refs/{ref_id}/permission-revoked
POST /v1/devices/{device_id}/refs/{ref_id}/verified
```

### 14.4 Windows 导入

```http
POST /v1/imports/windows/files
POST /v1/imports/windows/folder
GET  /v1/imports/{import_id}/status
POST /v1/imports/{import_id}/cancel
```

Electron renderer 可以通过后端 API 调用，也可以通过 Electron IPC 传递用户选择的路径给后端。

### 14.5 搜索与解析

```http
POST /v1/search
POST /v1/assets/{asset_id}/resolve
GET  /v1/assets/{asset_id}/thumbnail
GET  /v1/assets/{asset_id}/preview
GET  /v1/assets/{asset_id}/content
```

### 14.6 任务状态

```http
GET /v1/queues/uploads
GET /v1/queues/indexing
GET /v1/assets/{asset_id}/status
```

### 14.7 缓存

```http
GET    /v1/cache/summary
DELETE /v1/cache/thumbnails
DELETE /v1/cache/previews
DELETE /v1/cache/downloads
DELETE /v1/cache/temp
```

注意：这些接口只清除服务端缓存。Android 本地缓存由 Android 自己清理。

---

## 15. Android 客户端实现规格

### 15.1 页面

```text
服务器配对页
资料选择页
上传队列页
搜索页
结果详情页
下载/缓存管理页
设置页
```

### 15.2 Room 表

```text
local_sources
upload_queue
local_asset_refs
cache_entries
paired_servers
```

### 15.3 文件夹选择

使用 Android Storage Access Framework：

```kotlin
ACTION_OPEN_DOCUMENT
ACTION_OPEN_DOCUMENT_TREE
```

要求：

1. 记录 URI permission。
2. 文件夹递归枚举要可取消。
3. 大文件不读入内存。
4. hash 和上传都使用流式处理。
5. 上传失败后保留队列状态。

### 15.4 上传条件 UI

用户可设置：

```text
仅 Wi-Fi 上传
仅连接指定 Windows 服务器时上传
允许移动网络上传
低电量暂停
手动暂停/恢复队列
最大并发上传数
```

MVP 默认：

```text
仅同局域网服务器在线时上传
最大并发 2
失败指数退避
```

### 15.5 搜索结果打开逻辑

Android 收到搜索结果后：

```text
如果 delivery.mode=local_reference：用 local_ref_id 打开 SAF URI
如果本地打开失败：上报权限失效并请求下载
如果 delivery.mode=download_to_cache：下载到 app cache 后打开
如果 delivery.mode=stream_or_download：询问预览/下载
```

---

## 16. Windows 客户端实现规格

### 16.1 页面

```text
首页 / 服务状态
资料库
导入文件/文件夹
上传队列
索引队列
搜索
设备管理
缓存管理
模型管理
设置
```

### 16.2 导入文件/文件夹

UI 必须显示：

```text
扫描数量
已导入数量
重复数量
失败数量
待索引数量
索引完成数量
```

### 16.3 搜索结果打开逻辑

Windows 端优先：

```text
library_copy → 打开资料库文件
cache_copy → 打开缓存文件
source_original → 校验存在后打开
```

### 16.4 服务状态

必须显示：

```text
Qdrant 状态
后端状态
局域网服务开关
监听地址
已配对设备
当前索引任务
模型是否可用
资料库占用空间
缓存占用空间
```

---

## 17. 安全策略

1. Qdrant 只绑定 `127.0.0.1`。
2. Qdrant 设置 API key。
3. FastAPI 局域网接口需要配对 token。
4. Android 通过 QR 配对获得服务器地址和 token。
5. 配对 token 可撤销。
6. 上传接口必须限制文件大小、文件类型、并发数。
7. 所有文件路径只在服务端内部解析，不接受客户端传入任意 Windows 路径。
8. 下载接口必须验证设备权限。
9. 缩略图和预览接口同样需要授权。
10. 局域网 API 默认关闭，由用户显式开启。

---

## 18. 索引构建流程

### 18.1 文本文件

```text
read file
normalize text
split chunks
embed chunks
upsert text_chunks_v1
write qdrant_points
mark indexed
```

### 18.2 PDF

MVP：

```text
extract text only
split chunks
embed
```

后续：

```text
page image render
OCR
layout-aware chunking
```

### 18.3 图片

```text
load image
normalize
create thumbnail
image encoder embedding
upsert image_semantic_v1
```

### 18.4 截图

MVP 按普通图片处理。

后续增加 OCR 后：

```text
image semantic embedding
+
OCR text embedding
+
OCR keyword index
```

---

## 19. 任务调度规则

### 19.1 上传任务

Android 本地调度，Windows 后端只接收和记录服务端上传状态。

### 19.2 索引任务

Windows 后端调度。

优先级：

```text
用户刚上传的小文件
用户当前搜索相关的未索引文件
图片缩略图
文本解析
大文件后台索引
```

### 19.3 失败恢复

所有任务失败必须记录：

```text
错误类型
错误消息
重试次数
最后失败时间
是否可自动重试
```

---

## 20. MVP 范围

### 必须实现

```text
Windows Electron 启动
Qdrant sidecar 启动
FastAPI sidecar 启动
SQLite schema
Windows 文件/文件夹导入
Android 配对
Android 文件/文件夹选择
Android 上传队列
分片上传或至少大文件可恢复上传
Windows 资料库 copy
文本索引
图片语义索引
搜索
来源感知结果返回
Android 本地有副本则不下载
Android 无副本则从 Windows 下载到缓存
缓存清理不影响原文件
```

### 暂不实现

```text
OCR
音频索引
视频索引
代码语义索引
网页快照
云端同步
多 Windows 服务器同步
多人权限系统
只索引外部路径不复制
复杂 reranker
```

---

## 21. Agent 实现顺序

### Stage 1：基础服务骨架

1. Electron app skeleton
2. backend FastAPI skeleton
3. qdrant sidecar start/stop
4. SQLite 初始化
5. health check
6. config path / portable mode

### Stage 2：资产与资料库

1. assets schema
2. library_files schema
3. Windows 文件导入
4. SHA-256 去重
5. library copy 写入
6. 基础资料库页面

### Stage 3：Qdrant 与索引

1. 创建 collections
2. embedding profile 表
3. 文本解析
4. 图片 embedding
5. Qdrant upsert
6. index_jobs 页面

### Stage 4：搜索

1. `/v1/search`
2. 文本检索
3. 图片语义检索
4. 结果聚合
5. 副本解析器
6. Windows 搜索 UI

### Stage 5：Android 配对与上传队列

1. QR 配对
2. Android Room schema
3. SAF 文件/文件夹选择
4. upload_queue
5. preflight
6. 上传
7. 服务端 complete
8. 自动进入索引队列

### Stage 6：来源感知打开与传输

1. Android local_ref_id 解析
2. Android 本地打开
3. 打开失败上报权限失效
4. 下载到缓存
5. Windows/Android 缓存清理
6. 另存为

### Stage 7：稳健性

1. 断点续传
2. 任务恢复
3. 索引失败重试
4. Qdrant snapshot
5. 导入/上传/索引日志
6. crash recovery

---

## 22. 测试集与验收标准

### 22.1 准备测试集

```text
10 个 txt/md
5 个 PDF
30 张图片
10 张截图
5 个重复文件
3 个大文件
1 个 Android 文件夹
1 个 Windows 文件夹
20 条中文查询
20 条英文查询
```

### 22.2 必测场景

1. Android 选择文件夹后进入上传队列。
2. 暂停上传后恢复，任务继续。
3. 上传中断后重连，任务可恢复。
4. 重复文件不重复写入资料库。
5. Windows 导入重复文件不重复索引。
6. 搜索命中 Android 原始文件时，Android 不下载。
7. Android 原始 URI 权限失效后，搜索结果可改为从服务器下载。
8. 搜索命中 Windows 资料库文件时，Windows 直接打开 library copy。
9. Android 清理缓存后，原始授权文件不受影响。
10. Windows 清理缓存后，library/files 不受影响。
11. 删除 Android 原始文件后，不影响 Windows 资料库正本。
12. Qdrant 重启后搜索仍可用。
13. 后端重启后上传/索引队列状态可恢复。
14. 资料库 snapshot 可创建。

### 22.3 验收指标

MVP 不追求最高召回质量，优先保证：

```text
文件生命周期正确
不会误删原文件
重复文件处理正确
设备副本判断正确
上传队列可恢复
索引队列可恢复
搜索结果可打开
```

---

## 23. 给 Agent 的强制提示词

请把以下内容与本计划书一起交给 coding agent：

```text
请严格按 qdrant_android_windows_agent_plan_v2.md 实现。系统不是简单 RAG demo，而是多设备本地资料库。重点实现 Asset、Replica、Upload Queue、Index Queue、Source-aware Retrieval、Cache Policy。Android 端选择文件或文件夹后只进入上传队列；满足条件时上传到 Windows。Windows 端复制文件到资料库后才索引。所有 embedding、Qdrant upsert、检索都在 Windows 端执行。搜索结果必须先判断请求设备是否已有本地副本；已有则返回 local reference，不要重复传输；没有则从 Windows 资料库按需下载或流式传输。清理缓存只能删除应用内部缓存，不能删除授权给应用访问的原始文件，也不能删除 Windows 资料库正本。不要让最终用户依赖 Docker，不要让 Android 直接访问 Qdrant。
```

---

## 24. 你在交给 Agent 前需要确认的事项

1. MVP 是否强制采用“所有被索引文件都复制到 Windows 资料库”。建议确认：是。
2. Android 上传条件默认是否为“仅同局域网服务器在线时上传”。建议确认：是。
3. Android 是否允许移动网络上传。建议确认：MVP 否。
4. Android 文件夹导入是否递归。建议确认：是，但提供排除规则。
5. Windows 导入外部文件夹是否复制到资料库。建议确认：MVP 是。
6. 清理缓存是否包括模型缓存。建议确认：普通清理不包括模型缓存，另设模型清理。
7. 是否第一版做 OCR。建议确认：否，作为 Phase 2。
8. 是否第一版做音视频。建议确认：否，作为 Phase 3。
9. 是否支持多台 Windows 服务器。建议确认：MVP 只支持一个当前配对服务器，可保存多个历史服务器。
10. 是否支持用户权限/多用户。建议确认：MVP 不做。

---

## 25. 最终架构摘要

```text
Android 选择文件/文件夹
  ↓
Android 本地上传队列
  ↓ 满足条件
上传到 Windows FastAPI
  ↓
Windows 资料库保存 library_copy
  ↓
Windows 索引队列
  ↓
Embedding + Qdrant upsert
  ↓
手机或电脑发起搜索
  ↓
Windows Qdrant 检索
  ↓
按 asset_id 聚合结果
  ↓
副本解析器判断请求设备是否已有资料
  ├─ 已有：返回本地引用，不传输
  └─ 没有：从 Windows 资料库传输到请求设备缓存
```

