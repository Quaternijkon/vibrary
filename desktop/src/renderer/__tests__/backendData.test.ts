import { describe, expect, it, vi } from "vitest";
import { loadBackendDashboardData } from "../backendData";
import type { BackendClient } from "../backendClient";

describe("loadBackendDashboardData", () => {
  it("refreshes the pairing payload during periodic dashboard polling", async () => {
    const client = {
      uploadsQueue: vi.fn(async () => []),
      indexingQueue: vi.fn(async () => []),
      cacheSummary: vi.fn(async () => ({})),
      devices: vi.fn(async () => []),
      pairingPayload: vi.fn(async () => ({
        server_url: "http://192.168.1.142:8765",
        pairing_code: "123456",
        pairing_token: "123456",
        expires_at: "2026-05-13T15:00:00Z"
      }))
    } as unknown as BackendClient;

    const data = await loadBackendDashboardData(client);

    expect(client.pairingPayload).toHaveBeenCalledTimes(1);
    expect(data.pairingPayload?.pairing_code).toBe("123456");
  });
});
