import type { Device, IndexStatusResponse, LibraryAssetsResponse, QueueItem } from "./backendClient";

export type PageId = "overview" | "library" | "import" | "search" | "devices" | "config" | "tasks";
export type StepStatus = "done" | "action" | "warning" | "error" | "optional";

export type SetupSnapshot = {
  backendUrl: string;
  publicUrl: string;
  qdrantUrl: string;
  dataRoot: string;
  dataMode: "portable" | "local";
  settings: {
    lanEnabled: boolean;
    discoveryEnabled: boolean;
    autoIndexEnabled: boolean;
    embeddingProviderId: "jina-v5-omni-small";
    retrievalMode: "hnsw" | "full_scan";
    hnsw: {
      m: number;
      efConstruct: number;
      fullScanThreshold: number;
      searchEf: number;
    };
  };
  discovery: {
    running: boolean;
    port: number;
  };
  services: Array<{
    name: "qdrant" | "backend";
    running: boolean;
    pid?: number;
    error?: string;
  }>;
};

export type DashboardInput = {
  snapshot: SetupSnapshot | null;
  libraryAssets: LibraryAssetsResponse;
  devices: Device[];
  uploads: QueueItem[];
  indexJobs: QueueItem[];
  indexStatus: IndexStatusResponse | null;
};

export type SetupStep = {
  id: "services" | "connection" | "devices" | "library" | "indexing" | "pipeline" | "searchReady";
  title: string;
  detail: string;
  status: StepStatus;
  targetPage: PageId;
  actionLabel?: string;
};

export type OverviewStat = {
  id: "assets" | "images" | "indexed" | "devices" | "uploads" | "indexJobs" | "qdrantPoints";
  label: string;
  value: number;
  accent: "blue" | "red" | "yellow" | "green";
};

export type ConfigurationGroup = {
  id: "connection" | "embedding" | "retrieval" | "hnsw" | "indexing" | "qdrant" | "cache" | "storage";
  title: string;
  description: string;
};

export const navigationPages: Array<{ id: PageId; label: string; description: string }> = [
  { id: "overview", label: "总览", description: "检查服务、连接、资料、索引和搜索是否已经可用。" },
  { id: "library", label: "资料中心", description: "统一管理电脑和手机加入资料组的文件。" },
  { id: "import", label: "导入", description: "从电脑选择文件或文件夹，复制到资料库并进入索引队列。" },
  { id: "search", label: "搜索", description: "验证文本、图片语义和标签检索结果。" },
  { id: "devices", label: "设备", description: "用验证码加入手机，并管理已信任设备。" },
  { id: "config", label: "配置中心", description: "集中调整连接、embedding、检索、HNSW、Qdrant 和缓存。" },
  { id: "tasks", label: "任务", description: "查看上传、导入、索引和失败任务。" }
];

export function buildConfigurationGroups(): ConfigurationGroup[] {
  return [
    { id: "connection", title: "连接", description: "局域网、发现广播、后端地址和服务可见性。" },
    { id: "embedding", title: "Embedding 阶段", description: "当前模型、维度、运行时和扩展入口。" },
    { id: "retrieval", title: "检索阶段", description: "HNSW 向量索引或 Qdrant exact 全量扫描。" },
    { id: "hnsw", title: "HNSW 参数", description: "索引构建和查询阶段的 Qdrant HNSW 参数。" },
    { id: "indexing", title: "索引控制", description: "处理队列、重构索引和失败任务入口。" },
    { id: "qdrant", title: "Qdrant", description: "collection 名称、point 数量和本地绑定状态。" },
    { id: "cache", title: "缓存", description: "下载缓存、缩略图缓存和临时文件清理。" },
    { id: "storage", title: "存储", description: "当前数据目录、便携模式和本地资料库位置。" }
  ];
}

