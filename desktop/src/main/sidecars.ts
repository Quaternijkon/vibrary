import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

export type SidecarName = "qdrant" | "backend";

export type SidecarCommand = {
  file: string;
  args: string[];
  env: Record<string, string>;
};

export type SpawnedProcess = {
  pid?: number;
  kill: (signal?: NodeJS.Signals) => boolean | void;
};

export type ProcessSpawner = (
  file: string,
  args: string[],
  options: { env: Record<string, string>; windowsHide: true }
) => SpawnedProcess;

export type SidecarStatus = {
  name: SidecarName;
  pid?: number;
  running: boolean;
};

export function buildQdrantCommand(input: {
  resourcesPath: string;
  qdrantStoragePath: string;
  apiKey: string;
}): SidecarCommand {
  return {
    file: path.join(input.resourcesPath, "sidecars", "qdrant", "qdrant.exe"),
    args: [],
    env: {
      QDRANT__SERVICE__HOST: "127.0.0.1",
      QDRANT__SERVICE__HTTP_PORT: "6333",
      QDRANT__SERVICE__API_KEY: input.apiKey,
      QDRANT__STORAGE__STORAGE_PATH: input.qdrantStoragePath
    }
  };
}

export function buildBackendCommand(input: {
  resourcesPath: string;
  dataRoot: string;
  backendHost: string;
  backendPort: number;
  publicUrl?: string;
  qdrantUrl: string;
  qdrantApiKey: string;
}): SidecarCommand {
  return {
    file: path.join(input.resourcesPath, "sidecars", "backend", "backend.exe"),
    args: [],
    env: {
      VIBRARY_DATA_DIR: input.dataRoot,
      VIBRARY_BACKEND_HOST: input.backendHost,
      VIBRARY_BACKEND_PORT: String(input.backendPort),
      ...(input.publicUrl ? { VIBRARY_PUBLIC_URL: input.publicUrl } : {}),
      VIBRARY_QDRANT_URL: input.qdrantUrl,
      VIBRARY_QDRANT_API_KEY: input.qdrantApiKey
    }
  };
}

export class SidecarManager {
  private readonly processes = new Map<SidecarName, SpawnedProcess>();
  private readonly statuses = new Map<SidecarName, SidecarStatus>();

  constructor(private readonly spawner: ProcessSpawner = defaultSpawner) {}

  async start(name: SidecarName, command: SidecarCommand): Promise<void> {
    const current = this.processes.get(name);
    if (current) {
      return;
    }

    const child = this.spawner(command.file, command.args, {
      env: command.env,
      windowsHide: true
    });
    this.processes.set(name, child);
    this.statuses.set(name, {
      name,
      pid: child.pid,
      running: true
    });
  }

  async stop(name: SidecarName): Promise<void> {
    const child = this.processes.get(name);
    if (!child) {
      this.statuses.set(name, this.statuses.get(name) ?? { name, running: false });
      return;
    }

    child.kill("SIGTERM");
    this.processes.delete(name);
    this.statuses.set(name, {
      name,
      pid: child.pid,
      running: false
    });
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.processes.keys()].map((name) => this.stop(name)));
  }

  status(): SidecarStatus[] {
    return [...this.statuses.values()];
  }
}

function defaultSpawner(
  file: string,
  args: string[],
  options: { env: Record<string, string>; windowsHide: true }
): ChildProcess {
  return spawn(file, args, {
    env: { ...process.env, ...options.env },
    windowsHide: options.windowsHide,
    stdio: "ignore"
  });
}
