export type ProfileType = "m3u" | "xtream";

export interface XtreamCredentials {
  serverUrl: string;
  username: string;
  password: string;
}

export interface IPTVProfile {
  id: string;
  name: string;
  type: ProfileType;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  m3uUrl?: string;
  epgUrl?: string;
  xtream?: XtreamCredentials;
}

export type NewProfileInput = Omit<IPTVProfile, "id" | "createdAt" | "updatedAt" | "lastUsedAt">;
