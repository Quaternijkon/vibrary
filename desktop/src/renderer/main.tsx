import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Boxes,
  Database,
  DownloadCloud,
  HardDrive,
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
import { BackendClient, type Device, type ImportSummary, type PairingPayload, type QueueItem, type SearchResult } from "./backendClient";
import { loadBackendDashboardData } from "./backendData";
import { desktopCopy } from "./uiCopy";
import "./styles.css";

type Snapshot = Awaited<ReturnType<typeof window.vibraryDesktop.getSnapshot>>;

const sections = [
  { ...desktopCopy.sections[0], icon: Activity },
  { ...desktopCopy.sections[1], icon: Library },
  { ...desktopCopy.sections[2], icon: UploadCloud },
  { ...desktopCopy.sections[3], icon: ListChecks },
  { ...desktopCopy.sections[4], icon: Search },
  { ...desktopCopy.sections[5], icon: Smartphone },
  { ...desktopCopy.sections[6], icon: HardDrive },
  { ...desktopCopy.sections[7], icon: Boxes },
  { ...desktopCopy.sections[8], icon: Settings }
] as const;

function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [uploads, setUploads] = useState<QueueItem[]>([]);
  const [indexJobs, setIndexJobs] = useState<QueueItem[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [pairingPayload, setPairingPayload] = useState<PairingPayload | null>(null);
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
        <nav aria-label="Desktop sections">
          {sections.map(({ id, label, icon: Icon }) => (
            <a key={id} href={`#${id}`}>
              <Icon size={18} />
              <span>{label}</span>
            </a>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{desktopCopy.topbar.title}</h1>
            <p>{snapshot ? `${runningCount}/2 ${desktopCopy.status.running} · ${snapshot.dataMode}` : desktopCopy.topbar.loading}</p>
          </div>
          <div className="actions">
            <button type="button" onClick={refresh}>{desktopCopy.actions.refresh}</button>
            <button type="button" className="primary-button" onClick={startServices}>{desktopCopy.actions.start}</button>
            <button type="button" onClick={stopServices}>{desktopCopy.actions.stop}</button>
          </div>
        </header>

        <section id="status" className="status-grid">
          <StatusTile title="Qdrant" detail={desktopCopy.status.qdrantDetail} status={qdrant?.running ? "running" : "stopped"} label={serviceStatusLabel(qdrant)} />
          <StatusTile title="Backend" detail={snapshot?.backendUrl ?? "127.0.0.1:8765"} status={backend?.running ? "running" : "stopped"} label={serviceStatusLabel(backend)} />
          <StatusTile
            title={desktopCopy.status.lanApi}
            detail={snapshot?.settings.lanEnabled ? snapshot.publicUrl : "仅允许本机访问"}
            status={snapshot?.settings.lanEnabled ? "running" : "stopped"}
            label={snapshot?.settings.lanEnabled ? "已开启" : "已关闭"}
          />
          <StatusTile title={desktopCopy.status.dataRoot} detail={snapshot?.dataRoot ?? "Resolving"} status={snapshot?.dataMode ?? "local"} label={snapshot?.dataMode ?? "local"} />
        </section>

        <section id="library" className="panel split">
          <div>
            <h2>{desktopCopy.library.title}</h2>
            <p>{desktopCopy.library.hint}</p>
            <div className="button-row">
              <button type="button" className="primary-button" onClick={chooseFiles}>{desktopCopy.actions.chooseFiles}</button>
              <button type="button" onClick={chooseFolder}>{desktopCopy.actions.chooseFolder}</button>
            </div>
          </div>
          <div className="import-preview">
            <Metric label={desktopCopy.library.filesSelected} value={selectedFiles.length} />
            <Metric label={desktopCopy.library.folderSelected} value={selectedFolder ? 1 : 0} />
            <Metric label={desktopCopy.library.imported} value={importSummary?.imported_count ?? 0} />
            <Metric label={desktopCopy.library.duplicates} value={importSummary?.duplicate_count ?? 0} />
            <Metric label={desktopCopy.library.indexQueued} value={importSummary?.index_queued_count ?? 0} />
          </div>
        </section>

        <section className="queue-grid">
          <QueuePanel id="uploads" title={desktopCopy.queues.uploadTitle} icon={<UploadCloud size={18} />} items={uploads.map(formatQueueItem)} empty={desktopCopy.queues.noUploads} />
          <QueuePanel
            id="index"
            title={desktopCopy.queues.indexTitle}
            icon={<ListChecks size={18} />}
            items={indexJobs.map(formatQueueItem)}
            empty={desktopCopy.queues.noIndexJobs}
            action={{ label: desktopCopy.actions.process, onClick: processIndexing }}
          />
        </section>

        <section id="search" className="panel search-panel">
          <h2>{desktopCopy.search.title}</h2>
          <div className="search-box">
            <Search size={20} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={desktopCopy.search.placeholder} />
            <button type="button" className="primary-button" onClick={runSearch}>{desktopCopy.actions.search}</button>
          </div>
          <ul className="result-list">
            {results.length === 0 ? <li className="empty-row">{desktopCopy.search.empty}</li> : null}
            {results.map((result) => (
              <li key={result.asset_id}>
                <strong>{result.title}</strong>
                <span>{labelFor(desktopCopy.deliveryLabels, result.delivery.mode)} · {labelFor(desktopCopy.actionLabels, result.availability.requesting_device.recommended_action)} · {result.score.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card-grid">
          <DevicesPanel
            pairingPayload={pairingPayload}
            devices={devices}
            onRefreshCode={() => refreshPairingPayload()}
            onRemoveDevice={removeDevice}
          />
          <InfoPanel id="cache" icon={<DownloadCloud size={20} />} title={desktopCopy.sections[6].label} body={`${desktopCopy.cards.cache} ${formatBytes(cacheSummary.downloaded_file ?? 0)}`} action={{ label: desktopCopy.actions.clearDownloads, onClick: clearDownloads }} />
          <InfoPanel id="models" icon={<MonitorCog size={20} />} title={desktopCopy.sections[7].label} body={desktopCopy.cards.models} />
          {snapshot ? <SettingsPanel snapshot={snapshot} onUpdate={updateSettings} /> : null}
        </section>
        <footer className="message-bar">{message}</footer>
      </section>
    </main>
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
      <h2>
        {props.icon}
        {props.title}
      </h2>
      {props.action ? <button type="button" onClick={props.action.onClick}>{props.action.label}</button> : null}
      <ul className="queue-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function InfoPanel(props: { id: string; icon: React.ReactNode; title: string; body: string; action?: { label: string; onClick: () => void } }) {
  return (
    <section id={props.id} className="info-panel">
      <h2>
        {props.icon}
        {props.title}
      </h2>
      <p>{props.body}</p>
      {props.action ? <button type="button" onClick={props.action.onClick}>{props.action.label}</button> : null}
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
    <section id="devices" className="info-panel">
      <h2>
        <Laptop size={20} />
        {desktopCopy.sections[5].label}
      </h2>
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
              <span>{device.last_seen_at ?? device.paired_at ?? device.device_id}</span>
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

function SettingsPanel(props: { snapshot: Snapshot; onUpdate: (settings: Snapshot["settings"]) => void }) {
  const { settings } = props.snapshot;
  return (
    <section id="settings" className="info-panel">
      <h2>
        <Settings size={20} />
        {desktopCopy.sections[8].label}
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

function formatQueueItem(item: QueueItem): string {
  const id = item.upload_id ?? item.index_job_id ?? item.asset_id ?? "job";
  const label = item.file_name ?? item.job_type ?? item.asset_id ?? id;
  const progress =
    item.bytes_received !== undefined && item.size_bytes !== undefined
      ? ` · ${formatBytes(item.bytes_received)} / ${formatBytes(item.size_bytes)}`
      : "";
  const error = item.error_message ? ` · ${item.error_message}` : "";
  return `${label}: ${labelFor(desktopCopy.statusLabels, item.status)}${progress}${error}`;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function labelFor<T extends Record<string, string>>(labels: T, key: string): string {
  return labels[key as keyof T] ?? key;
}

createRoot(document.getElementById("root")!).render(<App />);
