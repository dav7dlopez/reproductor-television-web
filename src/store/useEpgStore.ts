import { create } from "zustand";
import { matchIptvChannelsToEpg } from "@/lib/epg/epgMatcher";
import { parseXMLTV } from "@/lib/epg/parseXMLTV";
import { sortProgramsByDate } from "@/lib/epg/epgUtils";
import { createProxyStreamUrl, maskStreamUrl } from "@/lib/player/playbackSupport";
import { buildXtreamXmltvUrl } from "@/lib/xtream/xtreamUrls";
import { usePlayerStore } from "@/store/usePlayerStore";
import type { IPTVChannel } from "@/types/channel";
import type { EpgChannel, EpgLoadState, EpgProgram, EpgSource } from "@/types/epg";
import type { PlaylistSource } from "@/types/playlist";
import type { IPTVProfile } from "@/types/profile";

interface EpgStoreState extends EpgLoadState {
  loadForProfile: (profile: IPTVProfile, channels: IPTVChannel[], playlistSource?: PlaylistSource, options?: { prioritizedChannelIds?: string[] }) => Promise<void>;
  reload: (profile: IPTVProfile, channels: IPTVChannel[], playlistSource?: PlaylistSource, options?: { prioritizedChannelIds?: string[] }) => Promise<void>;
  reset: () => void;
}

interface EpgCacheEntry {
  key: string;
  loadedAt: string;
  source: EpgSource;
  channels: EpgChannel[];
  programs: EpgProgram[];
  programsByChannelId: Record<string, EpgProgram[]>;
  matchesByChannelId: Record<string, ReturnType<typeof matchIptvChannelsToEpg>[string]>;
}

const EPG_CACHE_TTL_MS = 45 * 60 * 1000;
const epgCache = new Map<string, EpgCacheEntry>();

const initialState: EpgLoadState = {
  status: "idle",
  channels: [],
  programs: [],
  programsByChannelId: {},
  matchesByChannelId: {},
};

export const useEpgStore = create<EpgStoreState>((set) => ({
  ...initialState,
  loadForProfile: async (profile, channels, playlistSource, options) => {
    const source = resolveEpgSource(profile, playlistSource);
    if (!source) {
      set({ ...initialState, source: undefined, status: "idle", error: "EPG no configurada" });
      return;
    }

    const cacheKey = `${profile.id}:${source.maskedUrl}:${source.proxied ? "proxy" : "direct"}`;
    const cached = epgCache.get(cacheKey);
    if (cached) {
      const ageMs = Date.now() - new Date(cached.loadedAt).getTime();
      if (ageMs >= 0 && ageMs <= EPG_CACHE_TTL_MS) {
        set({
          status: "success",
          source: cached.source,
          channels: cached.channels,
          programs: cached.programs,
          programsByChannelId: cached.programsByChannelId,
          matchesByChannelId: cached.matchesByChannelId,
          loadedAt: cached.loadedAt,
          error: undefined,
        });
        return;
      }
      epgCache.delete(cacheKey);
    }

    set({ ...initialState, source, status: "loading" });

    try {
      const xml = await fetchXmltv(source.url);
      const parsed = parseXMLTV(xml);
      const programsByChannelId = buildProgramsIndex(parsed.programs);
      const allMatches = matchIptvChannelsToEpg(channels, parsed.channels);
      const prioritizedChannelIds = options?.prioritizedChannelIds ?? [];
      const prioritizedSet = new Set(prioritizedChannelIds);
      const priorityMatches: typeof allMatches = {};
      const restMatches: typeof allMatches = {};
      for (const [channelId, match] of Object.entries(allMatches)) {
        if (prioritizedSet.has(channelId)) {
          priorityMatches[channelId] = match;
        } else {
          restMatches[channelId] = match;
        }
      }
      const loadedAt = new Date().toISOString();

      set({
        status: "success",
        source,
        channels: parsed.channels,
        programs: parsed.programs,
        programsByChannelId,
        matchesByChannelId: Object.keys(priorityMatches).length > 0 ? priorityMatches : allMatches,
        loadedAt,
        error: undefined,
      });

      window.setTimeout(() => {
        useEpgStore.setState((state) => ({
          ...state,
          matchesByChannelId: {
            ...state.matchesByChannelId,
            ...restMatches,
          },
        }));
      }, 0);

      epgCache.set(cacheKey, {
        key: cacheKey,
        loadedAt,
        source,
        channels: parsed.channels,
        programs: parsed.programs,
        programsByChannelId,
        matchesByChannelId: allMatches,
      });
    } catch (error) {
      set({
        status: "error",
        source,
        channels: [],
        programs: [],
        programsByChannelId: {},
        matchesByChannelId: {},
        error: error instanceof Error ? error.message : "No se pudo cargar XMLTV.",
      });
    }
  },
  reload: async (profile, channels, playlistSource, options) => {
    const source = resolveEpgSource(profile, playlistSource);
    if (source) {
      const cacheKey = `${profile.id}:${source.maskedUrl}:${source.proxied ? "proxy" : "direct"}`;
      epgCache.delete(cacheKey);
    }
    await useEpgStore.getState().loadForProfile(profile, channels, playlistSource, options);
  },
  reset: () => set(initialState),
}));

