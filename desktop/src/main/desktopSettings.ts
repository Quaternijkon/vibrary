import fs from "node:fs";
import path from "node:path";

export type DesktopSettings = {
  lanEnabled: boolean;
  discoveryEnabled: boolean;
  autoIndexEnabled: boolean;
  embeddingProviderId: "jina-v5-omni-small";
  retrievalMode: "hnsw" | "full_scan";
  hnsw: {
    m: number;
    efConstruct: number;
    fullScanThreshold: number;
    searchEf: number;
  };
};

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  lanEnabled: true,
  discoveryEnabled: true,
  autoIndexEnabled: true,
  embeddingProviderId: "jina-v5-omni-small",
  retrievalMode: "hnsw",
  hnsw: {
    m: 16,
    efConstruct: 200,
    fullScanThreshold: 10000,
    searchEf: 128
  }
};

const SETTINGS_FILE_NAME = "desktop-settings.json";

export function loadDesktopSettings(configDir: string): DesktopSettings {
  const settingsPath = path.join(configDir, SETTINGS_FILE_NAME);
  if (!fs.existsSync(settingsPath)) {
    return { ...DEFAULT_DESKTOP_SETTINGS };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as Partial<DesktopSettings>;
    return normalizeDesktopSettings(parsed);
  } catch {
    return { ...DEFAULT_DESKTOP_SETTINGS };
  }
}

export function saveDesktopSettings(configDir: string, settings: DesktopSettings): DesktopSettings {
  const normalized = normalizeDesktopSettings(settings);
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, SETTINGS_FILE_NAME), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export function normalizeDesktopSettings(settings: Partial<DesktopSettings>): DesktopSettings {
  const rawHnsw = (settings.hnsw ?? {}) as Partial<DesktopSettings["hnsw"]>;
  return {
    lanEnabled: typeof settings.lanEnabled === "boolean" ? settings.lanEnabled : DEFAULT_DESKTOP_SETTINGS.lanEnabled,
    discoveryEnabled:
      typeof settings.discoveryEnabled === "boolean" ? settings.discoveryEnabled : DEFAULT_DESKTOP_SETTINGS.discoveryEnabled,
    autoIndexEnabled:
      typeof settings.autoIndexEnabled === "boolean" ? settings.autoIndexEnabled : DEFAULT_DESKTOP_SETTINGS.autoIndexEnabled,
    embeddingProviderId:
      settings.embeddingProviderId === "jina-v5-omni-small" ? settings.embeddingProviderId : DEFAULT_DESKTOP_SETTINGS.embeddingProviderId,
    retrievalMode:
      settings.retrievalMode === "hnsw" || settings.retrievalMode === "full_scan"
        ? settings.retrievalMode
        : DEFAULT_DESKTOP_SETTINGS.retrievalMode,
    hnsw: {
      m: positiveInteger(rawHnsw.m, DEFAULT_DESKTOP_SETTINGS.hnsw.m),
      efConstruct: positiveInteger(rawHnsw.efConstruct, DEFAULT_DESKTOP_SETTINGS.hnsw.efConstruct),
      fullScanThreshold: positiveInteger(rawHnsw.fullScanThreshold, DEFAULT_DESKTOP_SETTINGS.hnsw.fullScanThreshold),
      searchEf: positiveInteger(rawHnsw.searchEf, DEFAULT_DESKTOP_SETTINGS.hnsw.searchEf)
    }
  };
}

function positiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.floor(value);
  return rounded > 0 ? rounded : fallback;
}
