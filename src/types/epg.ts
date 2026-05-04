export type EpgLoadStatus = "idle" | "loading" | "success" | "error";

export interface EpgChannel {
  id: string;
  displayNames: string[];
  icon?: string;
  normalizedNames: string[];
}

export interface EpgProgram {
  id: string;
  channelId: string;
  title: string;
  description?: string;
  category?: string;
  start: string;
  stop: string;
  startMs: number;
  stopMs: number;
}

export type MatchMethod = "tvg-id" | "epg_channel_id" | "tvg-name" | "normalized-name" | "flex" | "none";

export interface ChannelEpgMatch {
  channelId: string;
  epgChannelId?: string;
  method: MatchMethod;
  confidence: number;
}

export interface CurrentProgram {
  program: EpgProgram;
  progress: number;
}

export interface EpgSource {
  profileId: string;
  profileName: string;
  profileType: "m3u" | "xtream";
  url: string;
  maskedUrl: string;
  from: "manual-profile" | "m3u-header" | "xtream-default";
  proxied: boolean;
}

export interface EpgLoadState {
  status: EpgLoadStatus;
  source?: EpgSource;
  channels: EpgChannel[];
  programs: EpgProgram[];
  programsByChannelId: Record<string, EpgProgram[]>;
  matchesByChannelId: Record<string, ChannelEpgMatch>;
  error?: string;
  loadedAt?: string;
}
