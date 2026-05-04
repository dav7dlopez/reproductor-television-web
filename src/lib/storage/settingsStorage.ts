import type { ThemeMode, UserSettings } from "@/types/settings";

const SETTINGS_KEY = "iptvweb.settings";

export const defaultSettings: UserSettings = {
  theme: "dark",
};

export function readSettings(): UserSettings {
  if (typeof window === "undefined") {
    return defaultSettings;
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

export function writeSettings(settings: UserSettings): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(removeUndefinedValues(settings)));
}

export function writeSetting<K extends keyof UserSettings>(key: K, value: UserSettings[K]): void {
  const settings = readSettings();
  writeSettings({ ...settings, [key]: value });
}

export function applyTheme(theme: ThemeMode): void {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = theme;
}

function removeUndefinedValues(settings: UserSettings): UserSettings {
  return Object.fromEntries(Object.entries(settings).filter(([, value]) => value !== undefined)) as UserSettings;
}
