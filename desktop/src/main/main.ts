import path from "node:path";
import { app, BrowserWindow } from "electron";
import { registerIpc } from "./ipc.js";
import { createServiceConfig, isPackagedApp } from "./serviceConfig.js";
import { SidecarManager } from "./sidecars.js";

const manager = new SidecarManager();
const serviceConfig = createServiceConfig();

async function startServices() {
  await manager.start("qdrant", serviceConfig.qdrantCommand);
  await manager.start("backend", serviceConfig.backendCommand);
}

async function stopServices() {
  await manager.stopAll();
}

function snapshot() {
  return {
    backendUrl: serviceConfig.backendUrl,
    qdrantUrl: serviceConfig.qdrantUrl,
    dataRoot: serviceConfig.paths.root,
    dataMode: serviceConfig.paths.mode,
    services: manager.status()
  };
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 680,
    title: "Vibrary",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  if (isPackagedApp()) {
    await window.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  } else {
    await window.loadURL(process.env.VIBRARY_RENDERER_URL ?? "http://127.0.0.1:5173");
  }
}

registerIpc({
  manager,
  getSnapshot: snapshot,
  startServices,
  stopServices
});

app.whenReady().then(async () => {
  await startServices();
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("before-quit", () => {
  void stopServices();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
