export const desktopCopy = {
  brand: {
    subtitle: "本地资料组"
  },
  pages: [
    { id: "home", label: "首页" },
    { id: "library", label: "资料中心" },
    { id: "import", label: "导入" },
    { id: "search", label: "搜索" },
    { id: "transfer", label: "传输" },
    { id: "devices", label: "设备" },
    { id: "settings", label: "设置" }
  ],
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
    textOnly: "只看文档"
  },
  topbar: {
    title: "Vibrary 资料中心",
    loading: "正在读取服务状态"
  },
  pageTitles: {
    home: "首页",
    library: "资料中心",
    import: "导入资料",
    search: "搜索资料",
    transfer: "传输与索引",
    devices: "设备连接",
    settings: "设置"
  },
  pageDescriptions: {
    home: "查看本机服务、资料总量、索引和局域网状态。",
    library: "统一管理从电脑和手机加入资料组的文件。",
    import: "从 Windows 选择文件或文件夹，复制到资料库并进入索引队列。",
    search: "在已经完成索引的资料中检索，并按设备副本状态打开或下载。",
    transfer: "查看手机上传、Windows 导入和后端索引处理进度。",
    devices: "用验证码加入手机，加入后默认成为资料组可信设备。",
    settings: "调整局域网、发现广播、自动索引和缓存策略。"
  },
  status: {
    running: "运行中",
    stopped: "已停止",
    localOnly: "本机",
    dataRoot: "数据目录",
    lanApi: "局域网 API",
    qdrantDetail: "仅监听 127.0.0.1",
    lanDetail: "开启后供已配对手机访问"
  },
  overview: {
    libraryAssets: "资料总数",
    images: "图片",
    indexed: "已索引",
    trustedDevices: "可信设备",
    uploads: "上传任务",
    indexJobs: "索引任务"
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
    hint: "文件会先复制到 Windows 资料库，再进入索引队列。",
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
    placeholder: "搜索本地资料",
    empty: "还没有搜索结果"
  },
  cards: {
    devices: "配对二维码、可信 Android 设备和最近在线状态",
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
    cacheDeleted: (count: number) => `已删除 ${count} 个下载缓存文件`
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
    indexed: "已索引"
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
