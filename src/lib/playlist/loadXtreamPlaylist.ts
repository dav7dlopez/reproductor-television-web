import { mapXtreamStreamsToChannels } from "@/lib/xtream/xtreamMapper";
import { loadXtreamLiveData } from "@/lib/xtream/xtreamClient";
import type { XtreamCredentialsInput } from "@/lib/xtream/xtreamTypes";
import type { IPTVChannel } from "@/types/channel";

export async function loadXtreamPlaylist(credentials: XtreamCredentialsInput): Promise<IPTVChannel[]> {
  const data = await loadXtreamLiveData(credentials);
  return mapXtreamStreamsToChannels(credentials, data.categories, data.streams);
}
