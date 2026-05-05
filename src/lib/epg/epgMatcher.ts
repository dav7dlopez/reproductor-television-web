import { normalizeText } from "@/lib/normalizers/normalizeText";
import type { IPTVChannel } from "@/types/channel";
import type { ChannelEpgMatch, EpgChannel } from "@/types/epg";

interface EpgChannelIndex {
  byId: Map<string, EpgChannel>;
  byNormalizedDisplayName: Map<string, EpgChannel[]>;
  byFlexibleNormalizedName: Map<string, EpgChannel[]>;
}

export function buildEpgChannelIndex(epgChannels: EpgChannel[]): EpgChannelIndex {
  const byId = new Map<string, EpgChannel>();
  const byNormalizedDisplayName = new Map<string, EpgChannel[]>();
  const byFlexibleNormalizedName = new Map<string, EpgChannel[]>();

  for (const channel of epgChannels) {
    byId.set(channel.id, channel);
    for (const normalizedName of channel.normalizedNames) {
      if (!byNormalizedDisplayName.has(normalizedName)) {
        byNormalizedDisplayName.set(normalizedName, []);
      }
      byNormalizedDisplayName.get(normalizedName)!.push(channel);

      const flexible = normalizeFlexibleName(normalizedName);
      if (flexible) {
        if (!byFlexibleNormalizedName.has(flexible)) {
          byFlexibleNormalizedName.set(flexible, []);
        }
        byFlexibleNormalizedName.get(flexible)!.push(channel);
      }
    }
  }

  return { byId, byNormalizedDisplayName, byFlexibleNormalizedName };
}

export function matchIptvChannelsToEpg(channels: IPTVChannel[], epgChannels: EpgChannel[]): Record<string, ChannelEpgMatch> {
  const index = buildEpgChannelIndex(epgChannels);
  const result: Record<string, ChannelEpgMatch> = {};

  for (const channel of channels) {
    const match = findBestMatch(channel, index);
    result[channel.id] = match;
  }

  return result;
}

function findBestMatch(channel: IPTVChannel, index: EpgChannelIndex): ChannelEpgMatch {
  if (channel.tvgId && index.byId.has(channel.tvgId)) {
    return { channelId: channel.id, epgChannelId: channel.tvgId, method: "tvg-id", confidence: 1 };
  }

  const xtreamEpgId = channel.xtream?.epgChannelId;
  if (xtreamEpgId && index.byId.has(xtreamEpgId)) {
    return { channelId: channel.id, epgChannelId: xtreamEpgId, method: "epg_channel_id", confidence: 0.96 };
  }

  const candidates = [channel.tvgName, channel.name].filter(Boolean) as string[];
  for (const value of candidates) {
    const normalized = normalizeText(value);
    const direct = index.byNormalizedDisplayName.get(normalized)?.[0];
    if (direct) {
      return { channelId: channel.id, epgChannelId: direct.id, method: value === channel.tvgName ? "tvg-name" : "normalized-name", confidence: value === channel.tvgName ? 0.92 : 0.88 };
    }
  }

  const flexible = normalizeFlexibleName(channel.name);
  if (flexible) {
    const flexMatch = index.byFlexibleNormalizedName.get(flexible)?.[0];
    if (flexMatch) {
      return { channelId: channel.id, epgChannelId: flexMatch.id, method: "flex", confidence: 0.72 };
    }
  }

  return { channelId: channel.id, method: "none", confidence: 0 };
}

function normalizeFlexibleName(value: string): string {
  return normalizeText(value)
    .replace(/\b\|?es\|?\b/g, " ")
    .replace(/\b(fhd|hd|sd|hevc)\b/g, " ")
    .replace(/\b(españa|espana|spain)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
