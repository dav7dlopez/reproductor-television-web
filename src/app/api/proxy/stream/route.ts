import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const HLS_CONTENT_TYPES = ["application/vnd.apple.mpegurl", "application/x-mpegurl", "audio/mpegurl"];
const TEXT_CONTENT_TYPES = ["text/", "application/json", "application/xml", "application/vnd.apple.mpegurl", "application/x-mpegurl", "audio/mpegurl"];
const PROXY_HEADER_PROFILES = ["default", "browser-like", "vlc-like", "iptv-smarters-like", "tivimate-like", "generic-iptv", "no-origin"] as const;
type ProxyHeaderProfile = (typeof PROXY_HEADER_PROFILES)[number];

// Experimental diagnostic proxy for user-authorized IPTV sources only.
// It exists to distinguish browser/CORS failures from parser/player failures.
// Do not log full remote URLs here: IPTV URLs may contain usernames/passwords/tokens.
export async function GET(request: NextRequest) {
  const encodedUrl = request.nextUrl.searchParams.get("url");
  const encodedSafe = request.nextUrl.searchParams.get("u");
  const profile = normalizeProfile(request.nextUrl.searchParams.get("profile"));
  const isProbe = request.nextUrl.searchParams.get("probe") === "1";
  const rawUrl = encodedUrl ?? decodeProxyTarget(encodedSafe);

  if (!rawUrl) {
    return safeError("Missing url parameter", 400);
  }

  let remoteUrl: URL;
  try {
    remoteUrl = new URL(rawUrl);
  } catch {
    return safeError("Invalid remote URL", 400);
  }

  if (!ALLOWED_PROTOCOLS.has(remoteUrl.protocol)) {
    return safeError("Unsupported remote URL protocol", 400);
  }

  let upstream: Response;
  const forwardedRange = request.headers.get("range");
  try {
    upstream = await fetch(remoteUrl, {
      cache: "no-store",
      headers: createForwardHeaders(request, profile, isProbe),
      redirect: "follow",
    });
  } catch {
    return safeError("Unable to fetch remote stream. The provider may block server-side access or the URL may be unavailable.", 502);
  }

  const remoteContentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const safeHeaders = createResponseHeaders(remoteContentType, upstream.status, profile, Boolean(forwardedRange), upstream.headers.get("accept-ranges"), remoteUrl);
  const expectedManifest = isExpectedHlsManifest(remoteUrl, remoteContentType);
  const isMpegTs = isLikelyMpegTs(remoteUrl, remoteContentType);

  if (isProbe) {
    return buildProbeResponse(upstream, remoteUrl, safeHeaders, expectedManifest, isMpegTs);
  }

  if (!upstream.ok) {
    const statusText = upstream.statusText || getHttpStatusLabel(upstream.status);
    safeHeaders.set("x-iptvweb-proxy-error", "remote-http-error");
    safeHeaders.set("x-iptvweb-proxy-manifest-valid", "false");
    safeHeaders.set("x-iptvweb-proxy-manifest-rewritten", "false");
    safeHeaders.set("x-iptvweb-proxy-rewritten-count", "0");
    return safeJsonError(`El proveedor devolvió ${upstream.status} ${statusText} al solicitar el manifest/segmento.`, upstream.status, safeHeaders);
  }

  if (expectedManifest) {
    const text = await upstream.text();
    const validation = validateManifestText(text, remoteContentType);

    if (!validation.valid) {
      safeHeaders.set("x-iptvweb-proxy-error", validation.reason);
      safeHeaders.set("x-iptvweb-proxy-manifest-valid", "false");
      safeHeaders.set("x-iptvweb-proxy-manifest-rewritten", "false");
      safeHeaders.set("x-iptvweb-proxy-rewritten-count", "0");
      safeHeaders.set("content-type", "application/json; charset=utf-8");
      return safeJsonError(validation.message, 502, safeHeaders, validation.preview);
    }

    const rewritten = rewriteHlsManifest(text, remoteUrl, profile);
    safeHeaders.set("content-type", "application/vnd.apple.mpegurl; charset=utf-8");
    safeHeaders.set("x-iptvweb-proxy-manifest-valid", "true");
    safeHeaders.set("x-iptvweb-proxy-manifest-rewritten", "true");
    safeHeaders.set("x-iptvweb-proxy-rewritten-count", String(rewritten.rewrittenCount));
    return new Response(rewritten.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: safeHeaders,
    });
  }

  if (isHtmlContent(remoteContentType)) {
    safeHeaders.set("x-iptvweb-proxy-error", "remote-html-response");
    safeHeaders.set("x-iptvweb-proxy-manifest-valid", "false");
    safeHeaders.set("x-iptvweb-proxy-manifest-rewritten", "false");
    safeHeaders.set("x-iptvweb-proxy-rewritten-count", "0");
    return safeJsonError("La respuesta remota no es un manifest HLS, parece HTML.", 502, safeHeaders);
  }

  safeHeaders.set("x-iptvweb-proxy-manifest-valid", "not-applicable");
  safeHeaders.set("x-iptvweb-proxy-manifest-rewritten", "false");
  safeHeaders.set("x-iptvweb-proxy-rewritten-count", "0");
  if (upstream.status === 206) {
    safeHeaders.set("accept-ranges", upstream.headers.get("accept-ranges") ?? "bytes");
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) {
      safeHeaders.set("content-range", contentRange);
    }
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: safeHeaders,
  });
}

