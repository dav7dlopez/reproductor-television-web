import Hls from "hls.js";
import type { IPTVChannel } from "@/types/channel";
import type { AttemptResult, PlaybackAttempt, PlaybackStrategy, PlaybackStrategyPreference, ProxyHeaderProfile, StreamDiagnostics, StreamType } from "@/types/player";

export interface PlaybackSupport {
  nativeHls: boolean;
  hlsJs: boolean;
  mpegtsJs: boolean;
  pip: boolean;
  fullscreen: boolean;
}

export interface StreamFormatInfo {
  type: StreamType;
  extension?: string;
  looksLikeHls: boolean;
  looksLikeMpegTs: boolean;
  looksLikeMp4: boolean;
}

export interface DiagnosticsOverrides {
  hlsCandidateAttempt?: AttemptResult;
  mpegtsAttempt?: AttemptResult;
  activeStrategy?: PlaybackStrategy;
  lastTechnicalError?: string;
  ignoredInterruptedPlay?: boolean;
  attempts?: PlaybackAttempt[];
  preferredStrategy?: PlaybackStrategyPreference;
  proxyEnabled?: boolean;
  proxyHeaderProfile?: ProxyHeaderProfile;
  activeUrlIsProxied?: boolean;
  proxyRemoteStatus?: string;
  proxyContentType?: string;
  proxyError?: string;
  proxyManifestValid?: string;
  proxyManifestRewritten?: string;
  proxyRewrittenCount?: string;
  proxyRangeUsed?: string;
  proxyProbeFirstBytes?: string;
}

export function canPlayNativeHls(video: HTMLVideoElement): boolean {
  return Boolean(
    video.canPlayType("application/vnd.apple.mpegurl") ||
      video.canPlayType("application/x-mpegURL") ||
      video.canPlayType("audio/mpegurl"),
  );
}

export function isMpegTsSupported(): boolean {
  return Boolean(typeof window !== "undefined" && "MediaSource" in window && window.MediaSource);
}

export function isPictureInPictureAvailable(video: HTMLVideoElement): boolean {
  return Boolean(
    typeof document !== "undefined" &&
      "pictureInPictureEnabled" in document &&
      document.pictureInPictureEnabled &&
      "requestPictureInPicture" in video,
  );
}

export function isFullscreenAvailable(element: HTMLElement | null): boolean {
  return Boolean(element?.requestFullscreen);
}

export function detectStreamFormat(url: string): StreamFormatInfo {
  const extension = getStreamExtension(url);

  if (extension === "m3u8" || extension === "m3u") {
    return createStreamFormat("hls", extension);
  }

  if (extension === "ts" || extension === "mpegts") {
    return createStreamFormat("mpegts", extension);
  }

  if (extension === "mp4") {
    return createStreamFormat("mp4", extension);
  }

  return createStreamFormat("unknown", extension);
}

export function getMpegTsCandidateForHls(url: string): string | undefined {
  const format = detectStreamFormat(url);
  if (!format.looksLikeHls) {
    return undefined;
  }

  try {
    const parsed = new URL(url);
    parsed.pathname = parsed.pathname.replace(/\.(m3u8|m3u)$/i, ".ts");
    return parsed.toString();
  } catch {
    const [baseWithMaybeQuery, hash = ""] = url.split("#", 2);
    const [path, query = ""] = baseWithMaybeQuery.split("?", 2);
    const replaced = path.replace(/\.(m3u8|m3u)$/i, ".ts");
    return `${replaced}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
  }
}

export function getHlsCandidateForMpegTs(url: string): string | undefined {
  const format = detectStreamFormat(url);
  if (!format.looksLikeMpegTs) {
    return undefined;
  }

  try {
    const parsed = new URL(url);
    parsed.pathname = replaceMpegTsExtension(parsed.pathname);
    return parsed.toString();
  } catch {
    const [baseWithMaybeQuery, hash = ""] = url.split("#", 2);
    const [path, query = ""] = baseWithMaybeQuery.split("?", 2);
    const replaced = replaceMpegTsExtension(path);
    return `${replaced}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
  }
}

