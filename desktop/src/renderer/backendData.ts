import { BackendClient, type Device, type PairingPayload, type QueueItem } from "./backendClient";

export type BackendDashboardData = {
  uploads: QueueItem[];
  indexJobs: QueueItem[];
  cacheSummary: Record<string, number>;
  devices: Device[];
  pairingPayload: PairingPayload | null;
};

export async function loadBackendDashboardData(client: BackendClient): Promise<BackendDashboardData> {
  const [uploads, indexJobs, cacheSummary, devices, pairingPayload] = await Promise.all([
    client.uploadsQueue().catch(() => []),
    client.indexingQueue().catch(() => []),
    client.cacheSummary().catch(() => ({})),
    client.devices().catch(() => []),
    client.pairingPayload().catch(() => null)
  ]);
  return { uploads, indexJobs, cacheSummary, devices, pairingPayload };
}
