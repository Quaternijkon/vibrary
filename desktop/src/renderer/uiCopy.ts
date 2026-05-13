export const desktopCopy = {
  brand: {
    subtitle: "Windows 节点"
  },
  sections: [
    { id: "status", label: "服务状态" },
    { id: "library", label: "资料导入" },
    { id: "uploads", label: "上传队列" },
    { id: "index", label: "索引队列" },
    { id: "search", label: "搜索" },
    { id: "devices", label: "设备" },
    { id: "cache", label: "缓存" },
    { id: "models", label: "模型" },
    { id: "settings", label: "设置" }
  ],
  actions: {
    refresh: "刷新",
    start: "启动服务",
    stop: "停止服务",
    chooseFiles: "选择文件",
    chooseFolder: "选择文件夹",
    process: "处理索引",
    search: "搜索",
    clearDownloads: "清理下载缓存"
  },
  topbar: {
    title: "本地资料库控制台",
    loading: "正在读取服务状态"
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
  library: {
    title: "资料导入",
    hint: "文件会先复制到 Windows 资料库，再进入索引队列。",
    filesSelected: "已选文件",
    folderSelected: "已选文件夹",
    imported: "已导入",
    duplicates: "重复"
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
    folderQueued: "文件夹已提交导入",
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
