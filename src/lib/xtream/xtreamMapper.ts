import { normalizeCategory } from "@/lib/normalizers/normalizeCategory";
import { normalizeCountry } from "@/lib/normalizers/normalizeCountry";
import { normalizeText } from "@/lib/normalizers/normalizeText";
import { buildXtreamStreamUrl } from "@/lib/xtream/xtreamUrls";
import type { XtreamCredentialsInput, XtreamLiveCategory, XtreamLiveStream } from "@/lib/xtream/xtreamTypes";
import type { IPTVChannel } from "@/types/channel";

export function mapXtreamStreamsToChannels(credentials: XtreamCredentialsInput, categories: XtreamLiveCategory[], streams: XtreamLiveStream[]): IPTVChannel[] {
  const categoriesById = new Map(categories.map((category) => [String(category.category_id), category.category_name]));

  return streams.map((stream, index) => {
    const categoryName = stream.category_id ? categoriesById.get(String(stream.category_id)) : undefined;
    const groupTitle = categoryName ?? "Xtream Live";
    const name = stream.name?.trim() || `Canal Xtream ${stream.stream_id}`;
    const country = normalizeCountry(groupTitle, stream.epg_channel_id, name);
    const category = normalizeCategory(categoryName, name);
    const hlsUrl = buildXtreamStreamUrl(credentials, stream.stream_id, "m3u8");
    const tsUrl = buildXtreamStreamUrl(credentials, stream.stream_id, "ts");
    const directSource = stream.direct_source?.trim() || undefined;
    const streamUrl = hlsUrl;

    return {
      id: `xtream-${stream.stream_id}`,
      name,
      normalizedName: normalizeText(name),
      tvgId: stream.epg_channel_id || undefined,
      tvgName: name,
      tvgLogo: stream.stream_icon || undefined,
      logo: stream.stream_icon || undefined,
      groupTitle,
      streamUrl,
      country: country.name,
      countryCode: country.code,
      category,
      sourceIndex: index,
      sourceType: "xtream",
      xtream: {
        streamId: String(stream.stream_id),
        epgChannelId: stream.epg_channel_id || undefined,
        categoryId: stream.category_id ? String(stream.category_id) : undefined,
        categoryName,
        tvArchive: stream.tv_archive,
        directSource,
        hlsUrl,
        tsUrl,
        usesDirectSource: false,
      },
    } satisfies IPTVChannel;
  });
}
