import { contextBridge, ipcRenderer } from "electron";

export type ServiceStatus = {
  name: "qdrant" | "backend";
  pid?: number;
  running: boolean;
};

export type DesktopSnapshot = {
  backendUrl: string;
  qdrantUrl: string;
  dataRoot: string;
  dataMode: "portable" | "local";
  services: ServiceStatus[];
};

const api = {
  getSnapshot: () => ipcRenderer.invoke("desktop:getSnapshot") as Promise<DesktopSnapshot>,
  startServices: () => ipcRenderer.invoke("desktop:startServices") as Promise<DesktopSnapshot>,
  stopServices: () => ipcRenderer.invoke("desktop:stopServices") as Promise<DesktopSnapshot>,
  selectImportFiles: () => ipcRenderer.invoke("desktop:selectImportFiles") as Promise<string[]>,
  selectImportFolder: () => ipcRenderer.invoke("desktop:selectImportFolder") as Promise<string | null>
};

contextBridge.exposeInMainWorld("vibraryDesktop", api);

export type VibraryDesktopApi = typeof api;
