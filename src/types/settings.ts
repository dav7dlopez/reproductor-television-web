export type ThemeMode = "dark" | "light";

export interface UserSettings {
  theme: ThemeMode;
  activeProfileId?: string;
  lastChannelId?: string;
}
