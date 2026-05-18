import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  CircleDot,
  Database,
  FileText,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  LayoutDashboard,
  Library,
  ListChecks,
  MonitorCog,
  Network,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Trash2,
  UploadCloud,
  XCircle
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
import {
  buildConfigurationGroups,
  buildOverviewStats,
  buildSetupSteps,
  navigationPages,
  pointTotal,
  serviceRunning,
  type PageId,
  type SetupStep,
  type StepStatus
} from "./dashboardModel";
import { desktopCopy } from "./uiCopy";

type Snapshot = Awaited<ReturnType<typeof window.vibraryDesktop.getSnapshot>>;
type LibraryKind = "all" | "image" | "text";

const emptyLibraryAssets: LibraryAssetsResponse = { total_count: 0, limit: 100, offset: 0, assets: [] };

const pageIcons: Record<PageId, React.ComponentType<{ size?: number }>> = {
  overview: LayoutDashboard,
  library: Library,
  import: FolderOpen,
  search: Search,
  devices: Smartphone,
  config: Settings2,
  tasks: Activity
};

const configurationIcons: Record<ReturnType<typeof buildConfigurationGroups>[number]["id"], React.ComponentType<{ size?: number }>> = {
  connection: Network,
  embedding: MonitorCog,
  retrieval: Search,
  hnsw: SlidersHorizontal,
  indexing: ListChecks,
  qdrant: Database,
  cache: HardDrive,
  storage: Boxes
};

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [activePage, setActivePage] = useState<PageId>("overview");
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
  const setupSteps = useMemo(
    () => buildSetupSteps({ snapshot, libraryAssets, devices, uploads, indexJobs, indexStatus }),
    [snapshot, libraryAssets, devices, uploads, indexJobs, indexStatus]
  );
  const overviewStats = useMemo(
    () => buildOverviewStats({ libraryAssets, devices, uploads, indexJobs, indexStatus }),
    [libraryAssets, devices, uploads, indexJobs, indexStatus]
  );

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
    try {
      const nextSnapshot = await window.vibraryDesktop.getSnapshot();
      setSnapshot(nextSnapshot);
      await refreshBackendData(new BackendClient(nextSnapshot.backendUrl));
    } catch (error) {
      setMessage(desktopCopy.messages.requestFailed(error instanceof Error ? error.message : String(error)));
    }
  }

  async function startServices() {
    try {
      const nextSnapshot = await window.vibraryDesktop.startServices();
      setSnapshot(nextSnapshot);
      await refreshBackendData(new BackendClient(nextSnapshot.backendUrl));
      setMessage("服务已启动");
    } catch (error) {
      setMessage(desktopCopy.messages.requestFailed(error instanceof Error ? error.message : String(error)));
    }
  }

  async function stopServices() {
    try {
      setSnapshot(await window.vibraryDesktop.stopServices());
      setMessage("服务已停止");
    } catch (error) {
      setMessage(desktopCopy.messages.requestFailed(error instanceof Error ? error.message : String(error)));
    }
  }

  async function chooseFiles() {
    const files = await window.vibraryDesktop.selectImportFiles();
    setSelectedFiles(files);
    if (files.length === 0 || !client) return;
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

  async function chooseFolder() {
    const folder = await window.vibraryDesktop.selectImportFolder();
    setSelectedFolder(folder);
    if (!folder || !client) return;
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
      setMessage(desktopCopy.messages.libraryRefreshed(nextAssets.total_count));
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
    setMessage(desktopCopy.messages.deviceRemoved(deviceId));
  }

  async function updateSettings(settings: Snapshot["settings"]) {
    try {
      const nextSnapshot = await window.vibraryDesktop.updateSettings(settings);
      setSnapshot(nextSnapshot);
      await refreshBackendData(new BackendClient(nextSnapshot.backendUrl));
      setMessage(desktopCopy.messages.settingsSaved);
    } catch (error) {
      setMessage(desktopCopy.messages.requestFailed(error instanceof Error ? error.message : String(error)));
    }
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
    setMessage(desktopCopy.messages.rebuildQueued(rebuilt.queued_count));
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

  function handleStepAction(step: SetupStep) {
    if (step.actionLabel === "启动服务") {
      void startServices();
      return;
    }
    if (step.actionLabel === "处理索引") {
      void processIndexing();
      return;
    }
    if (step.actionLabel === "开始搜索") {
      setActivePage("search");
      return;
    }
    setActivePage(step.targetPage);
  }

  const currentPage = navigationPages.find((page) => page.id === activePage) ?? navigationPages[0];
  const backendRunning = serviceRunning(snapshot, "backend");
  const qdrantRunning = serviceRunning(snapshot, "qdrant");

  return (
    <main className="app-shell">
      <aside className="navigation-drawer">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span className="brand-dot blue" />
            <span className="brand-dot red" />
            <span className="brand-dot yellow" />
            <span className="brand-dot green" />
          </div>
          <div>
            <strong>Vibrary</strong>
            <span>{desktopCopy.brand.subtitle}</span>
          </div>
        </div>

        <nav aria-label="主导航">
          {navigationPages.map(({ id, label }) => {
            const Icon = pageIcons[id];
            return (
              <button
                key={id}
                type="button"
                className={`nav-item${activePage === id ? " active" : ""}`}
                onClick={() => setActivePage(id)}
              >
                <Icon size={20} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="drawer-footer">
          <ServicePill label="Backend" active={backendRunning} />
          <ServicePill label="Qdrant" active={qdrantRunning} />
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <span className="eyebrow">Vibrary Desktop</span>
            <h1>{currentPage.label}</h1>
            <p>{currentPage.description}</p>
          </div>
          <div className="topbar-actions">
            <button type="button" className="outlined-button" onClick={refresh}>{desktopCopy.actions.refresh}</button>
            <button type="button" className="filled-button" onClick={startServices}>{desktopCopy.actions.start}</button>
            <button type="button" className="text-button" onClick={stopServices}>{desktopCopy.actions.stop}</button>
          </div>
        </header>

        {activePage === "overview" ? (
          <OverviewPage
            snapshot={snapshot}
            setupSteps={setupSteps}
            stats={overviewStats}
            indexStatus={indexStatus}
            onStepAction={handleStepAction}
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
          <SearchPage client={client} query={query} results={results} onQueryChange={setQuery} onSearch={runSearch} />
        ) : null}
        {activePage === "devices" ? (
          <DevicesPage
            pairingPayload={pairingPayload}
            devices={devices}
            snapshot={snapshot}
            onRefreshCode={() => refreshPairingPayload()}
            onRemoveDevice={removeDevice}
          />
        ) : null}
        {activePage === "config" && snapshot ? (
          <ConfigPage
            snapshot={snapshot}
            cacheSummary={cacheSummary}
            indexStatus={indexStatus}
            onUpdate={updateSettings}
            onClearDownloads={clearDownloads}
            onProcessIndexing={processIndexing}
            onRebuildIndex={rebuildIndex}
          />
        ) : null}
        {activePage === "tasks" ? (
          <TasksPage uploads={uploads} indexJobs={indexJobs} onProcessIndexing={processIndexing} />
        ) : null}

        <footer className="message-bar" role="status">{message}</footer>
      </section>
    </main>
  );
}

function OverviewPage(props: {
  snapshot: Snapshot | null;
  setupSteps: SetupStep[];
  stats: ReturnType<typeof buildOverviewStats>;
  indexStatus: IndexStatusResponse | null;
  onStepAction: (step: SetupStep) => void;
  onNavigate: (page: PageId) => void;
}) {
  const nextStep = props.setupSteps.find((step) => !["done", "optional"].includes(step.status));
  return (
    <div className="page-stack overview-layout">
      <section className="hero-panel">
        <div>
          <span className="eyebrow">{desktopCopy.overview.title}</span>
          <h2>{nextStep ? nextStep.title : "系统已经准备好"}</h2>
          <p>{nextStep ? nextStep.detail : "核心服务、资料、索引和搜索链路都已经进入可用状态。"}</p>
        </div>
        {nextStep ? (
          <button type="button" className="filled-button hero-action" onClick={() => props.onStepAction(nextStep)}>
            {nextStep.actionLabel ?? desktopCopy.overview.nextAction}
          </button>
        ) : (
          <button type="button" className="filled-button hero-action" onClick={() => props.onNavigate("search")}>
            开始搜索
          </button>
        )}
      </section>

      <section className="setup-grid" aria-label="可用性检查">
        {props.setupSteps.map((step) => (
          <SetupStepCard key={step.id} step={step} onAction={props.onStepAction} />
        ))}
      </section>

      <section className="stats-grid" aria-label="系统统计">
        {props.stats.map((stat) => (
          <Metric key={stat.id} stat={stat} />
        ))}
      </section>

      <section className="insight-band">
        <InfoBlock title="当前后端" value={props.snapshot?.backendUrl ?? "等待服务启动"} />
        <InfoBlock title="局域网地址" value={props.snapshot?.settings.lanEnabled ? props.snapshot.publicUrl : "局域网已关闭"} />
        <InfoBlock title="检索模式" value={props.indexStatus?.pipeline.retrieval.mode === "full_scan" ? "遍历 / exact search" : "HNSW 向量索引"} />
        <InfoBlock title="向量点数" value={String(pointTotal(props.indexStatus))} />
      </section>
    </div>
  );
}

function SetupStepCard(props: { step: SetupStep; onAction: (step: SetupStep) => void }) {
  const Icon = statusIcon(props.step.status);
  return (
    <article className={`setup-card status-${props.step.status}`}>
      <div className="setup-card-header">
        <span className="status-icon"><Icon size={20} /></span>
        <StatusChip status={props.step.status} />
      </div>
      <h3>{props.step.title}</h3>
      <p>{props.step.detail}</p>
      {props.step.actionLabel ? (
        <button type="button" className="tonal-button" onClick={() => props.onAction(props.step)}>
          {props.step.actionLabel}
        </button>
      ) : null}
    </article>
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
      <section className="toolbar-band">
        <div className="search-field compact">
          <Search size={18} />
          <input value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} placeholder={desktopCopy.libraryCenter.searchPlaceholder} />
        </div>
        <SegmentedControl
          value={props.kind}
          options={[
            ["all", desktopCopy.actions.allTypes],
            ["image", desktopCopy.actions.imagesOnly],
            ["text", desktopCopy.actions.textOnly]
          ]}
          onChange={(value) => props.onKindChange(value as LibraryKind)}
        />
        <button type="button" className="filled-button" onClick={props.onRefresh}>{desktopCopy.actions.refreshLibrary}</button>
      </section>
      {props.libraryAssets.assets.length === 0 ? (
        <EmptyState text={desktopCopy.libraryCenter.empty} />
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
        {thumbnailUrl ? <img src={thumbnailUrl} alt="" /> : props.asset.kind === "image" ? <ImageIcon size={28} /> : <FileText size={28} />}
      </div>
      <div className="asset-body">
        <div>
          <h3>{props.asset.title}</h3>
          <p>{kindLabel(props.asset.kind)} / {props.asset.mime_type ?? "application/octet-stream"} / {formatBytes(props.asset.size_bytes)}</p>
        </div>
        <dl className="compact-meta">
          <div>
            <dt>{desktopCopy.libraryCenter.source}</dt>
            <dd>{formatSources(props.asset.sources)}</dd>
          </div>
          <div>
            <dt>{desktopCopy.libraryCenter.indexStatus}</dt>
            <dd>{labelFor(desktopCopy.statusLabels, props.asset.index_status)}</dd>
          </div>
        </dl>
        {contentUrl ? <a className="text-link" href={contentUrl} target="_blank" rel="noreferrer">{desktopCopy.actions.open}</a> : null}
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
    <div className="page-stack">
      <section className="action-band import-band">
        <div>
          <span className="eyebrow">Windows Library Intake</span>
          <h2>{desktopCopy.library.title}</h2>
          <p>{desktopCopy.library.hint}</p>
        </div>
        <div className="button-row">
          <button type="button" className="filled-button" onClick={props.onChooseFiles}>
            <UploadCloud size={18} />
            {desktopCopy.actions.chooseFiles}
          </button>
          <button type="button" className="outlined-button" onClick={props.onChooseFolder}>
            <FolderOpen size={18} />
            {desktopCopy.actions.chooseFolder}
          </button>
        </div>
      </section>
      <section className="stats-grid">
        <Metric stat={{ id: "assets", label: desktopCopy.library.filesSelected, value: props.selectedFiles.length, accent: "blue" }} />
        <Metric stat={{ id: "indexJobs", label: desktopCopy.library.folderSelected, value: props.selectedFolder ? 1 : 0, accent: "yellow" }} />
        <Metric stat={{ id: "indexed", label: desktopCopy.library.imported, value: props.importSummary?.imported_count ?? 0, accent: "green" }} />
        <Metric stat={{ id: "uploads", label: desktopCopy.library.duplicates, value: props.importSummary?.duplicate_count ?? 0, accent: "yellow" }} />
        <Metric stat={{ id: "qdrantPoints", label: desktopCopy.library.indexQueued, value: props.importSummary?.index_queued_count ?? 0, accent: "green" }} />
      </section>
    </div>
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
    <div className="page-stack">
      <section className="search-command">
        <div className="search-field">
          <Search size={22} />
          <input value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} placeholder={desktopCopy.search.placeholder} />
          <button type="button" className="filled-button" onClick={props.onSearch}>{desktopCopy.actions.search}</button>
        </div>
      </section>
      <section className="result-list">
        {props.results.length === 0 ? <EmptyState text={desktopCopy.search.empty} /> : null}
        {props.results.map((result) => {
          const thumbnailUrl = props.client?.assetUrl(result.thumbnail_url);
          const openUrl = props.client?.assetUrl(result.delivery.download_url ?? result.delivery.stream_url ?? null);
          return (
            <article className="result-row" key={result.asset_id}>
              <div className={`result-thumb ${thumbnailUrl ? "has-image" : ""}`}>
                {thumbnailUrl ? <img src={thumbnailUrl} alt="" /> : <FileText size={22} />}
              </div>
              <div>
                <h3>{result.title}</h3>
                <p>{result.snippet ?? "无摘要"}</p>
                <div className="result-tags">
                  <span>{desktopCopy.search.score}: {result.score.toFixed(3)}</span>
                  <span>{desktopCopy.search.matchedBy}: {result.matched_by.join(", ")}</span>
                  <span>{labelFor(desktopCopy.deliveryLabels, result.delivery.mode)}</span>
                </div>
              </div>
              {openUrl ? <a className="text-link" href={openUrl} target="_blank" rel="noreferrer">{desktopCopy.actions.open}</a> : null}
            </article>
          );
        })}
      </section>
    </div>
  );
}

function DevicesPage(props: {
  pairingPayload: PairingPayload | null;
  devices: Device[];
  snapshot: Snapshot | null;
  onRefreshCode: () => void;
  onRemoveDevice: (deviceId: string) => void;
}) {
  const trustedDevices = props.devices.filter((device) => device.device_id !== "windows-local" && device.is_trusted === 1);
  return (
    <div className="page-stack device-layout">
      <section className="pairing-panel">
        <div>
          <span className="eyebrow">Pairing Code</span>
          <h2>手机输入验证码</h2>
          <p>{props.snapshot?.settings.lanEnabled ? "手机自动发现电脑后，输入下方验证码即可加入资料组。" : "局域网模式关闭时手机无法加入，请到配置中心开启。"}</p>
        </div>
        <strong className="pairing-code">{props.pairingPayload?.pairing_code ?? "------"}</strong>
        <small>{props.pairingPayload?.server_url ?? "等待后端服务"}</small>
        <button type="button" className="outlined-button" onClick={props.onRefreshCode}>刷新验证码</button>
      </section>
      <section className="device-list">
        {trustedDevices.length === 0 ? <EmptyState text="暂无已配对手机" /> : null}
        {trustedDevices.map((device) => (
          <article className="device-row" key={device.device_id}>
            <div className="device-avatar"><Smartphone size={20} /></div>
            <div>
              <h3>{device.device_name}</h3>
              <p>{formatDate(device.last_seen_at ?? device.paired_at) ?? device.device_id}</p>
            </div>
            <button type="button" className="icon-button" aria-label={`移除 ${device.device_name}`} onClick={() => props.onRemoveDevice(device.device_id)}>
              <Trash2 size={16} />
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}

function ConfigPage(props: {
  snapshot: Snapshot;
  cacheSummary: Record<string, number>;
  indexStatus: IndexStatusResponse | null;
  onUpdate: (settings: Snapshot["settings"]) => void;
  onClearDownloads: () => void;
  onProcessIndexing: () => void;
  onRebuildIndex: () => void;
}) {
  const [draft, setDraft] = useState(props.snapshot.settings);
  useEffect(() => {
    setDraft(props.snapshot.settings);
  }, [props.snapshot.settings]);

  const updateHnsw = (key: keyof Snapshot["settings"]["hnsw"], value: number) => {
    setDraft((current) => ({ ...current, hnsw: { ...current.hnsw, [key]: value } }));
  };

  return (
    <div className="config-layout">
      <ConfigSection groupId="connection">
        <ToggleRow
          label={desktopCopy.config.lanEnabled}
          checked={draft.lanEnabled}
          onChange={(checked) => setDraft({ ...draft, lanEnabled: checked, discoveryEnabled: checked ? draft.discoveryEnabled : false })}
        />
        <ToggleRow
          label={desktopCopy.config.discoveryEnabled}
          checked={draft.discoveryEnabled}
          disabled={!draft.lanEnabled}
          onChange={(checked) => setDraft({ ...draft, discoveryEnabled: checked })}
        />
        <ToggleRow label={desktopCopy.config.autoIndexEnabled} checked={draft.autoIndexEnabled} onChange={(checked) => setDraft({ ...draft, autoIndexEnabled: checked })} />
        <MetadataGrid
          items={[
            ["后端", props.snapshot.backendUrl],
            ["局域网", draft.lanEnabled ? props.snapshot.publicUrl : "关闭"],
            ["发现广播", props.snapshot.discovery.running ? `运行中 / ${props.snapshot.discovery.port}` : "未运行"]
          ]}
        />
      </ConfigSection>

      <ConfigSection groupId="embedding">
        <label className="field-row">
          <span>{desktopCopy.config.embeddingProvider}</span>
          <select value={draft.embeddingProviderId} onChange={(event) => setDraft({ ...draft, embeddingProviderId: event.currentTarget.value as Snapshot["settings"]["embeddingProviderId"] })}>
            <option value="jina-v5-omni-small">jina-embeddings-v5-omni-small</option>
          </select>
        </label>
        <MetadataGrid
          items={[
            ["模型", props.indexStatus?.pipeline.embedding.model_name ?? "jinaai/jina-embeddings-v5-omni-small"],
            ["Profile", props.indexStatus?.pipeline.embedding.profile_id ?? "等待后端"],
            ["维度", String(props.indexStatus?.pipeline.embedding.dimension ?? 1024)],
            ["运行时", props.indexStatus?.pipeline.embedding.runtime ?? "sentence-transformers"]
          ]}
        />
      </ConfigSection>

      <ConfigSection groupId="retrieval">
        <label className="field-row">
          <span>{desktopCopy.config.retrievalMode}</span>
          <select value={draft.retrievalMode} onChange={(event) => setDraft({ ...draft, retrievalMode: event.currentTarget.value as Snapshot["settings"]["retrievalMode"] })}>
            <option value="hnsw">{desktopCopy.config.hnswMode}</option>
            <option value="full_scan">{desktopCopy.config.fullScanMode}</option>
          </select>
        </label>
        <p>{draft.retrievalMode === "hnsw" ? "使用 Qdrant HNSW 搜索参数查询向量索引。" : "使用 Qdrant exact search 遍历当前 collection。"}</p>
      </ConfigSection>

      <ConfigSection groupId="hnsw">
        <NumberField label="m" value={draft.hnsw.m} onChange={(value) => updateHnsw("m", value)} />
        <NumberField label="ef_construct" value={draft.hnsw.efConstruct} onChange={(value) => updateHnsw("efConstruct", value)} />
        <NumberField label="full_scan_threshold" value={draft.hnsw.fullScanThreshold} onChange={(value) => updateHnsw("fullScanThreshold", value)} />
        <NumberField label="hnsw_ef" value={draft.hnsw.searchEf} onChange={(value) => updateHnsw("searchEf", value)} />
      </ConfigSection>

      <ConfigSection groupId="indexing">
        <MetadataGrid
          items={[
            ["资料总数", String(props.indexStatus?.asset_counts.total ?? 0)],
            ["已索引", String(props.indexStatus?.asset_counts.indexed ?? 0)],
            ["等待队列", String(props.indexStatus?.queue_counts.queued ?? 0)],
            ["失败队列", String(props.indexStatus?.queue_counts.failed ?? 0)]
          ]}
        />
        <p>{desktopCopy.config.rebuildHint}</p>
        <div className="button-row">
          <button type="button" className="outlined-button" onClick={props.onProcessIndexing}>{desktopCopy.actions.process}</button>
          <button type="button" className="tonal-button" onClick={props.onRebuildIndex}>{desktopCopy.actions.rebuildIndex}</button>
        </div>
      </ConfigSection>

      <ConfigSection groupId="qdrant">
        <p>{desktopCopy.config.qdrantLocalOnly}</p>
        <MetadataGrid
          items={[
            ["Qdrant URL", props.snapshot.qdrantUrl],
            ["文本 collection", props.indexStatus?.pipeline.collections.text ?? "等待后端"],
            ["图片语义 collection", props.indexStatus?.pipeline.collections.image ?? "等待后端"],
            ["图片标签 collection", props.indexStatus?.pipeline.collections.image_labels ?? "等待后端"],
            ["points", String(pointTotal(props.indexStatus))]
          ]}
        />
      </ConfigSection>

      <ConfigSection groupId="cache">
        <MetadataGrid items={[["下载缓存", formatBytes(props.cacheSummary.downloaded_file ?? 0)], ["临时缓存", formatBytes(props.cacheSummary.upload_temp ?? 0)]]} />
        <button type="button" className="outlined-button" onClick={props.onClearDownloads}>{desktopCopy.actions.clearDownloads}</button>
      </ConfigSection>

      <ConfigSection groupId="storage">
        <MetadataGrid items={[["模式", props.snapshot.dataMode === "portable" ? "便携模式" : "本机模式"], ["目录", props.snapshot.dataRoot]]} />
      </ConfigSection>

      <section className="config-save-band">
        <button type="button" className="filled-button" onClick={() => props.onUpdate(draft)}>{desktopCopy.actions.saveSettings}</button>
      </section>
    </div>
  );
}

function TasksPage(props: { uploads: QueueItem[]; indexJobs: QueueItem[]; onProcessIndexing: () => void }) {
  return (
    <section className="task-grid">
      <QueuePanel title={desktopCopy.queues.uploadTitle} icon={<UploadCloud size={20} />} items={props.uploads} empty={desktopCopy.queues.noUploads} />
      <QueuePanel
        title={desktopCopy.queues.indexTitle}
        icon={<ListChecks size={20} />}
        items={props.indexJobs}
        empty={desktopCopy.queues.noIndexJobs}
        action={{ label: desktopCopy.actions.process, onClick: props.onProcessIndexing }}
      />
    </section>
  );
}

function QueuePanel(props: { title: string; icon: React.ReactNode; items: QueueItem[]; empty: string; action?: { label: string; onClick: () => void } }) {
  return (
    <section className="queue-panel">
      <div className="section-heading">
        <h2>{props.icon}{props.title}</h2>
        {props.action ? <button type="button" className="outlined-button" onClick={props.action.onClick}>{props.action.label}</button> : null}
      </div>
      <div className="queue-list">
        {props.items.length === 0 ? <EmptyState text={props.empty} /> : null}
        {props.items.map((item) => (
          <article key={item.upload_id ?? item.index_job_id ?? item.asset_id ?? item.status} className="queue-row">
            <div>
              <h3>{item.file_name ?? item.job_type ?? item.asset_id ?? item.upload_id ?? item.index_job_id}</h3>
              <p>{labelFor(desktopCopy.statusLabels, item.status)}{item.error_message ? ` / ${item.error_message}` : ""}</p>
            </div>
            {item.bytes_received !== undefined && item.size_bytes !== undefined ? <span>{formatBytes(item.bytes_received)} / {formatBytes(item.size_bytes)}</span> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function ConfigSection(props: { groupId: ReturnType<typeof buildConfigurationGroups>[number]["id"]; children: React.ReactNode }) {
  const group = buildConfigurationGroups().find((item) => item.id === props.groupId)!;
  const Icon = configurationIcons[props.groupId];
  return (
    <section className="config-section">
      <div className="section-heading">
        <h2><Icon size={20} />{group.title}</h2>
        <p>{group.description}</p>
      </div>
      <div className="section-body">{props.children}</div>
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
          if (Number.isFinite(value) && value > 0) props.onChange(Math.floor(value));
        }}
      />
    </label>
  );
}

function SegmentedControl(props: { value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return (
    <div className="segmented-control" aria-label="资料类型">
      {props.options.map(([value, label]) => (
        <button key={value} type="button" className={props.value === value ? "active" : ""} onClick={() => props.onChange(value)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function StatusChip(props: { status: StepStatus }) {
  return <span className={`status-chip chip-${props.status}`}>{statusLabel(props.status)}</span>;
}

function Metric(props: { stat: { id?: string; label: string; value: number | string; accent: "blue" | "red" | "yellow" | "green" } }) {
  return (
    <article className={`metric-card accent-${props.stat.accent}`}>
      <strong>{props.stat.value}</strong>
      <span>{props.stat.label}</span>
    </article>
  );
}

function InfoBlock(props: { title: string; value: string }) {
  return (
    <div className="info-block">
      <span>{props.title}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function ServicePill(props: { label: string; active: boolean }) {
  return (
    <span className={`service-pill${props.active ? " active" : ""}`}>
      <span />
      {props.label}
    </span>
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

function EmptyState(props: { text: string }) {
  return <div className="empty-state">{props.text}</div>;
}

function statusIcon(status: StepStatus) {
  if (status === "done") return CheckCircle2;
  if (status === "error") return XCircle;
  if (status === "warning") return AlertTriangle;
  if (status === "optional") return CircleDot;
  return CircleDot;
}

function statusLabel(status: StepStatus): string {
  if (status === "done") return desktopCopy.status.ready;
  if (status === "error") return desktopCopy.status.error;
  if (status === "warning") return desktopCopy.status.warning;
  if (status === "optional") return desktopCopy.status.optional;
  return desktopCopy.status.action;
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
