import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Boxes,
  Database,
  DownloadCloud,
  FileText,
  FolderOpen,
  HardDrive,
  Home,
  Image as ImageIcon,
  Laptop,
  Library,
  ListChecks,
  MonitorCog,
  Search,
  Settings,
  Smartphone,
  Trash2,
  UploadCloud
} from "lucide-react";
import {
  BackendClient,
  type Device,
  type ImportSummary,
  type IndexStatusResponse,
  type LibraryAsset,
  type LibraryAssetsResponse,
  type PairingPayload,
  type QueueItem,
  type SearchResult
} from "./backendClient";
import { loadBackendDashboardData } from "./backendData";
import { desktopCopy } from "./uiCopy";
import "./styles.css";

type Snapshot = Awaited<ReturnType<typeof window.vibraryDesktop.getSnapshot>>;
type PageId = (typeof desktopCopy.pages)[number]["id"];
type LibraryKind = "all" | "image" | "text";

const pageIcons: Record<PageId, React.ComponentType<{ size?: number }>> = {
  home: Home,
  library: Library,
  import: FolderOpen,
  search: Search,
  transfer: Activity,
  devices: Smartphone,
  settings: Settings
};

const emptyLibraryAssets: LibraryAssetsResponse = { total_count: 0, limit: 100, offset: 0, assets: [] };