function createForwardHeaders(request: NextRequest, profile: ProxyHeaderProfile, isProbe: boolean): Headers {
  const headers = new Headers();
  const range = request.headers.get("range");
  if (range) {
    headers.set("range", range);
  } else if (isProbe) {
    headers.set("range", "bytes=0-511");
  }

  const selected = getProfileHeaders(profile, request);
  Object.entries(selected).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    headers.set(key, value);
  });

  return headers;
}

function createResponseHeaders(
  contentType: string,
  remoteStatus: number,
  profile: ProxyHeaderProfile,
  rangeForwarded: boolean,
  acceptRanges: string | null,
  remoteUrl: URL,
): Headers {
  const headers = new Headers();
  headers.set("access-control-allow-origin", "*");
  headers.set("cache-control", "no-store");
  headers.set("content-type", sanitizeContentType(contentType, remoteUrl));
  headers.set("x-iptvweb-proxy", "experimental");
  headers.set("x-iptvweb-proxy-profile", profile);
  headers.set("x-iptvweb-proxy-remote-status", String(remoteStatus));
  headers.set("x-iptvweb-proxy-content-type", sanitizeContentType(contentType, remoteUrl));
  headers.set("x-iptvweb-proxy-range-used", rangeForwarded ? "yes" : "no");
  if (acceptRanges) {
    headers.set("accept-ranges", acceptRanges);
  }
  return headers;
}

function isExpectedHlsManifest(url: URL, contentType: string): boolean {
  const lowerType = contentType.toLowerCase();
  return url.pathname.toLowerCase().endsWith(".m3u8") || HLS_CONTENT_TYPES.some((type) => lowerType.includes(type));
}

function validateManifestText(text: string, contentType: string): { valid: true } | { valid: false; reason: string; message: string; preview?: string } {
  const trimmed = text.trimStart();

  if (isHtmlContent(contentType) || /^<html[\s>]/i.test(trimmed) || /^<!doctype\s+html/i.test(trimmed)) {
    return {
      valid: false,
      reason: "remote-html-response",
      message: "La respuesta remota no es un manifest HLS, parece HTML.",
      preview: safePreview(trimmed),
    };
  }

  if (!trimmed.startsWith("#EXTM3U")) {
    return {
      valid: false,
      reason: "invalid-hls-manifest",
      message: "La respuesta remota no parece un manifest HLS válido.",
      preview: safePreview(trimmed),
    };
  }

  return { valid: true };
}

