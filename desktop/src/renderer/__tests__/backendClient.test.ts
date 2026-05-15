import { afterEach, describe, expect, it, vi } from "vitest";
import { BackendClient } from "../backendClient";

describe("BackendClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("imports selected files through the Windows import API", async () => {
    const fetcher = vi.fn(async () => response({ imported_count: 2 }));
    const client = new BackendClient("http://127.0.0.1:8765", fetcher);

    const result = await client.importFiles(["C:\\docs\\a.txt", "C:\\docs\\b.txt"]);

    expect(result.imported_count).toBe(2);
    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:8765/v1/imports/windows/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: ["C:\\docs\\a.txt", "C:\\docs\\b.txt"], device_id: "windows-local" })
    });
  });

  it("searches with source-aware backend results", async () => {
    const fetcher = vi.fn(async () => response({ results: [{ asset_id: "asset_1", title: "note.txt" }] }));
    const client = new BackendClient("http://127.0.0.1:8765", fetcher);

    const result = await client.search("red car");

    expect(result.results[0].asset_id).toBe("asset_1");
    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:8765/v1/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_id: "windows-local",
        query: "red car",
        search_types: ["text", "image"],
        limit: 20,
        filters: null
      })
    });
  });

  it("loads the shared library center for the Windows device", async () => {
    const fetcher = vi.fn(async () =>
      response({
        total_count: 1,
        assets: [{ asset_id: "asset_1", title: "photo.jpg", kind: "image", thumbnail_url: "/v1/assets/asset_1/thumbnail" }]
      })
    );
    const client = new BackendClient("http://127.0.0.1:8765", fetcher);

    const result = await client.libraryAssets();

    expect(result.assets[0].thumbnail_url).toBe("/v1/assets/asset_1/thumbnail");
    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:8765/v1/library/assets?device_id=windows-local&limit=100", {
      method: "GET"
    });
  });

  it("loads active index pipeline status", async () => {
    const fetcher = vi.fn(async () =>
      response({
        pipeline: { embedding: { provider_id: "jina-v5-omni-small" } },
        queue_counts: { queued: 2 }
      })
    );
    const client = new BackendClient("http://127.0.0.1:8765", fetcher);

    const result = await client.indexStatus();

    expect(result.pipeline.embedding.provider_id).toBe("jina-v5-omni-small");
    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:8765/v1/index/status", { method: "GET" });
  });

  it("requests a full active index rebuild through the backend", async () => {
    const fetcher = vi.fn(async () => response({ queued_count: 3 }));
    const client = new BackendClient("http://127.0.0.1:8765", fetcher);

    const result = await client.rebuildIndex();

    expect(result.queued_count).toBe(3);
    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:8765/v1/index/rebuild", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
  });

  it("binds the browser fetch function when no test fetcher is injected", async () => {
    const browserFetch = vi.fn(function (this: unknown) {
      if (this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      return Promise.resolve(
        response({
          server_url: "http://192.168.1.132:8765",
          pairing_code: "123456",
          pairing_token: "123456",
          expires_at: "2026-05-14T07:39:16Z"
        })
      );
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", browserFetch);
    const client = new BackendClient("http://127.0.0.1:8765");

    const payload = await client.pairingPayload();

    expect(payload.pairing_code).toBe("123456");
    expect(browserFetch).toHaveBeenCalledWith("http://127.0.0.1:8765/v1/pairing/qr", { method: "GET" });
  });
});

function response(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => data
  } as Response;
}