function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [activePage, setActivePage] = useState<PageId>("home");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryKind, setLibraryKind] = useState<LibraryKind>("all");
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [libraryAssets, setLibraryAssets] = useState<LibraryAssetsResponse>(emptyLibraryAssets);
  const [uploads, setUploads] = useState<QueueItem[]>([]);
  const [indexJobs, setIndexJobs] = useState<QueueItem[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [pairingPayload, setPairingPayload] = useState<PairingPayload | null>(null);
  const [indexStatus, setIndexStatus] = useState<IndexStatusResponse | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [cacheSummary, setCacheSummary] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string>(desktopCopy.messages.ready);

  const client = useMemo(() => (snapshot ? new BackendClient(snapshot.backendUrl) : null), [snapshot]);

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh();
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);

  async function refresh() {
    const nextSnapshot = await window.vibraryDesktop.getSnapshot();
    setSnapshot(nextSnapshot);
    const activeClient = new BackendClient(nextSnapshot.backendUrl);
    await refreshBackendData(activeClient);
  }

  async function startServices() {
    const nextSnapshot = await window.vibraryDesktop.startServices();
    setSnapshot(nextSnapshot);
    const activeClient = new BackendClient(nextSnapshot.backendUrl);
    await refreshBackendData(activeClient);
  }

  async function stopServices() {
    setSnapshot(await window.vibraryDesktop.stopServices());
  }

  async function chooseFiles() {
    const files = await window.vibraryDesktop.selectImportFiles();
    setSelectedFiles(files);
    if (files.length > 0 && client) {
      try {
        const summary = await client.importFiles(files);
        setImportSummary(summary);
        await refreshBackendData(client);
        setActivePage("library");
        setMessage(desktopCopy.messages.importCompleted(summary.imported_count, summary.duplicate_count, summary.index_queued_count));
      } catch (error) {
        setMessage(desktopCopy.messages.requestFailed(error instanceof Error ? error.message : String(error)));
      }
    }
  }

  async function chooseFolder() {
    const folder = await window.vibraryDesktop.selectImportFolder();
    setSelectedFolder(folder);
    if (folder && client) {
      try {
        const summary = await client.importFolder(folder);
        setImportSummary(summary);
        await refreshBackendData(client);
        setActivePage("library");
        setMessage(desktopCopy.messages.importCompleted(summary.imported_count, summary.duplicate_count, summary.index_queued_count));
      } catch (error) {
        setMessage(desktopCopy.messages.requestFailed(error instanceof Error ? error.message : String(error)));
      }
    }
  }

  async function refreshBackendData(activeClient = client) {
    if (!activeClient) return;
    const nextData = await loadBackendDashboardData(activeClient);
    setUploads(nextData.uploads);
    setIndexJobs(nextData.indexJobs);
    setCacheSummary(nextData.cacheSummary);
    setDevices(nextData.devices);
    setPairingPayload(nextData.pairingPayload);
    setIndexStatus(nextData.indexStatus);
    setLibraryAssets(nextData.libraryAssets);
  }

  async function refreshLibrary() {
    if (!client) return;
    try {
      const nextAssets = await client.libraryAssets({ query: libraryQuery, kind: libraryKind });
      setLibraryAssets(nextAssets);
      setMessage(`资料中心已刷新：${nextAssets.total_count} 项`);
    } catch (error) {
      setMessage(desktopCopy.messages.requestFailed(error instanceof Error ? error.message : String(error)));
    }
  }

  async function refreshPairingPayload(activeClient = client) {
    if (!activeClient) return;
    setPairingPayload(await activeClient.pairingPayload().catch(() => null));
  }

  async function removeDevice(deviceId: string) {
    if (!client) return;
    await client.deleteDevice(deviceId);
    await refreshBackendData(client);
    setMessage(`已移除设备 ${deviceId}`);
  }

  async function updateSettings(settings: Snapshot["settings"]) {
    const nextSnapshot = await window.vibraryDesktop.updateSettings(settings);
    setSnapshot(nextSnapshot);
    const activeClient = new BackendClient(nextSnapshot.backendUrl);
    await refreshBackendData(activeClient);
    setMessage("设置已保存，后台服务已按新设置重启");
  }

  async function processIndexing() {
    if (!client) return;
    const processed = await client.processIndexing();
    await refreshBackendData(client);
    setMessage(desktopCopy.messages.indexed(processed.indexed_count, processed.failed_count));
  }

  async function rebuildIndex() {
    if (!client) return;
    const rebuilt = await client.rebuildIndex();
    await refreshBackendData(client);
    setMessage(`已重新加入索引队列：${rebuilt.queued_count} 项`);
  }

  async function runSearch() {
    if (!client || query.trim().length === 0) return;
    const response = await client.search(query.trim());
    setResults(response.results);
    setMessage(desktopCopy.messages.results(response.results.length));
  }

  async function clearDownloads() {
    if (!client) return;
    const cleared = await client.clearDownloads();
    await refreshBackendData(client);
    setMessage(desktopCopy.messages.cacheDeleted(cleared.deleted_files));
  }

  const qdrant = snapshot?.services.find((service) => service.name === "qdrant");
  const backend = snapshot?.services.find((service) => service.name === "backend");
  const runningCount = useMemo(
    () => snapshot?.services.filter((service) => service.running).length ?? 0,
    [snapshot]
  );

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Database size={24} />
          <div>
            <strong>Vibrary</strong>
            <span>{desktopCopy.brand.subtitle}</span>
          </div>
        </div>
        <nav aria-label="Desktop pages">
          {desktopCopy.pages.map(({ id, label }) => {
            const Icon = pageIcons[id];
            return (
              <button
                key={id}
                type="button"
                className={`nav-item${activePage === id ? " active" : ""}`}
                onClick={() => setActivePage(id)}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-status">
          <span className={`status-dot ${backend?.running ? "status-running" : "status-stopped"}`} />
          <span>{backend?.running ? "后端运行中" : "后端已停止"}</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{desktopCopy.pageTitles[activePage]}</h1>
            <p>{desktopCopy.pageDescriptions[activePage]}</p>
          </div>
          <div className="actions">
            <button type="button" onClick={refresh}>{desktopCopy.actions.refresh}</button>
            <button type="button" className="primary-button" onClick={startServices}>{desktopCopy.actions.start}</button>
            <button type="button" onClick={stopServices}>{desktopCopy.actions.stop}</button>
          </div>
        </header>

        {activePage === "home" ? (
          <HomePage
            snapshot={snapshot}
            runningCount={runningCount}
            qdrant={qdrant}
            backend={backend}
            libraryAssets={libraryAssets}
            uploads={uploads}
            indexJobs={indexJobs}
            devices={devices}
            onNavigate={setActivePage}
          />
        ) : null}
        {activePage === "library" ? (
          <LibraryCenterPage
            client={client}
            libraryAssets={libraryAssets}
            query={libraryQuery}
            kind={libraryKind}
            onQueryChange={setLibraryQuery}
            onKindChange={setLibraryKind}
            onRefresh={refreshLibrary}
          />
        ) : null}
        {activePage === "import" ? (
          <ImportPage
            selectedFiles={selectedFiles}
            selectedFolder={selectedFolder}
            importSummary={importSummary}
            onChooseFiles={chooseFiles}
            onChooseFolder={chooseFolder}
          />
        ) : null}
        {activePage === "search" ? (
          <SearchPage
            client={client}
            query={query}
            results={results}
            onQueryChange={setQuery}
            onSearch={runSearch}
          />
        ) : null}
        {activePage === "transfer" ? (
          <TransferPage uploads={uploads} indexJobs={indexJobs} onProcessIndexing={processIndexing} />
        ) : null}
        {activePage === "devices" ? (
          <DevicesPanel
            pairingPayload={pairingPayload}
            devices={devices}
            onRefreshCode={() => refreshPairingPayload()}
            onRemoveDevice={removeDevice}
          />
        ) : null}
        {activePage === "settings" && snapshot ? (
          <SettingsPage
            snapshot={snapshot}
            cacheSummary={cacheSummary}
            indexStatus={indexStatus}
            onUpdate={updateSettings}
            onClearDownloads={clearDownloads}
            onProcessIndexing={processIndexing}
            onRebuildIndex={rebuildIndex}
          />
        ) : null}
        <footer className="message-bar">{message}</footer>
      </section>
    </main>
  );
}

function HomePage(props: {
  snapshot: Snapshot | null;
  runningCount: number;
  qdrant: Snapshot["services"][number] | undefined;
  backend: Snapshot["services"][number] | undefined;
  libraryAssets: LibraryAssetsResponse;
  uploads: QueueItem[];
  indexJobs: QueueItem[];
  devices: Device[];
  onNavigate: (page: PageId) => void;
}) {
  const imageCount = props.libraryAssets.assets.filter((asset) => asset.kind === "image").length;
  const indexedCount = props.libraryAssets.assets.filter((asset) => asset.index_status === "indexed").length;
  const trustedDevices = props.devices.filter((device) => device.device_id !== "windows-local" && device.is_trusted === 1).length;
  return (
    <div className="page-stack">
      <section className="status-grid">
        <StatusTile title="Qdrant" detail={desktopCopy.status.qdrantDetail} status={props.qdrant?.running ? "running" : "stopped"} label={serviceStatusLabel(props.qdrant)} />
        <StatusTile title="Backend" detail={props.snapshot?.backendUrl ?? "127.0.0.1:8765"} status={props.backend?.running ? "running" : "stopped"} label={serviceStatusLabel(props.backend)} />
        <StatusTile
          title={desktopCopy.status.lanApi}
          detail={props.snapshot?.settings.lanEnabled ? props.snapshot.publicUrl : "仅允许本机访问"}
          status={props.snapshot?.settings.lanEnabled ? "running" : "stopped"}
          label={props.snapshot?.settings.lanEnabled ? "已开启" : "已关闭"}
        />
        <StatusTile title={desktopCopy.status.dataRoot} detail={props.snapshot?.dataRoot ?? "Resolving"} status={props.snapshot?.dataMode ?? "local"} label={props.snapshot?.dataMode ?? "local"} />
      </section>
      <section className="metric-grid">
        <Metric label={desktopCopy.overview.libraryAssets} value={props.libraryAssets.total_count} />
        <Metric label={desktopCopy.overview.images} value={imageCount} />
        <Metric label={desktopCopy.overview.indexed} value={indexedCount} />
        <Metric label={desktopCopy.overview.trustedDevices} value={trustedDevices} />
        <Metric label={desktopCopy.overview.uploads} value={props.uploads.length} />
        <Metric label={desktopCopy.overview.indexJobs} value={props.indexJobs.length} />
      </section>
      <section className="quick-actions">
        <button type="button" className="primary-button" onClick={() => props.onNavigate("library")}>
          <Library size={18} />
          {desktopCopy.actions.viewAll}
        </button>
        <button type="button" onClick={() => props.onNavigate("import")}>
          <UploadCloud size={18} />
          {desktopCopy.pages.find((page) => page.id === "import")?.label}
        </button>
        <button type="button" onClick={() => props.onNavigate("devices")}>
          <Smartphone size={18} />
          {desktopCopy.pages.find((page) => page.id === "devices")?.label}
        </button>
      </section>
    </div>
  );
}

function LibraryCenterPage(props: {
  client: BackendClient | null;
  libraryAssets: LibraryAssetsResponse;
  query: string;
  kind: LibraryKind;
  onQueryChange: (query: string) => void;
  onKindChange: (kind: LibraryKind) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="page-stack">
      <section className="toolbar-panel">
        <div className="search-box compact">
          <Search size={18} />
          <input value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} placeholder={desktopCopy.libraryCenter.searchPlaceholder} />
        </div>
        <div className="segmented-control" aria-label="资料类型">
          {[
            ["all", desktopCopy.actions.allTypes],
            ["image", desktopCopy.actions.imagesOnly],
            ["text", desktopCopy.actions.textOnly]
          ].map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              className={props.kind === kind ? "active" : ""}
              onClick={() => props.onKindChange(kind as LibraryKind)}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="primary-button" onClick={props.onRefresh}>{desktopCopy.actions.refreshLibrary}</button>
      </section>
      {props.libraryAssets.assets.length === 0 ? (
        <section className="empty-state">{desktopCopy.libraryCenter.empty}</section>
      ) : (
        <section className="asset-grid">
          {props.libraryAssets.assets.map((asset) => (
            <AssetCard key={asset.asset_id} asset={asset} client={props.client} />
          ))}
        </section>
      )}
    </div>
  );
}

function AssetCard(props: { asset: LibraryAsset; client: BackendClient | null }) {
  const thumbnailUrl = props.client?.assetUrl(props.asset.thumbnail_url);
  const contentUrl = props.client?.assetUrl(props.asset.content_url ? `${props.asset.content_url}?device_id=windows-local` : null);
  return (
    <article className="asset-card">
      <div className={`asset-thumb ${thumbnailUrl ? "has-image" : ""}`}>
        {thumbnailUrl ? <img src={thumbnailUrl} alt="" /> : props.asset.kind === "image" ? <ImageIcon size={24} /> : <FileText size={24} />}
      </div>
      <div className="asset-body">
        <div>
          <h2>{props.asset.title}</h2>
          <p>{kindLabel(props.asset.kind)} / {props.asset.mime_type ?? "application/octet-stream"} / {formatBytes(props.asset.size_bytes)}</p>
        </div>
        <dl className="asset-meta">
          <div>
            <dt>{desktopCopy.libraryCenter.source}</dt>
            <dd>{formatSources(props.asset.sources)}</dd>
          </div>
          <div>
            <dt>{desktopCopy.libraryCenter.indexStatus}</dt>
            <dd>{labelFor(desktopCopy.statusLabels, props.asset.index_status)}</dd>
          </div>
        </dl>
        {contentUrl ? (
          <a className="text-link" href={contentUrl} target="_blank" rel="noreferrer">
            {desktopCopy.actions.open}
          </a>
        ) : null}
      </div>
    </article>
  );
}

function ImportPage(props: {
  selectedFiles: string[];
  selectedFolder: string | null;
  importSummary: ImportSummary | null;
  onChooseFiles: () => void;
  onChooseFolder: () => void;
}) {
  return (
    <section className="panel split">
      <div>
        <h2>{desktopCopy.library.title}</h2>
        <p>{desktopCopy.library.hint}</p>
        <div className="button-row">
          <button type="button" className="primary-button" onClick={props.onChooseFiles}>{desktopCopy.actions.chooseFiles}</button>
          <button type="button" onClick={props.onChooseFolder}>{desktopCopy.actions.chooseFolder}</button>
        </div>
      </div>
      <div className="import-preview">
        <Metric label={desktopCopy.library.filesSelected} value={props.selectedFiles.length} />
        <Metric label={desktopCopy.library.folderSelected} value={props.selectedFolder ? 1 : 0} />
        <Metric label={desktopCopy.library.imported} value={props.importSummary?.imported_count ?? 0} />
        <Metric label={desktopCopy.library.duplicates} value={props.importSummary?.duplicate_count ?? 0} />
        <Metric label={desktopCopy.library.indexQueued} value={props.importSummary?.index_queued_count ?? 0} />
      </div>
    </section>
  );
}

function SearchPage(props: {
  client: BackendClient | null;
  query: string;
  results: SearchResult[];
  onQueryChange: (query: string) => void;
  onSearch: () => void;
}) {
  return (
    <section className="panel search-panel">
      <div className="search-box">
        <Search size={20} />
        <input value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} placeholder={desktopCopy.search.placeholder} />
        <button type="button" className="primary-button" onClick={props.onSearch}>{desktopCopy.actions.search}</button>
      </div>
      <ul className="result-list rich-results">
        {props.results.length === 0 ? <li className="empty-row">{desktopCopy.search.empty}</li> : null}
        {props.results.map((result) => {
          const thumbnailUrl = props.client?.assetUrl(result.thumbnail_url);
          const openUrl = props.client?.assetUrl(result.delivery.download_url ?? result.delivery.stream_url ?? null);
          return (
            <li key={result.asset_id}>
              <div className={`result-thumb ${thumbnailUrl ? "has-image" : ""}`}>
                {thumbnailUrl ? <img src={thumbnailUrl} alt="" /> : <FileText size={20} />}
              </div>
              <div>
                <strong>{result.title}</strong>
                <span>{labelFor(desktopCopy.deliveryLabels, result.delivery.mode)} / {labelFor(desktopCopy.actionLabels, result.availability.requesting_device.recommended_action)} / {result.score.toFixed(2)} / {result.matched_by.join(", ")}</span>
                {result.snippet ? <p>{result.snippet}</p> : null}
              </div>
              {openUrl ? <a className="text-link" href={openUrl} target="_blank" rel="noreferrer">{desktopCopy.actions.open}</a> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TransferPage(props: { uploads: QueueItem[]; indexJobs: QueueItem[]; onProcessIndexing: () => void }) {
  return (
    <section className="queue-grid">
      <QueuePanel id="uploads" title={desktopCopy.queues.uploadTitle} icon={<UploadCloud size={18} />} items={props.uploads.map(formatQueueItem)} empty={desktopCopy.queues.noUploads} />
      <QueuePanel
        id="index"
        title={desktopCopy.queues.indexTitle}
        icon={<ListChecks size={18} />}
        items={props.indexJobs.map(formatQueueItem)}
        empty={desktopCopy.queues.noIndexJobs}
        action={{ label: desktopCopy.actions.process, onClick: props.onProcessIndexing }}
      />
    </section>
  );
}

function StatusTile(props: { title: string; detail: string; status: string; label: string }) {
  return (
    <article className="status-tile">
      <span className={`status-dot status-${props.status}`} />
      <h2>{props.title}</h2>
      <p>{props.detail}</p>
      <strong>{props.label}</strong>
    </article>
  );
}

function serviceStatusLabel(service: Snapshot["services"][number] | undefined): string {
  if (!service) return desktopCopy.status.stopped;
  if (service.running) return desktopCopy.status.running;
  return service.error ?? desktopCopy.status.stopped;
}

function Metric(props: { label: string; value: number | string }) {
  return (
    <div className="metric">
      <strong>{props.value}</strong>
      <span>{props.label}</span>
    </div>
  );
}

function QueuePanel(props: { id: string; title: string; icon: React.ReactNode; items: string[]; empty: string; action?: { label: string; onClick: () => void } }) {
  const items = props.items.length > 0 ? props.items : [props.empty];
  return (
    <section id={props.id} className="panel">
      <div className="panel-heading">
        <h2>
          {props.icon}
          {props.title}
        </h2>
        {props.action ? <button type="button" onClick={props.action.onClick}>{props.action.label}</button> : null}
      </div>
      <ul className="queue-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function DevicesPanel(props: {
  pairingPayload: PairingPayload | null;
  devices: Device[];
  onRefreshCode: () => void;
  onRemoveDevice: (deviceId: string) => void;
}) {
  const trustedDevices = props.devices.filter((device) => device.device_id !== "windows-local" && device.is_trusted === 1);
  return (
    <section id="devices" className="panel devices-page">
      <div className="pairing-code">
        <span>手机输入验证码</span>
        <strong>{props.pairingPayload?.pairing_code ?? "------"}</strong>
        <small>{props.pairingPayload?.server_url ?? "等待后端服务"}</small>
      </div>
      <button type="button" onClick={props.onRefreshCode}>刷新验证码</button>
      <ul className="device-list">
        {trustedDevices.length === 0 ? <li className="empty-row">暂无已配对手机</li> : null}
        {trustedDevices.map((device) => (
          <li key={device.device_id}>
            <div>
              <strong>{device.device_name}</strong>
              <span>{formatDate(device.last_seen_at ?? device.paired_at) ?? device.device_id}</span>
            </div>
            <button type="button" className="icon-button" aria-label={`移除 ${device.device_name}`} onClick={() => props.onRemoveDevice(device.device_id)}>
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SettingsPage(props: {
  snapshot: Snapshot;
  cacheSummary: Record<string, number>;
  indexStatus: IndexStatusResponse | null;
  onUpdate: (settings: Snapshot["settings"]) => void;
  onClearDownloads: () => void;
  onProcessIndexing: () => void;
  onRebuildIndex: () => void;
}) {
  const { settings } = props.snapshot;
  const hnsw = settings.hnsw;
  const updateHnsw = (key: keyof Snapshot["settings"]["hnsw"], value: number) =>
    props.onUpdate({
      ...settings,
      hnsw: {
        ...settings.hnsw,
        [key]: value
      }
    });
  return (
    <section id="settings" className="settings-grid">
      <div className="panel">
        <h2>
          <Settings size={20} />
          连接设置
        </h2>
        <ToggleRow
          label="默认开启局域网连接"
          checked={settings.lanEnabled}
          onChange={(checked) =>
            props.onUpdate({
              ...settings,
              lanEnabled: checked,
              discoveryEnabled: checked ? true : false
            })
          }
        />
        <ToggleRow
          label="自动发现广播"
          checked={settings.discoveryEnabled}
          disabled={!settings.lanEnabled}
          onChange={(checked) => props.onUpdate({ ...settings, discoveryEnabled: checked })}
        />
        <ToggleRow
          label="自动处理索引队列"
          checked={settings.autoIndexEnabled}
          onChange={(checked) => props.onUpdate({ ...settings, autoIndexEnabled: checked })}
        />
        <p>{settings.lanEnabled ? `手机可发现：${props.snapshot.publicUrl}` : "局域网模式关闭后仅本机客户端可访问后端。"}</p>
      </div>
      <div className="panel model-panel">
        <h2>
          <MonitorCog size={20} />
          Embedding 阶段
        </h2>
        <label className="field-row">
          <span>Embedding 模型</span>
          <select
            value={settings.embeddingProviderId}
            onChange={(event) =>
              props.onUpdate({
                ...settings,
                embeddingProviderId: event.currentTarget.value as Snapshot["settings"]["embeddingProviderId"]
              })
            }
          >
            <option value="jina-v5-omni-small">jina-embeddings-v5-omni-small</option>
          </select>
        </label>
        <MetadataGrid
          items={[
            ["当前 profile", props.indexStatus?.pipeline.embedding.profile_id ?? "等待后端"],
            ["模型", props.indexStatus?.pipeline.embedding.model_name ?? "jinaai/jina-embeddings-v5-omni-small"],
            ["向量维度", String(props.indexStatus?.pipeline.embedding.dimension ?? 1024)],
            ["运行时", props.indexStatus?.pipeline.embedding.runtime ?? "sentence-transformers"]
          ]}
        />
      </div>
      <div className="panel model-panel">
        <h2>
          <Search size={20} />
          检索阶段
        </h2>
        <label className="field-row">
          <span>检索方式</span>
          <select
            value={settings.retrievalMode}
            onChange={(event) =>
              props.onUpdate({
                ...settings,
                retrievalMode: event.currentTarget.value as Snapshot["settings"]["retrievalMode"]
              })
            }
          >
            <option value="hnsw">HNSW 向量索引</option>
            <option value="full_scan">遍历 / 精确扫描</option>
          </select>
        </label>
        <p>遍历模式使用 Qdrant exact search；HNSW 模式使用 Qdrant 向量索引和下方参数。</p>
      </div>
      <div className="panel model-panel">
        <h2>
          <Boxes size={20} />
          HNSW 参数
        </h2>
        <NumberField label="m" value={hnsw.m} onChange={(value) => updateHnsw("m", value)} />
        <NumberField label="ef_construct" value={hnsw.efConstruct} onChange={(value) => updateHnsw("efConstruct", value)} />
        <NumberField label="full_scan_threshold" value={hnsw.fullScanThreshold} onChange={(value) => updateHnsw("fullScanThreshold", value)} />
        <NumberField label="hnsw_ef" value={hnsw.searchEf} onChange={(value) => updateHnsw("searchEf", value)} />
      </div>
      <div className="panel model-panel">
        <h2>
          <ListChecks size={20} />
          索引控制
        </h2>
        <MetadataGrid
          items={[
            ["资料总数", String(props.indexStatus?.asset_counts.total ?? 0)],
            ["已索引", String(props.indexStatus?.asset_counts.indexed ?? 0)],
            ["等待队列", String(props.indexStatus?.queue_counts.queued ?? 0)],
            ["失败队列", String(props.indexStatus?.queue_counts.failed ?? 0)]
          ]}
        />
        <div className="button-row">
          <button type="button" onClick={props.onProcessIndexing}>{desktopCopy.actions.process}</button>
          <button type="button" className="primary-button" onClick={props.onRebuildIndex}>重构全部索引</button>
        </div>
      </div>
      <div className="panel model-panel">
        <h2>
          <Database size={20} />
          Qdrant Collection
        </h2>
        <MetadataGrid
          items={[
            ["文本", props.indexStatus?.pipeline.collections.text ?? "等待后端"],
            ["图片语义", props.indexStatus?.pipeline.collections.image ?? "等待后端"],
            ["图片标签", props.indexStatus?.pipeline.collections.image_labels ?? "等待后端"]
          ]}
        />
      </div>
      <div className="panel">
        <h2>
          <HardDrive size={20} />
          缓存
        </h2>
        <p>{desktopCopy.cards.cache} {formatBytes(props.cacheSummary.downloaded_file ?? 0)}</p>
        <button type="button" onClick={props.onClearDownloads}>{desktopCopy.actions.clearDownloads}</button>
      </div>
      <div className="panel">
        <h2>
          <Boxes size={20} />
          数据目录
        </h2>
        <p>{props.snapshot.dataRoot}</p>
      </div>
    </section>
  );
}

function ToggleRow(props: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className={`toggle-row${props.disabled ? " disabled" : ""}`}>
      <span>{props.label}</span>
      <input type="checkbox" checked={props.checked} disabled={props.disabled} onChange={(event) => props.onChange(event.currentTarget.checked)} />
    </label>
  );
}

function NumberField(props: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="field-row">
      <span>{props.label}</span>
      <input
        type="number"
        min={1}
        value={props.value}
        onChange={(event) => {
          const value = Number(event.currentTarget.value);
          if (Number.isFinite(value) && value > 0) {
            props.onChange(Math.floor(value));
          }
        }}
      />
    </label>
  );
}

function MetadataGrid(props: { items: Array<[string, string]> }) {
  return (
    <dl className="metadata-grid">
      {props.items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatQueueItem(item: QueueItem): string {
  const id = item.upload_id ?? item.index_job_id ?? item.asset_id ?? "job";
  const label = item.file_name ?? item.job_type ?? item.asset_id ?? id;
  const progress =
    item.bytes_received !== undefined && item.size_bytes !== undefined
      ? ` / ${formatBytes(item.bytes_received)} / ${formatBytes(item.size_bytes)}`
      : "";
  const error = item.error_message ? ` / ${item.error_message}` : "";
  return `${label}: ${labelFor(desktopCopy.statusLabels, item.status)}${progress}${error}`;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatSources(sources: LibraryAsset["sources"]): string {
  if (sources.length === 0) return "未知";
  const names = sources.map((source) => `${source.device_name} ${sourceLabel(source.ref_type)}`);
  return Array.from(new Set(names)).join("、");
}

function sourceLabel(refType: string): string {
  if (refType === "source_original") return "原件";
  if (refType === "library_copy") return "资料库";
  if (refType === "cache_copy") return "缓存";
  return refType;
}

function kindLabel(kind: LibraryAsset["kind"]): string {
  return kind === "image" ? "图片" : "文档";
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function labelFor<T extends Record<string, string>>(labels: T, key: string): string {
  return labels[key as keyof T] ?? key;
}

createRoot(document.getElementById("root")!).render(<App />);
