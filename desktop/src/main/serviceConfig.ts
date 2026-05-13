import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app } from "electron";
import { resolveDataPaths } from "./dataPaths.js";
import { loadDesktopSettings, type DesktopSettings } from "./desktopSettings.js";
import { buildBackendCommand, buildQdrantCommand } from "./sidecars.js";

export const PRODUCT_NAME = "Vibrary";
export const BACKEND_CLIENT_HOST = process.env.VIBRARY_BACKEND_CLIENT_HOST ?? "127.0.0.1";
export const BACKEND_PORT = Number(process.env.VIBRARY_BACKEND_PORT ?? "8765");
export const DEFAULT_QDRANT_PORT = 6333;

type NetworkInterfaceEntry = {
  address: string;
  family: string | number;
  internal: boolean;
};

type NetworkInterfaces = Record<string, NetworkInterfaceEntry[] | undefined>;

export function createServiceConfig(input: { qdrantPort?: number; desktopSettings?: DesktopSettings } = {}) {
  const paths = resolveDataPaths({
    productName: PRODUCT_NAME,
    execPath: process.execPath,
    env: process.env,
    exists: fs.existsSync
  });
  ensureDataDirectories(paths);

  const desktopSettings = input.desktopSettings ?? loadDesktopSettings(paths.config);
  const qdrantApiKey = loadOrCreateSecret(path.join(paths.config, "qdrant-api-key"));
  const resourcesPath = process.resourcesPath || path.dirname(process.execPath);
  const qdrantPort = input.qdrantPort ?? Number(process.env.VIBRARY_QDRANT_PORT ?? DEFAULT_QDRANT_PORT);
  const qdrantUrl = `http://127.0.0.1:${qdrantPort}`;
  const backendHost = resolveBackendListenHost(process.env, desktopSettings);
  const publicUrl = resolveBackendPublicUrl(backendHost, BACKEND_PORT, process.env);

  return {
    paths,
    desktopSettings,
    backendUrl: `http://${BACKEND_CLIENT_HOST}:${BACKEND_PORT}`,
    publicUrl,
    qdrantUrl,
    qdrantCommand: buildQdrantCommand({
      resourcesPath,
      qdrantStoragePath: paths.qdrantStorage,
      qdrantPort,
      apiKey: qdrantApiKey
    }),
    backendCommand: buildBackendCommand({
      resourcesPath,
      dataRoot: paths.root,
      backendHost,
      backendPort: BACKEND_PORT,
      publicUrl,
      qdrantUrl,
      qdrantApiKey,
      autoIndexEnabled: desktopSettings.autoIndexEnabled
    })
  };
}

function ensureDataDirectories(paths: { [key: string]: string }) {
  for (const key of ["config", "libraryFiles", "qdrantStorage", "qdrantSnapshots", "cache", "models", "logs"]) {
    fs.mkdirSync(paths[key], { recursive: true });
  }
}

function loadOrCreateSecret(secretPath: string): string {
  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, "utf8").trim();
  }

  const secret = crypto.randomBytes(32).toString("base64url");
  fs.mkdirSync(path.dirname(secretPath), { recursive: true });
  fs.writeFileSync(secretPath, secret, { encoding: "utf8", mode: 0o600 });
  return secret;
}

export function isPackagedApp(): boolean {
  return app.isPackaged;
}

export function resolveBackendListenHost(
  env: NodeJS.ProcessEnv,
  desktopSettings: DesktopSettings = { lanEnabled: true, discoveryEnabled: true, autoIndexEnabled: true }
): string {
  if (env.VIBRARY_BACKEND_HOST) {
    return env.VIBRARY_BACKEND_HOST;
  }
  if (env.VIBRARY_ENABLE_LAN === "1") {
    return "0.0.0.0";
  }
  if (env.VIBRARY_ENABLE_LAN === "0") {
    return "127.0.0.1";
  }
  return desktopSettings.lanEnabled ? "0.0.0.0" : "127.0.0.1";
}

export function resolveBackendPublicUrl(
  backendHost: string,
  backendPort: number,
  env: NodeJS.ProcessEnv,
  networkInterfaces: NetworkInterfaces = os.networkInterfaces() as NetworkInterfaces
): string {
  if (env.VIBRARY_PUBLIC_URL) {
    return env.VIBRARY_PUBLIC_URL;
  }
  if (backendHost === "0.0.0.0" || backendHost === "::") {
    return `http://${selectLanAddress(networkInterfaces) ?? "127.0.0.1"}:${backendPort}`;
  }
  return `http://${backendHost}:${backendPort}`;
}

function selectLanAddress(networkInterfaces: NetworkInterfaces): string | null {
  const addresses = Object.values(networkInterfaces)
    .flatMap((entries) => entries ?? [])
    .filter((entry) => (entry.family === "IPv4" || entry.family === 4) && !entry.internal)
    .map((entry) => entry.address);
  return addresses.find(isPrivateAddress) ?? addresses[0] ?? null;
}

function isPrivateAddress(address: string): boolean {
  if (address.startsWith("10.")) return true;
  if (address.startsWith("192.168.")) return true;
  const match = /^172\.(\d+)\./.exec(address);
  return match ? Number(match[1]) >= 16 && Number(match[1]) <= 31 : false;
}