function rewriteHlsManifest(body: string, manifestUrl: URL, profile: ProxyHeaderProfile): { body: string; rewrittenCount: number } {
  const trimmedBody = body.trimStart();
  if (!trimmedBody.startsWith("#EXTM3U") || /^<html[\s>]/i.test(trimmedBody) || /^<!doctype\s+html/i.test(trimmedBody)) {
    return { body, rewrittenCount: 0 };
  }

  let rewrittenCount = 0;
  const lines = body.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return line;
    }

    if (!trimmed.startsWith("#")) {
      if (looksLikeHtmlLine(trimmed)) {
        return line;
      }
      rewrittenCount += 1;
      return proxifyUrl(new URL(trimmed, manifestUrl), profile);
    }

    const rewrittenTag = rewriteUriAttributes(line, manifestUrl, profile);
    if (rewrittenTag !== line) {
      rewrittenCount += 1;
    }
    return rewrittenTag;
  });

  return { body: lines.join("\n"), rewrittenCount };
}

function rewriteUriAttributes(line: string, manifestUrl: URL, profile: ProxyHeaderProfile): string {
  return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
    if (looksLikeHtmlLine(uri)) {
      return `URI="${uri}"`;
    }
    return `URI="${proxifyUrl(new URL(uri, manifestUrl), profile)}"`;
  });
}

function proxifyUrl(url: URL, profile: ProxyHeaderProfile): string {
  const params = new URLSearchParams();
  params.set("u", encodeProxyTarget(url.toString()));
  if (profile !== "default") {
    params.set("profile", profile);
  }
  return `/api/proxy/stream?${params.toString()}`;
}

function sanitizeContentType(contentType: string, remoteUrl?: URL): string {
  const lower = contentType.toLowerCase();
  const path = remoteUrl?.pathname.toLowerCase() ?? "";
  if (path.endsWith(".ts") || path.endsWith(".mpegts")) return "video/mp2t";
  if (lower.includes("mpegurl") || lower.includes("m3u8")) return "application/vnd.apple.mpegurl";
  if (lower.includes("html")) return "text/html";
  if (lower.includes("json")) return "application/json";
  if (lower.includes("video/mp2t")) return "video/mp2t";
  if (lower.includes("mp4")) return "video/mp4";
  if (TEXT_CONTENT_TYPES.some((type) => lower.includes(type))) return "text/plain";
  return "application/octet-stream";
}

function isHtmlContent(contentType: string): boolean {
  return contentType.toLowerCase().includes("html");
}

function looksLikeHtmlLine(value: string): boolean {
  return /^<\/?[a-z][\s>]/i.test(value) || /^<!doctype/i.test(value);
}

function safePreview(value: string): string | undefined {
  if (process.env.NODE_ENV !== "development") {
    return undefined;
  }
  return value.slice(0, 120).replace(/(username=)[^&\s]+/gi, "$1••••").replace(/(password=)[^&\s]+/gi, "$1••••");
}

function safeError(message: string, status: number) {
  return safeJsonError(message, status, new Headers({ "cache-control": "no-store" }));
}

function safeJsonError(message: string, status: number, headers: Headers, preview?: string) {
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  const body = preview ? { error: message, preview } : { error: message };
  return Response.json(body, { status, headers });
}

function getHttpStatusLabel(status: number): string {
  switch (status) {
    case 401:
      return "Unauthorized";
    case 403:
      return "Forbidden";
    case 404:
      return "Not Found";
    default:
      return "HTTP error";
  }
}

function isLikelyMpegTs(url: URL, contentType: string): boolean {
  const path = url.pathname.toLowerCase();
  const lowerType = contentType.toLowerCase();
  return path.endsWith(".ts") || path.endsWith(".mpegts") || lowerType.includes("video/mp2t");
}

