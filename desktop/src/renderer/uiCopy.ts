import { navigationPages } from "./dashboardModel";

export const desktopCopy = {
  brand: {
    subtitle: "本地优先资料中心"
  },
  pages: navigationPages,
  actions: {
    refresh: "刷新",
    start: "启动服务",
    stop: "停止服务",
    chooseFiles: "选择文件",
    chooseFolder: "选择文件夹",
    open: "打开",
    viewAll: "查看全部",
    process: "处理索引",
    search: "搜索",
    clearDownloads: "清理下载缓存",
    refreshLibrary: "刷新资料中心",
    allTypes: "全部类型",
    imagesOnly: "只看图片",
    textOnly: "只看文档",
    rebuildIndex: "重构全部索引",
    saveSettings: "保存设置",
    retry: "重试",
    viewTasks: "查看任务"
  },
  topbar: {
    title: "Vibrary",
    loading: "正在读取服务状态"
  },
  pageTitles: {
    overview: "总览",
    library: "资料中心",
    import: "导入资料",
    search: "搜索资料",
    devices: "设备连接",
    config: "配置中心",
    tasks: "任务"
  },
  pageDescriptions: {
    overview: "确认当前还缺哪些步骤，以及下一步应该做什么。",
    library: "统一管理从电脑和手机加入资料组的文件，图片直接显示缩略图。",
    import: "从 Windows 选择文件或文件夹，复制到资料库并进入 embedding 与 Qdrant 索引流程。",
    search: "在已完成索引的资料中检索，并查看匹配来源、分数和 Qdrant collection。",
    devices: "用验证码加入手机，管理资料组中的可信设备。",
    config: "集中配置局域网、embedding、检索、HNSW、索引、Qdrant、缓存和数据目录。",
    tasks: "查看上传、导入、索引队列和失败任务，定位不可用环节。"
  },
  status: {
    running: "运行中",
    stopped: "已停止",
    localOnly: "仅本机",
    dataRoot: "数据目录",
    lanApi: "局域网 API",
    qdrantDetail: "仅监听 127.0.0.1",
    lanDetail: "开启后供已配对手机访问",
    ready: "已完成",
    action: "需要处理",
    warning: "需要确认",
    error: "异常",
    optional: "可选"
  },
  overview: {
    title: "可用性检查",
    subtitle: "按顺序处理未完成步骤，系统会更透明地显示导入、embedding、索引和搜索链路。",
    nextAction: "下一步",
    libraryAssets: "资料总数",
    images: "图片",
    indexed: "已索引",
    trustedDevices: "可信手机",
    uploads: "上传任务",
    indexJobs: "索引任务",
    qdrantPoints: "Qdrant points"
  },
  libraryCenter: {
    title: "资料中心",
    searchPlaceholder: "按文件名或类型筛选资料",
    empty: "资料中心还没有文件。请先从电脑导入，或用手机上传。",
    source: "来源",
    indexStatus: "索引",
    libraryCopy: "资料库正本",
    noThumbnail: "文件"
  },
  library: {
    title: "资料导入",
    hint: "文件会先复制到 Windows 资料库，再进入 embedding 和 Qdrant 索引队列。",
    filesSelected: "已选文件",
    folderSelected: "已选文件夹",
    imported: "已导入",
    duplicates: "重复",
    indexQueued: "索引入队"
  },
  queues: {
    uploadTitle: "上传队列",
    indexTitle: "索引队列",
    noUploads: "暂无上传任务",
    noIndexJobs: "暂无索引任务"
  },
  search: {
    title: "搜索",
    placeholder: "搜索本地资料，例如：猴子、合同、截图、发票",
    empty: "还没有搜索结果",
    matchedBy: "匹配来源",
    score: "Qdrant 分数"
  },
  config: {
    title: "配置中心",
    connection: "连接",
    embedding: "Embedding 阶段",
    retrieval: "检索阶段",
    hnsw: "HNSW 参数",
    indexing: "索引控制",
    qdrant: "Qdrant",
    cache: "缓存",
    storage: "存储",
    lanEnabled: "默认开启局域网连接",
    discoveryEnabled: "自动发现广播",
    autoIndexEnabled: "自动处理索引队列",
    embeddingProvider: "Embedding 模型",
    retrievalMode: "检索方式",
    hnswMode: "HNSW 向量索引",
    fullScanMode: "遍历 / exact search",
    qdrantLocalOnly: "Qdrant 只绑定本机，不暴露到局域网。",
    rebuildHint: "重构会清空当前 active index 记录并重新入队，适合模型、检索配置或失败任务修复后使用。"
  },
  cards: {
    devices: "配对验证码、可信 Android 设备和最近在线状态",
    cache: "下载缓存",
    models: "Embedding 模型、版本和本地可用性",
    settings: "便携模式、数据目录、后端地址和局域网开关"
  },
  messages: {
    ready: "就绪",
    selectedFiles: (count: number) => `已导入 ${count} 个选中文件`,
    importCompleted: (imported: number, duplicates: number, queued: number) =>
      `导入完成：新增 ${imported} 项，重复 ${duplicates} 项，索引入队 ${queued} 项`,
    folderQueued: "文件夹已提交导入",
    requestFailed: (detail: string) => `操作失败：${detail}`,
    indexed: (indexed: number, failed: number) => `已索引 ${indexed} 项，失败 ${failed} 项`,
    results: (count: number) => `找到 ${count} 条结果`,
    cacheDeleted: (count: number) => `已删除 ${count} 个下载缓存文件`,
    settingsSaved: "设置已保存，后台服务已按新设置重启",
    libraryRefreshed: (count: number) => `资料中心已刷新：${count} 项`,
    deviceRemoved: (deviceId: string) => `已移除设备 ${deviceId}`,
    rebuildQueued: (count: number) => `已重新加入索引队列：${count} 项`
  },
  statusLabels: {
    queued: "等待中",
    checking: "检查中",
    hashing: "计算哈希",
    preflight: "上传预检",
    uploading: "上传中",
    paused: "已暂停",
    retry_wait: "等待重试",
    uploaded: "已上传",
    server_imported: "服务端已导入",
    server_indexing: "等待索引",
    server_indexed: "已索引",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
    indexing: "索引中",
    indexed: "已索引",
    present: "可用"
  },
  deliveryLabels: {
    local_reference: "本地副本",
    download_to_cache: "下载到缓存",
    stream_or_download: "流式或下载"
  },
  actionLabels: {
    open_local: "打开本机原文件",
    open_cache: "打开缓存",
    open_library: "打开资料库正本",
    download_to_cache: "下载到缓存",
    stream_or_download: "预览或下载",
    unavailable: "不可用"
  }
} as const;
