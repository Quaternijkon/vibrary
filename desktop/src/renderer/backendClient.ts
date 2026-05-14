export type Fetcher = typeof fetch;

export type ImportSummary = {
  scanned_count: number;
  imported_count: number;
  duplicate_count: number;
  failed_count: number;
  index_queued_count: number;
};

export type QueueItem = {
  upload_id?: string;
  index_job_id?: string;
  file_name?: string;
  asset_id?: string;
  job_type?: string;
  status: string;
  bytes_received?: number;
  size_bytes?: number;
  retry_count?: number;
  error_message?: string | null;
};

export type PairingPayload = {
  server_url: string;
  pairing_code: string;
  pairing_token: string;
  expires_at: string;
};

export type Device = {
  device_id: string;
  device_name: string;
  device_type: "windows" | "android";
  paired_at?: string | null;
  last_seen_at?: string | null;
  is_trusted: number;
};

export type SearchResult = {
  asset_id: string;
  title: string;
  mime_type?: string;
  score: number;
  matched_by: string[];
  snippet?: string | null;
  delivery: {
    mode: string;
    download_url?: string | null;
    stream_url?: string | null;
  };
  availability: {
    requesting_device: {
      recommended_action: string;
      local_ref_id?: string | null;
    };
  };
};

export type SearchResponse = {
  results: SearchResult[];
};

export class BackendClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: Fetcher = fetch
  ) {}

  importFiles(paths: string[]): Promise<ImportSummary> {
    return this.post("/v1/imports/windows/files", {
      paths,
      device_id: "windows-local"
    });
  }

  importFolder(path: string): Promise<ImportSummary> {
    return this.post("/v1/imports/windows/folder", {
      path,
      device_id: "windows-local"
    });
  }

  uploadsQueue(): Promise<QueueItem[]> {
    return this.get("/v1/queues/uploads");
  }

  indexingQueue(): Promise<QueueItem[]> {
    return this.get("/v1/queues/indexing");
  }

  processIndexing(limit = 10): Promise<{ indexed_count: number; failed_count: number }> {
    return this.post(`/v1/queues/indexing/process?limit=${limit}`, {});
  }

  pairingPayload(): Promise<PairingPayload> {
    return this.get("/v1/pairing/qr");
  }

  devices(): Promise<Device[]> {
    return this.get("/v1/devices");
  }

  deleteDevice(deviceId: string): Promise<{ device_id: string; revoked: boolean }> {
    return this.delete(`/v1/devices/${encodeURIComponent(deviceId)}`);
  }

  search(query: string): Promise<SearchResponse> {
    return this.post("/v1/search", {
      device_id: "windows-local",
      query,
      search_types: ["text", "image"],
      limit: 20,
      filters: null
    });
  }

  cacheSummary(): Promise<Record<string, number>> {
    return this.get("/v1/cache/summary");
  }

  clearDownloads(): Promise<{ deleted_files: number; deleted_bytes: number; skipped_files: number }> {
    return this.delete("/v1/cache/downloads");
  }

  private async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "GET" });
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  private async delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "DELETE" });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetcher.call(globalThis, `${this.baseUrl}${path}`, init);
    if (!response.ok) {
      throw new Error(`Backend request failed: HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  }
}
