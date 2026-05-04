import { NextRequest } from "next/server";
import { createProxyStreamUrl } from "@/lib/player/playbackSupport";
import { ensureFfmpegAvailable, getSessionDebugInfo, startSession, waitForPlaylist } from "@/lib/transmux/sessionManager";
import type { ProxyHeaderProfile } from "@/types/player";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StartSessionBody {
  url?: string;
  profile?: ProxyHeaderProfile;
}

export async function POST(request: NextRequest) {
  let body: StartSessionBody;
  try {
    body = (await request.json()) as StartSessionBody;
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const remoteUrl = body.url;
  const profile = body.profile ?? "default";

  if (!remoteUrl) {
    return Response.json({ error: "Missing stream URL" }, { status: 400 });
  }

  if (!ensureFfmpegAvailable()) {
    return Response.json({ error: "Transmux unavailable: ffmpeg binary not found in runtime" }, { status: 503 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(remoteUrl);
  } catch {
    return Response.json({ error: "Invalid stream URL" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return Response.json({ error: "Unsupported URL protocol" }, { status: 400 });
  }

  const upstreamProxyPath = createProxyStreamUrl(parsedUrl.toString(), profile);
  const upstreamProxyUrl = new URL(upstreamProxyPath, request.nextUrl.origin).toString();

  const session = startSession(upstreamProxyUrl);
  const ready = await waitForPlaylist(session.id);
  if (!ready) {
    const debug = getSessionDebugInfo(session.id);
    if (debug.ended) {
      return Response.json({
        error: "Transmux process ended before playlist was ready",
        id: session.id,
        debug,
      }, { status: 502 });
    }

    return Response.json({
      id: session.id,
      status: "starting",
      playlistUrl: `/api/transmux/session/${session.id}/index.m3u8`,
      debug,
    });
  }

  return Response.json({
    id: session.id,
    status: "ready",
    playlistUrl: `/api/transmux/session/${session.id}/index.m3u8`,
  });
}
