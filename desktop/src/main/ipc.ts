import { dialog, ipcMain } from "electron";
import type { DesktopSettings } from "./desktopSettings.js";
import type { SidecarManager } from "./sidecars.js";

export type DesktopSnapshot = {
  backendUrl: string;
  publicUrl: string;
  qdrantUrl: string;
  dataRoot: string;
  dataMode: "portable" | "local";
  settings: DesktopSettings;
  discovery: { running: boolean; port: number };
  services: ReturnType<SidecarManager["status"]>;
};

export function registerIpc(input: {
  manager: SidecarManager;
  getSnapshot: () => DesktopSnapshot;
  startServices: () => Promise<void>;
  stopServices: () => Promise<void>;
  updateSettings: (settings: DesktopSettings) => Promise<DesktopSnapshot>;
}) {
  ipcMain.handle("desktop:getSnapshot", () => input.getSnapshot());
  ipcMain.handle("desktop:startServices", async () => {
    await input.startServices();
    return input.getSnapshot();
  });
  ipcMain.handle("desktop:stopServices", async () => {
    await input.stopServices();
    return input.getSnapshot();
  });
  ipcMain.handle("desktop:updateSettings", async (_event, settings: DesktopSettings) => input.updateSettings(settings));
  ipcMain.handle("desktop:selectImportFiles", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"]
    });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle("desktop:selectImportFolder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"]
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
}