function buildProgramsIndex(programs: EpgProgram[]): Record<string, EpgProgram[]> {
  const map: Record<string, EpgProgram[]> = {};
  for (const program of programs) {
    if (!map[program.channelId]) {
      map[program.channelId] = [];
    }
    map[program.channelId].push(program);
  }

  for (const key of Object.keys(map)) {
    map[key] = sortProgramsByDate(map[key]);
  }

  return map;
}

function resolveEpgSource(profile: IPTVProfile, playlistSource?: PlaylistSource): EpgSource | undefined {
  const manual = profile.epgUrl?.trim();
  const useExperimentalProxy = usePlayerStore.getState().useExperimentalProxy;
  const proxyHeaderProfile = usePlayerStore.getState().proxyHeaderProfile;

  if (manual) {
    const url = useExperimentalProxy ? createProxyStreamUrl(manual, proxyHeaderProfile) : manual;
    return {
      profileId: profile.id,
      profileName: profile.name,
      profileType: profile.type,
      url,
      maskedUrl: maskStreamUrl(manual),
      from: "manual-profile",
      proxied: useExperimentalProxy,
    };
  }

  if (profile.type === "m3u") {
    const hint = playlistSource?.suggestedEpgUrls?.[0];
    if (!hint) {
      return undefined;
    }
    const url = useExperimentalProxy ? createProxyStreamUrl(hint, proxyHeaderProfile) : hint;
    return {
      profileId: profile.id,
      profileName: profile.name,
      profileType: profile.type,
      url,
      maskedUrl: maskStreamUrl(hint),
      from: "m3u-header",
      proxied: useExperimentalProxy,
    };
  }

  if (profile.type === "xtream" && profile.xtream) {
    const xmltvUrl = buildXtreamXmltvUrl(profile.xtream);
    const url = useExperimentalProxy ? createProxyStreamUrl(xmltvUrl, proxyHeaderProfile) : xmltvUrl;
    return {
      profileId: profile.id,
      profileName: profile.name,
      profileType: profile.type,
      url,
      maskedUrl: maskStreamUrl(xmltvUrl),
      from: "xtream-default",
      proxied: useExperimentalProxy,
    };
  }

  return undefined;
}

async function fetchXmltv(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", mode: "cors" });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("No se pudo descargar la EPG XMLTV. Puede ser bloqueo CORS o red no accesible desde navegador.");
    }
    throw error instanceof Error ? error : new Error("No se pudo descargar la EPG XMLTV.");
  }

  if (!response.ok) {
    throw new Error(`La EPG respondió con HTTP ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (/text\/html/i.test(contentType) || /^\s*<html/i.test(text)) {
    throw new Error("La URL EPG respondió HTML en lugar de XMLTV.");
  }

  return text;
}

export function getEpgProgramsForIptvChannel(
  iptvChannelId: string,
  programsByChannelId: Record<string, EpgProgram[]>,
  matchesByChannelId: Record<string, { epgChannelId?: string }>,
): EpgProgram[] {
  const epgChannelId = matchesByChannelId[iptvChannelId]?.epgChannelId;
  if (!epgChannelId) {
    return [];
  }
  return programsByChannelId[epgChannelId] ?? [];
}

export function getEpgChannelByIptvChannel(
  iptvChannelId: string,
  epgChannels: EpgChannel[],
  matchesByChannelId: Record<string, { epgChannelId?: string }>,
): EpgChannel | undefined {
  const epgChannelId = matchesByChannelId[iptvChannelId]?.epgChannelId;
  if (!epgChannelId) {
    return undefined;
  }
  return epgChannels.find((item) => item.id === epgChannelId);
}