function normalizeProfile(value: string | null): ProxyHeaderProfile {
  if (!value) {
    return "default";
  }
  return PROXY_HEADER_PROFILES.includes(value as ProxyHeaderProfile) ? (value as ProxyHeaderProfile) : "default";
}

function encodeProxyTarget(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeProxyTarget(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return undefined;
  }
}

function getProfileHeaders(profile: ProxyHeaderProfile, request: NextRequest): Record<string, string | undefined> {
  const browserUserAgent = request.headers.get("user-agent") ?? "Mozilla/5.0";

  switch (profile) {
    case "browser-like":
      return { "user-agent": browserUserAgent, accept: request.headers.get("accept") ?? "*/*", connection: "keep-alive" };
    case "vlc-like":
      return { "user-agent": "VLC/3.0.20 LibVLC/3.0.20", accept: "*/*", connection: "keep-alive" };
    case "iptv-smarters-like":
      return { "user-agent": "IPTV Smarters/1.0", accept: "*/*", connection: "keep-alive", referer: "" };
    case "tivimate-like":
      return { "user-agent": "TiviMate/5.1.0", accept: "*/*", connection: "keep-alive" };
    case "generic-iptv":
      return { "user-agent": "IPTVPlayer", accept: "*/*", connection: "keep-alive" };
    case "no-origin":
      return { "user-agent": "IPTVWeb diagnostic proxy", accept: "*/*", connection: "keep-alive", origin: "" };
    case "default":
    default:
      return { "user-agent": request.headers.get("user-agent") ?? "IPTVWeb diagnostic proxy", accept: request.headers.get("accept") ?? "*/*", connection: "keep-alive" };
  }
}

async function buildProbeResponse(upstream: Response, remoteUrl: URL, headers: Headers, expectedManifest: boolean, isMpegTs: boolean): Promise<Response> {
  const safeType = sanitizeContentType(upstream.headers.get("content-type") ?? "");
  const isHtml = isHtmlContent(safeType);
  const isStatusError = !upstream.ok;

  let firstBytes: string | undefined;
  try {
    const reader = upstream.clone().body?.getReader();
    if (reader) {
      const { value } = await reader.read();
      await reader.cancel();
      const bytes = value ?? new Uint8Array(0);
      firstBytes = Array.from(bytes.slice(0, 24)).map((item) => item.toString(16).padStart(2, "0")).join(" ");
    }
  } catch {
    firstBytes = undefined;
  }

  const payload = {
    ok: upstream.ok,
    status: upstream.status,
    statusText: upstream.statusText || getHttpStatusLabel(upstream.status),
    remoteContentType: safeType,
    contentLength: upstream.headers.get("content-length") ?? undefined,
    acceptRanges: upstream.headers.get("accept-ranges") ?? undefined,
    looksLikeVideoMp2t: safeType === "video/mp2t" || isMpegTs,
    looksLikeHtml: isHtml,
    expectedManifest,
    manifestValid: false,
    rewritten: false,
    profile: headers.get("x-iptvweb-proxy-profile") ?? "default",
    firstBytesHex: process.env.NODE_ENV === "development" ? firstBytes : undefined,
    error:
      isStatusError
        ? `El proveedor devolvió ${upstream.status} ${upstream.statusText || getHttpStatusLabel(upstream.status)} al solicitar el recurso remoto.`
        : isHtml
          ? "La respuesta remota parece HTML."
          : undefined,
  };

  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-iptvweb-proxy-manifest-valid", "false");
  headers.set("x-iptvweb-proxy-manifest-rewritten", "false");
  headers.set("x-iptvweb-proxy-rewritten-count", "0");
  if (payload.looksLikeHtml) {
    headers.set("x-iptvweb-proxy-error", "remote-html-response");
  } else if (!upstream.ok) {
    headers.set("x-iptvweb-proxy-error", "remote-http-error");
  }

  return Response.json(payload, { status: upstream.status, headers });
}
