export type ChannelSourceType = "m3u" | "xtream";

export interface XtreamChannelMeta {
  streamId: string;
  epgChannelId?: string;
  categoryId?: string;
  categoryName?: string;
  tvArchive?: string | number;
  directSource?: string;
  hlsUrl?: string;
  tsUrl?: string;
  usesDirectSource?: boolean;
}

export interface IPTVChannel {
  id: string;
  name: string;
  normalizedName: string;
  tvgId?: string;
  tvgName?: string;
  tvgLogo?: string;
  logo?: string;
  groupTitle?: string;
  streamUrl: string;
  country: string;
  countryCode?: string;
  category: string;
  sourceIndex: number;
  sourceType?: ChannelSourceType;
  searchIndex?: string;
  xtream?: XtreamChannelMeta;
}

export interface CategoryGroup {
  name: string;
  normalizedName: string;
  channels: IPTVChannel[];
}

export interface ChannelGroup {
  country: string;
  countryCode?: string;
  priority: number;
  categories: CategoryGroup[];
  totalChannels: number;
}