export function getStreamExtension(url: string): string | undefined {
  const path = getUrlPathWithoutQuery(url);
  const lastSegment = path.split("/").filter(Boolean).pop() ?? "";
  const match = /\.([a-z0-9]+)$/i.exec(lastSegment);
  return match?.[1]?.toLowerCase();
}

export function getUrlPathWithoutQuery(url: string): string {
  const proxiedRemoteUrl = extractProxiedRemoteUrl(url);
  if (proxiedRemoteUrl) {
    return getUrlPathWithoutQuery(proxiedRemoteUrl);
  }

  try {
    return toAbsoluteUrl(url).pathname;
  } catch {
    return url.split(/[?#]/)[0] ?? url;
  }
}

export function shouldUseNativeSource(url: string, video: HTMLVideoElement): boolean {
  const format = detectStreamFormat(url);
  return format.type === "mp4" || format.type === "unknown" || (format.type === "hls" && canPlayNativeHls(video));
}

export function createStreamDiagnostics(url: string, video: HTMLVideoElement, container: HTMLElement | null, lastTechnicalError?: string, overrides?: DiagnosticsOverrides, channel?: IPTVChannel): StreamDiagnostics {
  const format = detectStreamFormat(url);
  const hlsCandidate = getHlsCandidateForMpegTs(url);
  const sourceType = channel?.sourceType;
  const xtream = channel?.xtream;
  const urlOrigin = getUrlOrigin(channel, url);
  const attempts = overrides?.attempts ?? [];
  const networkFailures = attempts.filter((attempt) => attempt.result === "failed" && /network|load failed|cors/i.test(attempt.error ?? "")).length;

  return {
    maskedUrl: maskStreamUrl(url),
    proxyEnabled: Boolean(overrides?.proxyEnabled),
    proxyHeaderProfile: overrides?.proxyHeaderProfile,
    activeUrlIsProxied: overrides?.activeUrlIsProxied,
    streamType: format.type,
    extension: format.extension,
    looksLikeHls: format.looksLikeHls,
    looksLikeMpegTs: format.looksLikeMpegTs,
    looksLikeMp4: format.looksLikeMp4,
    nativeHls: canPlayNativeHls(video),
    hlsJs: Hls.isSupported(),
    mpegtsJs: isMpegTsSupported(),
    pip: isPictureInPictureAvailable(video),
    fullscreen: isFullscreenAvailable(container),
    sourceType,
    profileType: sourceType,
    streamId: xtream?.streamId,
    usesDirectSource: Boolean(xtream?.usesDirectSource || (xtream?.directSource && xtream.directSource === url)),
    urlOrigin,
    originalExtension: getStreamExtension(url),
    preferredStrategy: overrides?.preferredStrategy ?? "auto",
    xtreamHlsUrl: xtream?.hlsUrl ? maskStreamUrl(xtream.hlsUrl) : undefined,
    xtreamTsUrl: xtream?.tsUrl ? maskStreamUrl(xtream.tsUrl) : undefined,
    xtreamDirectSource: xtream?.directSource ? maskStreamUrl(xtream.directSource) : undefined,
    hlsCandidateUrl: hlsCandidate ? maskStreamUrl(hlsCandidate) : undefined,
    hasHlsCandidate: Boolean(hlsCandidate),
    hlsCandidateAttempt: overrides?.hlsCandidateAttempt ?? "not_attempted",
    mpegtsAttempt: overrides?.mpegtsAttempt ?? "not_attempted",
    attempts,
    activeStrategy: overrides?.activeStrategy,
    lastTechnicalError: overrides?.lastTechnicalError ?? lastTechnicalError,
    ignoredInterruptedPlay: overrides?.ignoredInterruptedPlay,
    proxyRemoteStatus: overrides?.proxyRemoteStatus,
    proxyContentType: overrides?.proxyContentType,
    proxyError: overrides?.proxyError,
    proxyManifestValid: overrides?.proxyManifestValid,
    proxyManifestRewritten: overrides?.proxyManifestRewritten,
    proxyRewrittenCount: overrides?.proxyRewrittenCount,
    proxyRangeUsed: overrides?.proxyRangeUsed,
    proxyProbeFirstBytes: overrides?.proxyProbeFirstBytes,
    possibleProxyNextStep: attempts.length >= 2 && networkFailures >= 2,
  };
}


export function createProxyStreamUrl(url: string, profile: ProxyHeaderProfile = "default", probe = false): string {
  const params = new URLSearchParams();
  params.set("u", encodeProxyTarget(url));
  if (profile !== "default") {
    params.set("profile", profile);
  }
  if (probe) {
    params.set("probe", "1");
  }
  return `/api/proxy/stream?${params.toString()}`;
}

export function isProxyStreamUrl(url: string): boolean {
  return url.startsWith("/api/proxy/stream?");
}

export function maskStreamUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/");
    const liveIndex = segments.findIndex((segment) => segment === "live");

    if (liveIndex >= 0) {
      if (segments[liveIndex + 1]) segments[liveIndex + 1] = maskPathSecret(segments[liveIndex + 1]);
      if (segments[liveIndex + 2]) segments[liveIndex + 2] = "••••••";
    }

    const safePath = segments.join("/");
    const path = safePath.length > 36 ? `${safePath.slice(0, 22)}...${safePath.slice(-10)}` : safePath;
    const hasQuery = parsed.search ? "?…" : "";
    return `${parsed.origin}${path}${hasQuery}`;
  } catch {
    const clean = (url.split("#")[0] ?? url).replace(/(username=)[^&]+/i, "$1••••").replace(/(password=)[^&]+/i, "$1••••");
    return clean.length > 42 ? `${clean.slice(0, 22)}...${clean.slice(-10)}` : clean;
  }
}

