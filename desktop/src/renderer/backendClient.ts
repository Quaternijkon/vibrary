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
  thumbnail_url?: string | null;
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

export type LibraryAssetSource = {
  ref_id: string;
  device_id: string;
  device_name: string;
  device_type: "windows" | "android";
  ref_type: string;
  display_name?: string | null;
  size_bytes?: number | null;
  permission_status?: string | null;
  last_verified_at?: string | null;
  last_seen_at?: string | null;
};

export type LibraryAsset = {
  asset_id: string;
  asset_version_id?: string | null;
  title: string;
  kind: "image" | "text";
  mime_type?: string | null;
  size_bytes: number;
  content_sha256: string;
  index_status: string;
  library_status: string;
  first_seen_at?: string | null;
  first_seen_device_id?: string | null;
  library_file_available: boolean;
  thumbnail_url?: string | null;
  content_url?: string | null;
  sources: LibraryAssetSource[];
  latest_index_job?: {
    status?: string | null;
    job_type?: string | null;
    error_message?: string | null;
    completed_at?: string | null;
  } | null;
  availability?: SearchResult["availability"] | null;
  delivery?: SearchResult["delivery"] | null;
};

export type LibraryAssetsResponse = {
  total_count: number;
  limit: number;
  offset: number;
  assets: LibraryAsset[];
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

  libraryAssets(options: { query?: string; kind?: "all" | "image" | "text"; limit?: number; offset?: number } = {}): Promise<LibraryAssetsResponse> {
    const params = new URLSearchParams();
    params.set("device_id", "windows-local");
    params.set("limit", String(options.limit ?? 100));
    if (options.offset) params.set("offset", String(options.offset));
    if (options.query?.trim()) params.set("query", options.query.trim());
    if (options.kind && options.kind !== "all") params.set("kind", options.kind);
    return this.get(`/v1/library/assets?${params.toString()}`);
  }

  assetUrl(path: string | null | undefined): string | null {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    return `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
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
