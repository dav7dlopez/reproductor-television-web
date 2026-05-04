import type { XtreamCredentialsInput } from "@/lib/xtream/xtreamTypes";

export function normalizeServerUrl(serverUrl: string): string {
  return serverUrl.trim().replace(/\/+$/, "");
}

export function buildPlayerApiUrl(credentials: XtreamCredentialsInput, action?: string): string {
  const url = new URL(`${normalizeServerUrl(credentials.serverUrl)}/player_api.php`);
  url.searchParams.set("username", credentials.username);
  url.searchParams.set("password", credentials.password);
  if (action) {
    url.searchParams.set("action", action);
  }
  return url.toString();
}

export function buildXtreamStreamUrl(credentials: XtreamCredentialsInput, streamId: string | number, extension: "m3u8" | "ts" = "m3u8"): string {
  const encodedUser = encodeURIComponent(credentials.username);
  const encodedPassword = encodeURIComponent(credentials.password);
  const encodedStreamId = encodeURIComponent(String(streamId));
  return `${normalizeServerUrl(credentials.serverUrl)}/live/${encodedUser}/${encodedPassword}/${encodedStreamId}.${extension}`;
}

export function buildXtreamXmltvUrl(credentials: XtreamCredentialsInput): string {
  const url = new URL(`${normalizeServerUrl(credentials.serverUrl)}/xmltv.php`);
  url.searchParams.set("username", credentials.username);
  url.searchParams.set("password", credentials.password);
  return url.toString();
}

export function maskXtreamUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/");
    const liveIndex = segments.findIndex((segment) => segment === "live");
    if (liveIndex >= 0) {
      if (segments[liveIndex + 1]) segments[liveIndex + 1] = maskValue(segments[liveIndex + 1]);
      if (segments[liveIndex + 2]) segments[liveIndex + 2] = "••••••";
    }
    parsed.pathname = segments.join("/");
    parsed.searchParams.delete("username");
    parsed.searchParams.delete("password");
    return `${parsed.origin}${parsed.pathname}${parsed.search ? "?…" : ""}`;
  } catch {
    return url.replace(/(username=)[^&]+/i, "$1••••").replace(/(password=)[^&]+/i, "$1••••");
  }
}

function maskValue(value: string): string {
  if (value.length <= 2) {
    return "••";
  }
  return `${value.slice(0, 1)}•••${value.slice(-1)}`;
}