function maskPathSecret(value: string): string {
  return value.length > 2 ? `${value.slice(0, 1)}•••${value.slice(-1)}` : "••";
}

function replaceMpegTsExtension(path: string): string {
  return path.replace(/\.(mpegts|ts)$/i, ".m3u8");
}

function createStreamFormat(type: StreamType, extension?: string): StreamFormatInfo {
  return {
    type,
    extension,
    looksLikeHls: type === "hls",
    looksLikeMpegTs: type === "mpegts",
    looksLikeMp4: type === "mp4",
  };
}

function toAbsoluteUrl(value: string): URL {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return new URL(value);
  }
  return new URL(value, "http://localhost");
}

function extractProxiedRemoteUrl(url: string): string | undefined {
  try {
    const parsed = toAbsoluteUrl(url);
    if (!parsed.pathname.startsWith("/api/proxy/stream")) {
      return undefined;
    }

    const encoded = parsed.searchParams.get("u");
    if (encoded) {
      return decodeProxyTarget(encoded);
    }

    const plain = parsed.searchParams.get("url");
    return plain ?? undefined;
  } catch {
    return undefined;
  }
}

function encodeProxyTarget(value: string): string {
  if (typeof window !== "undefined") {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeProxyTarget(value: string): string | undefined {
  try {
    if (typeof window !== "undefined") {
      const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
      const binary = atob(padded);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }

    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return undefined;
  }
}

function getUrlOrigin(channel: IPTVChannel | undefined, url: string): StreamDiagnostics["urlOrigin"] {
  if (!channel) {
    return "unknown";
  }

  if (channel.sourceType === "m3u") {
    return "m3u-original";
  }

  if (channel.xtream?.directSource && channel.xtream.directSource === url) {
    return "xtream-direct-source";
  }

  if (channel.sourceType === "xtream") {
    return "xtream-generated";
  }

  return "unknown";
}
