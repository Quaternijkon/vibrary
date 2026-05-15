import { contextBridge, ipcRenderer } from "electron";

export type ServiceStatus = {
  name: "qdrant" | "backend";
  pid?: number;
  running: boolean;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  error?: string;
};

export type DesktopSnapshot = {
  backendUrl: string;
  publicUrl: string;
  qdrantUrl: string;
  dataRoot: string;
  dataMode: "portable" | "local";
  settings: {
    lanEnabled: boolean;
    discoveryEnabled: boolean;
    autoIndexEnabled: boolean;
    embeddingProviderId: "jina-v5-omni-small";
    retrievalMode: "hnsw" | "full_scan";
    hnsw: {
      m: number;
      efConstruct: number;
      fullScanThreshold: number;
      searchEf: number;
    };
  };
  discovery: {
    running: boolean;
    port: number;
  };
  services: ServiceStatus[];
};

const api = {
  getSnapshot: () => ipcRenderer.invoke("desktop:getSnapshot") as Promise<DesktopSnapshot>,
  startServices: () => ipcRenderer.invoke("desktop:startServices") as Promise<DesktopSnapshot>,
  stopServices: () => ipcRenderer.invoke("desktop:stopServices") as Promise<DesktopSnapshot>,
  updateSettings: (settings: DesktopSnapshot["settings"]) =>
    ipcRenderer.invoke("desktop:updateSettings", settings) as Promise<DesktopSnapshot>,
  selectImportFiles: () => ipcRenderer.invoke("desktop:selectImportFiles") as Promise<string[]>,
  selectImportFolder: () => ipcRenderer.invoke("desktop:selectImportFolder") as Promise<string | null>
};

contextBridge.exposeInMainWorld("vibraryDesktop", api);

export type VibraryDesktopApi = typeof api;
