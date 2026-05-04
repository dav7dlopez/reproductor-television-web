export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

export type StreamType = "hls" | "mpegts" | "mp4" | "unknown";

export type PlaybackStrategy = "native" | "hlsjs" | "hls_candidate" | "mpegtsjs" | "unknown_native";

export type PlaybackStrategyPreference = "auto" | "prefer-hls" | "force-hls" | "force-mpegts" | "force-mpegts-proxy" | "force-transmux-proxy" | "direct-source";
export type ProxyHeaderProfile = "default" | "browser-like" | "vlc-like" | "iptv-smarters-like" | "tivimate-like" | "generic-iptv" | "no-origin";

export type AttemptResult = "not_attempted" | "attempting" | "success" | "failed" | "unsupported" | "skipped";

export type PlaybackErrorCode =
  | "stream_unreachable"
  | "cors_or_network"
  | "unsupported_format"
  | "timeout"
  | "media_error"
  | "hls_error"
  | "mpegts_direct"
  | "mpegts_error"
  | "unknown";

export interface PlaybackAttempt {
  id: string;
  label: string;
  strategy: PlaybackStrategy;
  maskedUrl: string;
  streamType: StreamType;
  result: AttemptResult;
  error?: string;
}

export interface StreamDiagnostics {
  maskedUrl: string;
  proxyEnabled: boolean;
  proxyHeaderProfile?: ProxyHeaderProfile;
  activeUrlIsProxied?: boolean;
  streamType: StreamType;
  extension?: string;
  looksLikeHls: boolean;
  looksLikeMpegTs: boolean;
  looksLikeMp4: boolean;
  nativeHls: boolean;
  hlsJs: boolean;
  mpegtsJs: boolean;
  pip: boolean;
  fullscreen: boolean;
  sourceType?: "m3u" | "xtream";
  profileType?: "m3u" | "xtream";
  streamId?: string;
  usesDirectSource?: boolean;
  urlOrigin: "m3u-original" | "xtream-generated" | "xtream-direct-source" | "unknown";
  originalExtension?: string;
  preferredStrategy: PlaybackStrategyPreference;
  xtreamHlsUrl?: string;
  xtreamTsUrl?: string;
  xtreamDirectSource?: string;
  hlsCandidateUrl?: string;
  hasHlsCandidate: boolean;
  hlsCandidateAttempt: AttemptResult;
  mpegtsAttempt: AttemptResult;
  attempts: PlaybackAttempt[];
  activeStrategy?: PlaybackStrategy;
  lastTechnicalError?: string;
  ignoredInterruptedPlay?: boolean;
  proxyRemoteStatus?: string;
  proxyContentType?: string;
  proxyError?: string;
  proxyManifestValid?: string;
  proxyManifestRewritten?: string;
  proxyRewrittenCount?: string;
  proxyRangeUsed?: string;
  proxyProbeFirstBytes?: string;
  possibleProxyNextStep?: boolean;
}

export interface PlaybackError {
  code: PlaybackErrorCode;
  title: string;
  message: string;
  technicalDetail?: string;
  suggestion?: string;
  recoverable: boolean;
  diagnostics?: StreamDiagnostics;
}
