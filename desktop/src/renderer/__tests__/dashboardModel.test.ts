import { describe, expect, it } from "vitest";
import {
  buildConfigurationGroups,
  buildOverviewStats,
  buildSetupSteps,
  navigationPages,
  type SetupSnapshot
} from "../dashboardModel";
import type { Device, IndexStatusResponse, LibraryAssetsResponse, QueueItem } from "../backendClient";

describe("desktop dashboard model", () => {
  it("turns missing runtime setup into actionable overview steps", () => {
    const steps = buildSetupSteps({
      snapshot: snapshot({ backendRunning: false, qdrantRunning: false }),
      libraryAssets: libraryAssets(0),
      devices: [],
      uploads: [],
      indexJobs: [],
      indexStatus: null
    });

    expect(steps.map((step) => [step.id, step.status, step.actionLabel, step.targetPage])).toContainEqual([
      "services",
      "action",
      "启动服务",
      "overview"
    ]);
    expect(steps.map((step) => [step.id, step.status, step.actionLabel, step.targetPage])).toContainEqual([
      "devices",
      "action",
      "打开配对码",
      "devices"
    ]);
    expect(steps.map((step) => [step.id, step.status, step.actionLabel, step.targetPage])).toContainEqual([
      "library",
      "action",
      "导入资料",
      "import"
    ]);
  });

  it("surfaces failed indexing and Qdrant point gaps before search", () => {
    const indexJobs: QueueItem[] = [{ index_job_id: "idx_1", status: "failed", job_type: "image" }];
    const steps = buildSetupSteps({
      snapshot: snapshot({ backendRunning: true, qdrantRunning: true }),
      libraryAssets: libraryAssets(3),
      devices: [androidDevice()],
      uploads: [],
      indexJobs,
      indexStatus: indexStatus({
        queue_counts: { failed: 1, completed: 2 },
        point_counts: { text_chunks_jina_v5_omni_small_v1: 0, image_semantic_jina_v5_omni_small_v1: 0 },
        asset_counts: { total: 3, indexed: 2 }
      })
    });

    expect(steps.find((step) => step.id === "indexing")).toMatchObject({
      status: "error",
      actionLabel: "查看任务",
      targetPage: "tasks"
    });
    expect(steps.find((step) => step.id === "searchReady")).toMatchObject({
      status: "warning",
      actionLabel: "重构索引",
      targetPage: "config"
    });
  });

  it("centralizes all tunable system groups in the configuration center", () => {
    expect(buildConfigurationGroups().map((group) => group.id)).toEqual([
      "connection",
      "embedding",
      "retrieval",
      "hnsw",
      "indexing",
      "qdrant",
      "cache",
      "storage"
    ]);
  });

  it("computes overview stats from library, device, queue, and index state", () => {
    const stats = buildOverviewStats({
      libraryAssets: libraryAssets(4, 2),
      devices: [androidDevice(), androidDevice("android-2")],
      uploads: [{ upload_id: "up_1", status: "uploading" }],
      indexJobs: [{ index_job_id: "idx_1", status: "queued" }],
      indexStatus: indexStatus({
        queue_counts: { queued: 1 },
        point_counts: { text_chunks_jina_v5_omni_small_v1: 2, image_semantic_jina_v5_omni_small_v1: 2 },
        asset_counts: { total: 4, indexed: 3 }
      })
    });

    expect(stats.map((stat) => [stat.id, stat.value])).toEqual([
      ["assets", 4],
      ["images", 2],
      ["indexed", 3],
      ["devices", 2],
      ["uploads", 1],
      ["indexJobs", 1],
      ["qdrantPoints", 4]
    ]);
  });

  it("uses product pages that match the redesigned navigation", () => {
    expect(navigationPages.map((page) => page.label)).toEqual([
      "总览",
      "资料中心",
      "导入",
      "搜索",
      "设备",
      "配置中心",
      "任务"
    ]);
  });
});

function snapshot(input: { backendRunning: boolean; qdrantRunning: boolean }): SetupSnapshot {
  return {
    backendUrl: "http://127.0.0.1:8765",
    publicUrl: "http://192.168.1.142:8765",
    qdrantUrl: "http://127.0.0.1:6333",
    dataRoot: "D:\\Vibrary\\data",
    dataMode: "local",
    settings: {
      lanEnabled: true,
      discoveryEnabled: true,
      autoIndexEnabled: true,
      embeddingProviderId: "jina-v5-omni-small",
      retrievalMode: "hnsw",
      hnsw: { m: 16, efConstruct: 200, fullScanThreshold: 10000, searchEf: 128 }
    },
    discovery: { running: true, port: 8766 },
    services: [
      { name: "backend", running: input.backendRunning },
      { name: "qdrant", running: input.qdrantRunning }
    ]
  };
}

function libraryAssets(total: number, images = 0): LibraryAssetsResponse {
  return {
    total_count: total,
    limit: 100,
    offset: 0,
    assets: Array.from({ length: total }, (_, index) => ({
      asset_id: `asset_${index}`,
      title: index < images ? `photo-${index}.png` : `note-${index}.txt`,
      kind: index < images ? "image" : "text",
      size_bytes: 1024,
      content_sha256: `sha_${index}`,
      index_status: index % 2 === 0 ? "indexed" : "queued",
      library_status: "present",
      library_file_available: true,
      sources: []
    }))
  };
}

function androidDevice(device_id = "android-1"): Device {
  return {
    device_id,
    device_name: "Pixel",
    device_type: "android",
    is_trusted: 1
  };
}

function indexStatus(input: {
  queue_counts: Record<string, number>;
  point_counts: Record<string, number>;
  asset_counts: { total: number; indexed: number };
}): IndexStatusResponse {
  return {
    pipeline: {
      embedding: {
        provider_id: "jina-v5-omni-small",
        profile_id: "jina-v5-omni-small-retrieval-v1",
        model_name: "jinaai/jina-embeddings-v5-omni-small",
        model_revision: "main",
        dimension: 1024,
        runtime: "sentence-transformers",
        trust_remote_code: true
      },
      retrieval: {
        mode: "hnsw",
        hnsw: { m: 16, ef_construct: 200, full_scan_threshold: 10000, search_ef: 128 }
      },
      collections: {
        text: "text_chunks_jina_v5_omni_small_v1",
        image: "image_semantic_jina_v5_omni_small_v1",
        image_labels: "image_labels_jina_v5_omni_small_v1"
      }
    },
    options: {
      embedding_providers: [],
      retrieval_modes: ["hnsw", "full_scan"]
    },
    queue_counts: input.queue_counts,
    point_counts: input.point_counts,
    asset_counts: input.asset_counts
  };
}
