import fs from "node:fs";
import path from "node:path";

export type DesktopSettings = {
  lanEnabled: boolean;
  discoveryEnabled: boolean;
  autoIndexEnabled: boolean;
};

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  lanEnabled: true,
  discoveryEnabled: true,
  autoIndexEnabled: true
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
  return {
    lanEnabled: typeof settings.lanEnabled === "boolean" ? settings.lanEnabled : DEFAULT_DESKTOP_SETTINGS.lanEnabled,
    discoveryEnabled:
      typeof settings.discoveryEnabled === "boolean" ? settings.discoveryEnabled : DEFAULT_DESKTOP_SETTINGS.discoveryEnabled,
    autoIndexEnabled:
      typeof settings.autoIndexEnabled === "boolean" ? settings.autoIndexEnabled : DEFAULT_DESKTOP_SETTINGS.autoIndexEnabled
  };
}
