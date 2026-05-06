import { create } from "zustand";
import { groupChannels } from "@/lib/playlist/groupChannels";
import { loadM3UPlaylist } from "@/lib/playlist/loadM3UPlaylist";
import { loadXtreamPlaylist } from "@/lib/playlist/loadXtreamPlaylist";
import type { IPTVProfile } from "@/types/profile";
import type { IPTVChannel, ChannelGroup } from "@/types/channel";
import type { PlaylistLoadState } from "@/types/playlist";

interface PlaylistStoreState extends PlaylistLoadState {
  groups: ChannelGroup[];
  diagnostics?: {
    method: "direct-browser" | "playlist-proxy";
    status: "success" | "error";
    fallbackUsed: boolean;
    maskedUrl: string;
    playlistSize: number;
    parsedChannels: number;
  };
  selectedChannel?: IPTVChannel;
  searchQuery: string;
  selectedCountry?: string;
  selectedCategory?: string;
  loadForProfile: (profile: IPTVProfile) => Promise<void>;
  resetPlaylist: () => void;
  selectChannel: (channel?: IPTVChannel) => void;
  setSearchQuery: (query: string) => void;
  setSelectedCountry: (country?: string) => void;
  setSelectedCategory: (category?: string) => void;
}

interface LoadChannelsResult {
  channels: IPTVChannel[];
  suggestedEpgUrls?: string[];
  diagnostics?: PlaylistStoreState["diagnostics"];
}

interface PlaylistCacheEntry {
  key: string;
  profileId: string;
  source: NonNullable<PlaylistStoreState["source"]>;
  channels: IPTVChannel[];
  groups: ChannelGroup[];
  diagnostics?: PlaylistStoreState["diagnostics"];
  loadedAt: string;
}

const PLAYLIST_CACHE_TTL_MS = 8 * 60 * 60 * 1000;
const playlistCache = new Map<string, PlaylistCacheEntry>();

const initialState: PlaylistLoadState & Pick<PlaylistStoreState, "groups" | "searchQuery"> = {
  status: "idle",
  channels: [],
  groups: [],
  searchQuery: "",
};

export const usePlaylistStore = create<PlaylistStoreState>((set, get) => ({
  ...initialState,
  loadForProfile: async (profile) => {
    const source = getPlaylistSource(profile);

    if (!source) {
      set({
        status: "idle",
        source: undefined,
        channels: [],
        groups: [],
        selectedChannel: undefined,
        error: undefined,
      });
      return;
    }

    const currentSource = get().source;
    if (currentSource?.profileId === profile.id && get().status === "success") {
      return;
    }

    const cacheKey = createPlaylistCacheKey(source);
    const cached = playlistCache.get(cacheKey);
    if (cached) {
      const ageMs = Date.now() - new Date(cached.loadedAt).getTime();
      if (ageMs >= 0 && ageMs <= PLAYLIST_CACHE_TTL_MS) {
        const firstCountry = cached.groups[0]?.country;
        const firstCategory = cached.groups[0]?.categories[0]?.name;
        set({
          status: "success",
          source: cached.source,
          channels: cached.channels,
          groups: cached.groups,
          diagnostics: cached.diagnostics,
          selectedCountry: firstCountry,
          selectedCategory: firstCategory,
          selectedChannel: undefined,
          error: undefined,
          loadedAt: cached.loadedAt,
        });
        return;
      }
      playlistCache.delete(cacheKey);
    }

    set({
      status: "loading",
      source,
      channels: [],
      groups: [],
      selectedChannel: undefined,
      error: undefined,
      selectedCountry: undefined,
      selectedCategory: undefined,
    });

    try {
      const { channels, suggestedEpgUrls, diagnostics } = await loadChannelsForProfile(profile);
      const groups = groupChannels(channels);
      const firstCountry = groups[0]?.country;
      const firstCategory = groups[0]?.categories[0]?.name;
      const loadedAt = new Date().toISOString();
      const resolvedSource = source.type === "m3u" ? { ...source, suggestedEpgUrls } : source;

      set({
        status: "success",
        channels,
        groups,
        selectedCountry: firstCountry,
        selectedCategory: firstCategory,
        selectedChannel: undefined,
        error: undefined,
        loadedAt,
        source: resolvedSource,
        diagnostics,
      });
      playlistCache.set(cacheKey, {
        key: cacheKey,
        profileId: profile.id,
        source: resolvedSource,
        channels,
        groups,
        diagnostics,
        loadedAt,
      });
    } catch (error) {
      set({
        status: "error",
        channels: [],
        groups: [],
        selectedChannel: undefined,
        error: error instanceof Error ? error.message : "No se pudo cargar el perfil IPTV.",
      });
    }
  },
  resetPlaylist: () => set({ ...initialState, source: undefined, selectedChannel: undefined, error: undefined, selectedCountry: undefined, selectedCategory: undefined }),
  selectChannel: (channel) => set({ selectedChannel: channel }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedCountry: (country) => {
    const groups = get().groups;
    const selectedGroup = groups.find((group) => group.country === country);
    set({ selectedCountry: country, selectedCategory: selectedGroup?.categories[0]?.name });
  },
  setSelectedCategory: (category) => set({ selectedCategory: category }),
}));

async function loadChannelsForProfile(profile: IPTVProfile): Promise<LoadChannelsResult> {
  if (profile.type === "m3u" && profile.m3uUrl) {
    return loadM3UPlaylist(profile.m3uUrl);
  }

  if (profile.type === "xtream" && profile.xtream) {
    return { channels: await loadXtreamPlaylist(profile.xtream) };
  }

  throw new Error("El perfil no tiene datos suficientes para cargar canales.");
}

function getPlaylistSource(profile: IPTVProfile): PlaylistStoreState["source"] {
  if (profile.type === "m3u" && profile.m3uUrl) {
    return {
      type: "m3u",
      profileId: profile.id,
      profileName: profile.name,
      url: profile.m3uUrl,
    };
  }

  if (profile.type === "xtream" && profile.xtream) {
    return {
      type: "xtream",
      profileId: profile.id,
      profileName: profile.name,
      serverUrl: profile.xtream.serverUrl,
    };
  }

  return undefined;
}

function createPlaylistCacheKey(source: NonNullable<PlaylistStoreState["source"]>): string {
  if (source.type === "m3u") {
    return `m3u:${source.profileId}:${source.url}`;
  }
  return `xtream:${source.profileId}:${source.serverUrl}`;
}
