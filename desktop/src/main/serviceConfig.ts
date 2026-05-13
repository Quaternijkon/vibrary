import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { resolveDataPaths } from "./dataPaths.js";
import { buildBackendCommand, buildQdrantCommand } from "./sidecars.js";

export const PRODUCT_NAME = "Vibrary";
export const BACKEND_CLIENT_HOST = process.env.VIBRARY_BACKEND_CLIENT_HOST ?? "127.0.0.1";
export const BACKEND_PORT = Number(process.env.VIBRARY_BACKEND_PORT ?? "8765");
export const QDRANT_URL = "http://127.0.0.1:6333";

export function createServiceConfig() {
  const paths = resolveDataPaths({
    productName: PRODUCT_NAME,
    execPath: process.execPath,
    env: process.env,
    exists: fs.existsSync
  });
  ensureDataDirectories(paths);

  const qdrantApiKey = loadOrCreateSecret(path.join(paths.config, "qdrant-api-key"));
  const resourcesPath = process.resourcesPath || path.dirname(process.execPath);

  return {
    paths,
    backendUrl: `http://${BACKEND_CLIENT_HOST}:${BACKEND_PORT}`,
    qdrantUrl: QDRANT_URL,
    qdrantCommand: buildQdrantCommand({
      resourcesPath,
      qdrantStoragePath: paths.qdrantStorage,
      apiKey: qdrantApiKey
    }),
    backendCommand: buildBackendCommand({
      resourcesPath,
      dataRoot: paths.root,
      backendHost: resolveBackendListenHost(process.env),
      backendPort: BACKEND_PORT,
      publicUrl: process.env.VIBRARY_PUBLIC_URL,
      qdrantUrl: QDRANT_URL,
      qdrantApiKey
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

export function resolveBackendListenHost(env: NodeJS.ProcessEnv): string {
  if (env.VIBRARY_BACKEND_HOST) {
    return env.VIBRARY_BACKEND_HOST;
  }
  return env.VIBRARY_ENABLE_LAN === "1" ? "0.0.0.0" : "127.0.0.1";
}
