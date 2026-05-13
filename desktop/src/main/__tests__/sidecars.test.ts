import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  SidecarManager,
  buildBackendCommand,
  buildQdrantCommand,
  type ProcessSpawner
} from "../sidecars";
import { resolveBackendListenHost, resolveBackendPublicUrl } from "../serviceConfig";

describe("buildQdrantCommand", () => {
  it("binds Qdrant to localhost with the resolved port, storage, and API key env", () => {
    const command = buildQdrantCommand({
      resourcesPath: "C:\\Tools\\Vibrary\\resources",
      qdrantStoragePath: "C:\\Data\\qdrant\\storage",
      qdrantPort: 6335,
      apiKey: "secret-key"
    });

    expect(command.file).toBe("C:\\Tools\\Vibrary\\resources\\sidecars\\qdrant\\qdrant.exe");
    expect(command.args).toEqual([]);
    expect(command.env).toMatchObject({
      QDRANT__SERVICE__HOST: "127.0.0.1",
      QDRANT__SERVICE__HTTP_PORT: "6335",
      QDRANT__SERVICE__API_KEY: "secret-key",
      QDRANT__STORAGE__STORAGE_PATH: "C:\\Data\\qdrant\\storage"
    });
  });
});

describe("buildBackendCommand", () => {
  it("passes backend API and Qdrant settings without exposing process spawn to renderer", () => {
    const command = buildBackendCommand({
      resourcesPath: "C:\\Tools\\Vibrary\\resources",
      dataRoot: "C:\\Data",
      backendHost: "127.0.0.1",
      backendPort: 8765,
      publicUrl: "http://192.168.1.20:8765",
      qdrantUrl: "http://127.0.0.1:6333",
      qdrantApiKey: "secret-key",
      autoIndexEnabled: true
    });

    expect(command.file).toBe("C:\\Tools\\Vibrary\\resources\\sidecars\\backend\\backend.exe");
    expect(command.args).toEqual([]);
    expect(command.env).toMatchObject({
      VIBRARY_DATA_DIR: "C:\\Data",
      VIBRARY_BACKEND_HOST: "127.0.0.1",
      VIBRARY_BACKEND_PORT: "8765",
      VIBRARY_PUBLIC_URL: "http://192.168.1.20:8765",
      VIBRARY_QDRANT_URL: "http://127.0.0.1:6333",
      VIBRARY_QDRANT_API_KEY: "secret-key",
      VIBRARY_AUTO_INDEX: "1"
    });
  });
});

describe("SidecarManager", () => {
  it("fails clearly when a configured sidecar executable is missing", async () => {
    const spawner: ProcessSpawner = vi.fn(() => ({ pid: 42, kill: vi.fn() }));
    const manager = new SidecarManager(spawner, () => false);

    await expect(
      manager.start("backend", {
        file: "C:\\Tools\\Vibrary\\resources\\sidecars\\backend\\backend.exe",
        args: [],
        env: {}
      })
    ).rejects.toThrow("backend sidecar executable not found");
    expect(spawner).not.toHaveBeenCalled();
    expect(manager.status()).toEqual([{ name: "backend", running: false }]);
  });

  it("starts configured sidecars through the injected spawner and stops them", async () => {
    const kill = vi.fn();
    const spawner: ProcessSpawner = vi.fn(() => ({ pid: 42, kill }));
    const manager = new SidecarManager(spawner, () => true);

    await manager.start("qdrant", {
      file: "qdrant.exe",
      args: [],
      env: { QDRANT__SERVICE__HOST: "127.0.0.1" }
    });

    expect(spawner).toHaveBeenCalledWith("qdrant.exe", [], {
      env: { QDRANT__SERVICE__HOST: "127.0.0.1" },
      windowsHide: true
    });
    expect(manager.status()).toEqual([{ name: "qdrant", pid: 42, running: true }]);

    await manager.stopAll();

    expect(kill).toHaveBeenCalledWith("SIGTERM");
    expect(manager.status()).toEqual([{ name: "qdrant", pid: 42, running: false }]);
  });

  it("marks a sidecar as stopped when the child process exits unexpectedly", async () => {
    const child = Object.assign(new EventEmitter(), { pid: 99, kill: vi.fn() });
    const spawner: ProcessSpawner = vi.fn(() => child);
    const manager = new SidecarManager(spawner, () => true);

    await manager.start("backend", {
      file: "backend.exe",
      args: [],
      env: {}
    });
    child.emit("exit", 1, null);

    expect(manager.status()).toEqual([
      { name: "backend", pid: 99, running: false, exitCode: 1, error: "backend exited with code 1" }
    ]);
  });
});

describe("resolveBackendListenHost", () => {
  it("enables LAN by default and can be disabled by persisted desktop settings", () => {
    expect(resolveBackendListenHost({}, { lanEnabled: true, autoIndexEnabled: true, discoveryEnabled: true })).toBe("0.0.0.0");
    expect(resolveBackendListenHost({}, { lanEnabled: false, autoIndexEnabled: true, discoveryEnabled: false })).toBe("127.0.0.1");
    expect(resolveBackendListenHost({ VIBRARY_BACKEND_HOST: "192.168.1.20" })).toBe("192.168.1.20");
  });
});

describe("resolveBackendPublicUrl", () => {
  it("publishes a LAN URL when listening on all interfaces", () => {
    const interfaces = {
      "Wi-Fi": [
        { address: "127.0.0.1", family: "IPv4", internal: true },
        { address: "192.168.1.142", family: "IPv4", internal: false }
      ]
    };

    expect(resolveBackendPublicUrl("0.0.0.0", 8765, {}, interfaces)).toBe("http://192.168.1.142:8765");
  });

  it("keeps localhost public URL when LAN mode is disabled", () => {
    expect(resolveBackendPublicUrl("127.0.0.1", 8765, {}, {})).toBe("http://127.0.0.1:8765");
  });
});
