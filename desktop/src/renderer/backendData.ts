import {
  BackendClient,
  type Device,
  type IndexStatusResponse,
  type LibraryAssetsResponse,
  type PairingPayload,
  type QueueItem
} from "./backendClient";

export type BackendDashboardData = {
  uploads: QueueItem[];
  indexJobs: QueueItem[];
  cacheSummary: Record<string, number>;
  devices: Device[];
  libraryAssets: LibraryAssetsResponse;
  pairingPayload: PairingPayload | null;
  indexStatus: IndexStatusResponse | null;
};

export async function loadBackendDashboardData(client: BackendClient): Promise<BackendDashboardData> {
  const [uploads, indexJobs, cacheSummary, devices, libraryAssets, pairingPayload, indexStatus] = await Promise.all([
    client.uploadsQueue().catch(() => []),
    client.indexingQueue().catch(() => []),
    client.cacheSummary().catch(() => ({})),
    client.devices().catch(() => []),
    client.libraryAssets().catch(() => ({ total_count: 0, limit: 100, offset: 0, assets: [] })),
    client.pairingPayload().catch(() => null),
    client.indexStatus().catch(() => null)
  ]);
  return { uploads, indexJobs, cacheSummary, devices, libraryAssets, pairingPayload, indexStatus };
}
