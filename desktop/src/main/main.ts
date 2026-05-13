import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app, BrowserWindow } from "electron";
import { saveDesktopSettings, type DesktopSettings } from "./desktopSettings.js";
import { registerIpc } from "./ipc.js";
import { createServiceConfig, DEFAULT_QDRANT_PORT, isPackagedApp } from "./serviceConfig.js";
import { LanDiscoveryBroadcaster } from "./lanDiscovery.js";
import { findAvailableTcpPort } from "./ports.js";
import { SidecarManager } from "./sidecars.js";

const manager = new SidecarManager();
const discovery = new LanDiscoveryBroadcaster();
let serviceConfig: ReturnType<typeof createServiceConfig> | null = null;
let qdrantPort = DEFAULT_QDRANT_PORT;

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
  syncDiscovery();
}

async function stopServices() {
  discovery.stop();
  await manager.stopAll();
}

async function updateSettings(nextSettings: DesktopSettings) {
  const config = currentServiceConfig();
  const saved = saveDesktopSettings(config.paths.config, nextSettings);
  await stopServices();
  serviceConfig = createServiceConfig({ qdrantPort, desktopSettings: saved });
  await startServices();
  return snapshot();
}

function snapshot() {
  const config = currentServiceConfig();
  return {
    backendUrl: config.backendUrl,
    publicUrl: config.publicUrl,
    qdrantUrl: config.qdrantUrl,
    dataRoot: config.paths.root,
    dataMode: config.paths.mode,
    settings: config.desktopSettings,
    discovery: discovery.status(),
    services: manager.status()
  };
}

function syncDiscovery() {
  const config = currentServiceConfig();
  if (!config.desktopSettings.lanEnabled || !config.desktopSettings.discoveryEnabled) {
    discovery.stop();
    return;
  }
  discovery.start({
    instanceId: loadOrCreateInstanceId(config.paths.config),
    deviceName: os.hostname() || "Windows Vibrary",
    serverUrl: config.publicUrl
  });
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
  stopServices,
  updateSettings
});

app.whenReady().then(async () => {
  qdrantPort = process.env.VIBRARY_QDRANT_PORT
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

function loadOrCreateInstanceId(configDir: string): string {
  const instancePath = path.join(configDir, "desktop-instance-id");
  if (fs.existsSync(instancePath)) {
    return fs.readFileSync(instancePath, "utf8").trim();
  }
  const id = `desktop-${crypto.randomUUID()}`;
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(instancePath, `${id}\n`, "utf8");
  return id;
}
