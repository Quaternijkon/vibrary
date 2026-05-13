import path from "node:path";
import { app, BrowserWindow } from "electron";
import { registerIpc } from "./ipc.js";
import { createServiceConfig, DEFAULT_QDRANT_PORT, isPackagedApp } from "./serviceConfig.js";
import { findAvailableTcpPort } from "./ports.js";
import { SidecarManager } from "./sidecars.js";

const manager = new SidecarManager();
let serviceConfig: ReturnType<typeof createServiceConfig> | null = null;

function currentServiceConfig() {
  if (!serviceConfig) {
    throw new Error("service config has not been initialized");
  }
  return serviceConfig;
}

async function startServices() {
  const config = currentServiceConfig();
  await manager.start("qdrant", config.qdrantCommand);
  await manager.start("backend", config.backendCommand);
}

async function stopServices() {
  await manager.stopAll();
}

function snapshot() {
  const config = currentServiceConfig();
  return {
    backendUrl: config.backendUrl,
    qdrantUrl: config.qdrantUrl,
    dataRoot: config.paths.root,
    dataMode: config.paths.mode,
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
  const qdrantPort = process.env.VIBRARY_QDRANT_PORT
    ? Number(process.env.VIBRARY_QDRANT_PORT)
    : await findAvailableTcpPort("127.0.0.1", DEFAULT_QDRANT_PORT, 50);
  serviceConfig = createServiceConfig({ qdrantPort });
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