export function buildSetupSteps(input: DashboardInput): SetupStep[] {
  const backendRunning = serviceRunning(input.snapshot, "backend");
  const qdrantRunning = serviceRunning(input.snapshot, "qdrant");
  const trustedPhones = input.devices.filter((device) => device.device_type === "android" && device.is_trusted === 1).length;
  const totalAssets = input.libraryAssets.total_count;
  const failedJobs = queueCount(input.indexStatus, "failed") + input.indexJobs.filter((job) => job.status === "failed").length;
  const activeIndexJobs =
    queueCount(input.indexStatus, "queued") +
    queueCount(input.indexStatus, "indexing") +
    queueCount(input.indexStatus, "retry_wait") +
    input.indexJobs.filter((job) => ["queued", "indexing", "retry_wait"].includes(job.status)).length;
  const indexedAssets = input.indexStatus?.asset_counts.indexed ?? input.libraryAssets.assets.filter((asset) => asset.index_status === "indexed").length;
  const qdrantPoints = pointTotal(input.indexStatus);

  return [
    {
      id: "services",
      title: "启动核心服务",
      detail: backendRunning && qdrantRunning ? "Backend 和 Qdrant 都在运行。" : "需要先启动 Backend 和 Qdrant，后续导入、embedding、索引和搜索才可用。",
      status: backendRunning && qdrantRunning ? "done" : "action",
      targetPage: "overview",
      actionLabel: backendRunning && qdrantRunning ? undefined : "启动服务"
    },
    {
      id: "connection",
      title: "确认连接方式",
      detail: input.snapshot?.settings.lanEnabled
        ? `局域网模式开启，手机可发现 ${input.snapshot.publicUrl}。`
        : "局域网模式已关闭，仅电脑本机可以访问后端。",
      status: input.snapshot?.settings.lanEnabled ? "done" : "optional",
      targetPage: "config",
      actionLabel: input.snapshot?.settings.lanEnabled ? undefined : "打开配置"
    },
    {
      id: "devices",
      title: "加入手机设备",
      detail: trustedPhones > 0 ? `${trustedPhones} 台手机已加入资料组。` : "还没有手机加入，电脑可先单机使用，也可以打开验证码配对。",
      status: trustedPhones > 0 ? "done" : "action",
      targetPage: "devices",
      actionLabel: trustedPhones > 0 ? undefined : "打开配对码"
    },
    {
      id: "library",
      title: "导入资料",
      detail: totalAssets > 0 ? `资料中心已有 ${totalAssets} 项资料。` : "资料中心还是空的，请先从电脑导入文件，或从手机上传。",
      status: totalAssets > 0 ? "done" : "action",
      targetPage: "import",
      actionLabel: totalAssets > 0 ? undefined : "导入资料"
    },
    {
      id: "indexing",
      title: "完成 embedding 和索引",
      detail: indexingDetail(totalAssets, indexedAssets, activeIndexJobs, failedJobs),
      status: indexingStatus(totalAssets, indexedAssets, activeIndexJobs, failedJobs),
      targetPage: failedJobs > 0 ? "tasks" : "config",
      actionLabel: indexingActionLabel(totalAssets, activeIndexJobs, failedJobs)
    },
    {
      id: "pipeline",
      title: "确认检索配置",
      detail: pipelineDetail(input.indexStatus),
      status: input.indexStatus ? "done" : "warning",
      targetPage: "config",
      actionLabel: input.indexStatus ? undefined : "查看配置"
    },
    {
      id: "searchReady",
      title: "验证搜索可用",
      detail: qdrantPoints > 0 ? `Qdrant 已有 ${qdrantPoints} 个向量点，可开始搜索。` : "还没有 Qdrant 向量点，搜索结果会不完整。",
      status: qdrantPoints > 0 ? "done" : totalAssets > 0 ? "warning" : "action",
      targetPage: qdrantPoints > 0 ? "search" : "config",
      actionLabel: qdrantPoints > 0 ? "开始搜索" : totalAssets > 0 ? "重构索引" : "先导入资料"
    }
  ];
}

export function buildOverviewStats(input: Omit<DashboardInput, "snapshot">): OverviewStat[] {
  const imageCount = input.libraryAssets.assets.filter((asset) => asset.kind === "image").length;
  const indexed = input.indexStatus?.asset_counts.indexed ?? input.libraryAssets.assets.filter((asset) => asset.index_status === "indexed").length;
  const trustedDevices = input.devices.filter((device) => device.device_type === "android" && device.is_trusted === 1).length;

  return [
    { id: "assets", label: "资料总数", value: input.libraryAssets.total_count, accent: "blue" },
    { id: "images", label: "图片", value: imageCount, accent: "green" },
    { id: "indexed", label: "已索引", value: indexed, accent: "green" },
    { id: "devices", label: "可信手机", value: trustedDevices, accent: "blue" },
    { id: "uploads", label: "上传任务", value: input.uploads.length, accent: "yellow" },
    { id: "indexJobs", label: "索引任务", value: input.indexJobs.length, accent: "yellow" },
    { id: "qdrantPoints", label: "Qdrant points", value: pointTotal(input.indexStatus), accent: "green" }
  ];
}

export function serviceRunning(snapshot: SetupSnapshot | null, serviceName: "qdrant" | "backend"): boolean {
  return Boolean(snapshot?.services.find((service) => service.name === serviceName)?.running);
}

export function pointTotal(indexStatus: IndexStatusResponse | null): number {
  if (!indexStatus) return 0;
  return Object.values(indexStatus.point_counts).reduce((sum, count) => sum + count, 0);
}

function queueCount(indexStatus: IndexStatusResponse | null, status: string): number {
  return indexStatus?.queue_counts[status] ?? 0;
}

function indexingStatus(totalAssets: number, indexedAssets: number, activeIndexJobs: number, failedJobs: number): StepStatus {
  if (failedJobs > 0) return "error";
  if (totalAssets === 0) return "action";
  if (activeIndexJobs > 0) return "warning";
  if (indexedAssets >= totalAssets) return "done";
  return "warning";
}

function indexingActionLabel(totalAssets: number, activeIndexJobs: number, failedJobs: number): string | undefined {
  if (failedJobs > 0) return "查看任务";
  if (totalAssets === 0) return "先导入资料";
  if (activeIndexJobs > 0) return "处理索引";
  return undefined;
}

function indexingDetail(totalAssets: number, indexedAssets: number, activeIndexJobs: number, failedJobs: number): string {
  if (failedJobs > 0) return `${failedJobs} 个索引任务失败，需要查看错误并重构或重试。`;
  if (totalAssets === 0) return "还没有资料进入索引流程。";
  if (activeIndexJobs > 0) return `${activeIndexJobs} 个索引任务等待处理，当前已有 ${indexedAssets}/${totalAssets} 项完成索引。`;
  return `当前已有 ${indexedAssets}/${totalAssets} 项完成 embedding 和 Qdrant 写入。`;
}

function pipelineDetail(indexStatus: IndexStatusResponse | null): string {
  if (!indexStatus) return "后端还没有返回 pipeline 状态。";
  const embedding = indexStatus.pipeline.embedding;
  const retrieval = indexStatus.pipeline.retrieval;
  return `${embedding.model_name} / ${embedding.dimension} 维 / ${retrieval.mode === "hnsw" ? "HNSW" : "遍历 exact search"}`;
}
