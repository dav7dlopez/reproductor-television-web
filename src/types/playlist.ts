import type { IPTVChannel } from "@/types/channel";
import type { ProfileType } from "@/types/profile";

export type PlaylistLoadStatus = "idle" | "loading" | "success" | "error";

export interface PlaylistSource {
  type: ProfileType;
  profileId: string;
  profileName: string;
  url?: string;
  serverUrl?: string;
  suggestedEpgUrls?: string[];
}

export interface PlaylistLoadState {
  status: PlaylistLoadStatus;
  source?: PlaylistSource;
  channels: IPTVChannel[];
  error?: string;
  loadedAt?: string;
}
