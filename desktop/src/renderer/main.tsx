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
  const [results, setResults] = useState<SearchResult[]>([]);
  const [cacheSummary, setCacheSummary] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string>(desktopCopy.messages.ready);

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
      setMessage(desktopCopy.messages.selectedFiles(files.length));
    }
  }

  async function chooseFolder() {
    const folder = await window.vibraryDesktop.selectImportFolder();
    setSelectedFolder(folder);
    if (folder && client) {
      setImportSummary(await client.importFolder(folder));
      await refreshBackendData(client);
      setMessage(desktopCopy.messages.folderQueued);
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
          <StatusTile title="Qdrant" detail={desktopCopy.status.qdrantDetail} status={qdrant?.running ? "running" : "stopped"} label={qdrant?.running ? desktopCopy.status.running : desktopCopy.status.stopped} />
          <StatusTile title="Backend" detail={snapshot?.backendUrl ?? "127.0.0.1:8765"} status={backend?.running ? "running" : "stopped"} label={backend?.running ? desktopCopy.status.running : desktopCopy.status.stopped} />
          <StatusTile title={desktopCopy.status.lanApi} detail={desktopCopy.status.lanDetail} status="running" label={desktopCopy.status.localOnly} />
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
          <InfoPanel id="devices" icon={<Laptop size={20} />} title={desktopCopy.sections[5].label} body={desktopCopy.cards.devices} />
          <InfoPanel id="cache" icon={<DownloadCloud size={20} />} title={desktopCopy.sections[6].label} body={`${desktopCopy.cards.cache} ${formatBytes(cacheSummary.downloaded_file ?? 0)}`} action={{ label: desktopCopy.actions.clearDownloads, onClick: clearDownloads }} />
          <InfoPanel id="models" icon={<MonitorCog size={20} />} title={desktopCopy.sections[7].label} body={desktopCopy.cards.models} />
          <InfoPanel id="settings" icon={<Settings size={20} />} title={desktopCopy.sections[8].label} body={desktopCopy.cards.settings} />
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
  return `${label}: ${labelFor(desktopCopy.statusLabels, item.status)}`;
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
