import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadDesktopSettings, saveDesktopSettings } from "../desktopSettings";
import { buildDiscoveryMessage } from "../lanDiscovery";

const tempDirs: string[] = [];

function tempConfigDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vibrary-settings-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("desktop settings", () => {
  it("defaults LAN discovery and auto indexing on for non-technical startup", () => {
    expect(loadDesktopSettings(tempConfigDir())).toEqual({
      lanEnabled: true,
      discoveryEnabled: true,
      autoIndexEnabled: true
    });
  });

  it("persists a disabled LAN mode setting", () => {
    const configDir = tempConfigDir();

    saveDesktopSettings(configDir, {
      lanEnabled: false,
      discoveryEnabled: false,
      autoIndexEnabled: true
    });

    expect(loadDesktopSettings(configDir)).toMatchObject({
      lanEnabled: false,
      discoveryEnabled: false,
      autoIndexEnabled: true
    });
  });
});

describe("LAN discovery message", () => {
  it("contains the joinable desktop URL without exposing Qdrant", () => {
    const message = JSON.parse(
      buildDiscoveryMessage({
        instanceId: "desktop-1",
        deviceName: "Lab PC",
        serverUrl: "http://192.168.1.142:8765"
      })
    );

    expect(message).toMatchObject({
      type: "vibrary-desktop",
      version: 1,
      instance_id: "desktop-1",
      device_name: "Lab PC",
      server_url: "http://192.168.1.142:8765",
      pairing_path: "/v1/pairing/claim"
    });
    expect(JSON.stringify(message)).not.toContain("6333");
  });
});
