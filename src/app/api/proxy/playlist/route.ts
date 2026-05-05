import { NextRequest } from "next/server";
import { maskStreamUrl } from "@/lib/player/playbackSupport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

// Lightweight proxy for playlist text download only (M3U/M3U8).
// Do not use this endpoint for media segment streaming/transmuxing.
export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return Response.json({ error: "Missing playlist URL." }, { status: 400, headers: noCacheHeaders() });
  }

  let remoteUrl: URL;
  try {
    remoteUrl = new URL(rawUrl);
  } catch {
    return Response.json({ error: "Invalid playlist URL." }, { status: 400, headers: noCacheHeaders() });
  }

  if (!ALLOWED_PROTOCOLS.has(remoteUrl.protocol)) {
    return Response.json({ error: "Unsupported URL protocol." }, { status: 400, headers: noCacheHeaders() });
  }

  let upstream: Response;
  try {
    upstream = await fetch(remoteUrl.toString(), {
      cache: "no-store",
      redirect: "follow",
    });
  } catch {
    return Response.json(
      { error: "No se pudo descargar la playlist desde el servidor proxy ligero." },
      { status: 502, headers: noCacheHeaders() },
    );
  }

  if (!upstream.ok) {
    const safe = maskStreamUrl(remoteUrl.toString());
    return Response.json(
      { error: `El proveedor devolvió HTTP ${upstream.status} al solicitar la playlist. URL: ${safe}` },
      { status: upstream.status, headers: noCacheHeaders() },
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  const text = await upstream.text();

  const headers = noCacheHeaders();
  headers.set("access-control-allow-origin", "*");
  headers.set("content-type", sanitizePlaylistContentType(contentType));
  headers.set("x-iptvweb-playlist-proxy", "lightweight");
  headers.set("x-iptvweb-playlist-length", String(text.length));
  return new Response(text, { status: 200, headers });
}

function sanitizePlaylistContentType(input: string): string {
  const lower = input.toLowerCase();
  if (lower.includes("mpegurl") || lower.includes("m3u")) {
    return "application/vnd.apple.mpegurl; charset=utf-8";
  }
  if (lower.includes("text/plain")) {
    return "text/plain; charset=utf-8";
  }
  return "text/plain; charset=utf-8";
}

function noCacheHeaders() {
  const headers = new Headers();
  headers.set("cache-control", "no-store");
  return headers;
}

