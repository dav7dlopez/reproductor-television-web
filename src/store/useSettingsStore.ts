import { create } from "zustand";
import { applyTheme, readSettings, writeSetting } from "@/lib/storage/settingsStorage";
import type { ThemeMode } from "@/types/settings";

interface SettingsState {
  theme: ThemeMode;
  hydrateSettings: () => void;
  toggleTheme: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: "dark",
  hydrateSettings: () => {
    const settings = readSettings();
    applyTheme(settings.theme);
    set({ theme: settings.theme });
  },
  toggleTheme: () => {
    const nextTheme: ThemeMode = get().theme === "dark" ? "light" : "dark";
    writeSetting("theme", nextTheme);
    applyTheme(nextTheme);
    set({ theme: nextTheme });
  },
}));
