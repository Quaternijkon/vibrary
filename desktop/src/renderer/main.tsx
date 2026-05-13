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
  UploadCloud
} from "lucide-react";
import { BackendClient, type ImportSummary, type QueueItem, type SearchResult } from "./backendClient";
import "./styles.css";

type Snapshot = Awaited<ReturnType<typeof window.vibraryDesktop.getSnapshot>>;

const sections = [
  { id: "status", label: "Service Status", icon: Activity },
  { id: "library", label: "Library Import", icon: Library },
  { id: "uploads", label: "Upload Queue", icon: UploadCloud },
  { id: "index", label: "Index Queue", icon: ListChecks },
  { id: "search", label: "Search", icon: Search },
  { id: "devices", label: "Devices", icon: Smartphone },
  { id: "cache", label: "Cache", icon: HardDrive },
  { id: "models", label: "Models", icon: Boxes },
  { id: "settings", label: "Settings", icon: Settings }
] as const;

function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [uploads, setUploads] = useState<QueueItem[]>([]);
  const [indexJobs, setIndexJobs] = useState<QueueItem[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [cacheSummary, setCacheSummary] = useState<Record<string, number>>({});
  const [message, setMessage] = useState("Ready");

  const client = useMemo(() => (snapshot ? new BackendClient(snapshot.backendUrl) : null), [snapshot]);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const nextSnapshot = await window.vibraryDesktop.getSnapshot();
    setSnapshot(nextSnapshot);
    await refreshBackendData(new BackendClient(nextSnapshot.backendUrl));
  }

  async function startServices() {
    const nextSnapshot = await window.vibraryDesktop.startServices();
    setSnapshot(nextSnapshot);
    await refreshBackendData(new BackendClient(nextSnapshot.backendUrl));
  }

  async function stopServices() {
    setSnapshot(await window.vibraryDesktop.stopServices());
  }

  async function chooseFiles() {
    const files = await window.vibraryDesktop.selectImportFiles();
    setSelectedFiles(files);
    if (files.length > 0 && client) {
      setImportSummary(await client.importFiles(files));
      await refreshBackendData(client);
      setMessage(`Imported ${files.length} selected file(s)`);
    }
  }

  async function chooseFolder() {
    const folder = await window.vibraryDesktop.selectImportFolder();
    setSelectedFolder(folder);
    if (folder && client) {
      setImportSummary(await client.importFolder(folder));
      await refreshBackendData(client);
      setMessage("Folder import queued");
    }
  }

  async function refreshBackendData(activeClient = client) {
    if (!activeClient) return;
    const [nextUploads, nextIndexJobs, nextCache] = await Promise.all([
      activeClient.uploadsQueue().catch(() => []),
      activeClient.indexingQueue().catch(() => []),
      activeClient.cacheSummary().catch(() => ({}))
    ]);
    setUploads(nextUploads);
    setIndexJobs(nextIndexJobs);
    setCacheSummary(nextCache);
  }

  async function processIndexing() {
    if (!client) return;
    const processed = await client.processIndexing();
    await refreshBackendData(client);
    setMessage(`Indexed ${processed.indexed_count}, failed ${processed.failed_count}`);
  }

  async function runSearch() {
    if (!client || query.trim().length === 0) return;
    const response = await client.search(query.trim());
    setResults(response.results);
    setMessage(`${response.results.length} result(s)`);
  }

  async function clearDownloads() {
    if (!client) return;
    const cleared = await client.clearDownloads();
    await refreshBackendData(client);
    setMessage(`Deleted ${cleared.deleted_files} cached download file(s)`);
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
            <span>Windows node</span>
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
            <h1>Local Library Control</h1>
            <p>{snapshot ? `${runningCount}/2 services running from ${snapshot.dataMode} data` : "Loading services"}</p>
          </div>
          <div className="actions">
            <button type="button" onClick={refresh}>Refresh</button>
            <button type="button" onClick={startServices}>Start</button>
            <button type="button" onClick={stopServices}>Stop</button>
          </div>
        </header>

        <section id="status" className="panel status-grid">
          <StatusTile title="Qdrant" detail="127.0.0.1:6333" status={qdrant?.running ? "running" : "stopped"} />
          <StatusTile title="Backend" detail={snapshot?.backendUrl ?? "127.0.0.1:8765"} status={backend?.running ? "running" : "stopped"} />
          <StatusTile title="LAN API" detail="Backend sidecar can bind to LAN with bearer-token auth" status="running" />
          <StatusTile title="Data Root" detail={snapshot?.dataRoot ?? "Resolving"} status={snapshot?.dataMode ?? "local"} />
        </section>

        <section id="library" className="panel split">
          <div>
            <h2>Library Import</h2>
            <p>Files and folders are submitted to the backend import queue.</p>
            <div className="button-row">
              <button type="button" onClick={chooseFiles}>Choose Files</button>
              <button type="button" onClick={chooseFolder}>Choose Folder</button>
            </div>
          </div>
          <div className="import-preview">
            <Metric label="Files selected" value={selectedFiles.length} />
            <Metric label="Folder selected" value={selectedFolder ? 1 : 0} />
            <Metric label="Imported" value={importSummary?.imported_count ?? 0} />
            <Metric label="Duplicates" value={importSummary?.duplicate_count ?? 0} />
          </div>
        </section>

        <section className="queue-grid">
          <QueuePanel id="uploads" title="Upload Queue" icon={<UploadCloud size={18} />} items={uploads.map(formatQueueItem)} empty="No upload jobs" />
          <QueuePanel
            id="index"
            title="Index Queue"
            icon={<ListChecks size={18} />}
            items={indexJobs.map(formatQueueItem)}
            empty="No index jobs"
            action={{ label: "Process", onClick: processIndexing }}
          />
        </section>

        <section id="search" className="panel search-panel">
          <h2>Search</h2>
          <div className="search-box">
            <Search size={20} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search local assets" />
            <button type="button" onClick={runSearch}>Search</button>
          </div>
          <ul className="result-list">
            {results.map((result) => (
              <li key={result.asset_id}>
                <strong>{result.title}</strong>
                <span>{result.delivery.mode} · {result.availability.requesting_device.recommended_action} · {result.score.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card-grid">
          <InfoPanel id="devices" icon={<Laptop size={20} />} title="Devices" body="Pairing QR, trusted Android clients, and last-seen status." />
          <InfoPanel id="cache" icon={<DownloadCloud size={20} />} title="Cache" body={`Downloads ${formatBytes(cacheSummary.downloaded_file ?? 0)}`} action={{ label: "Clear Downloads", onClick: clearDownloads }} />
          <InfoPanel id="models" icon={<MonitorCog size={20} />} title="Models" body="Embedding profiles, versions, and local model availability." />
          <InfoPanel id="settings" icon={<Settings size={20} />} title="Settings" body="Portable mode, data root, backend URL, and LAN sharing toggle." />
        </section>
        <footer className="message-bar">{message}</footer>
      </section>
    </main>
  );
}

function StatusTile(props: { title: string; detail: string; status: string }) {
  return (
    <article className="status-tile">
      <span className={`status-dot status-${props.status}`} />
      <h2>{props.title}</h2>
      <p>{props.detail}</p>
    </article>
  );
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

function formatQueueItem(item: QueueItem): string {
  const id = item.upload_id ?? item.index_job_id ?? item.asset_id ?? "job";
  const label = item.file_name ?? item.job_type ?? item.asset_id ?? id;
  return `${label}: ${item.status}`;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

createRoot(document.getElementById("root")!).render(<App />);
