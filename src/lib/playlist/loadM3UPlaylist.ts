import { detectM3UEpgUrls, parseM3U } from "@/lib/m3u/parseM3U";
import { maskStreamUrl } from "@/lib/player/playbackSupport";
import type { IPTVChannel } from "@/types/channel";

export interface M3UPlaylistLoadResult {
  channels: IPTVChannel[];
  suggestedEpgUrls: string[];
  diagnostics: {
    method: "direct-browser" | "playlist-proxy";
    status: "success" | "error";
    fallbackUsed: boolean;
    maskedUrl: string;
    playlistSize: number;
    parsedChannels: number;
  };
}

export async function loadM3UPlaylist(url: string): Promise<M3UPlaylistLoadResult> {
  const maskedUrl = maskStreamUrl(url);
  const preferProxy = shouldPreferPlaylistProxy();
  const directFirst = !preferProxy;
  const firstTry = directFirst ? await fetchDirect(url) : await fetchViaProxy(url);
  const secondTry =
    firstTry.ok
      ? undefined
      : directFirst
        ? await fetchViaProxy(url)
        : await fetchDirect(url);
  const resolved = firstTry.ok ? firstTry : secondTry;

  if (!resolved?.ok || !resolved.content) {
    const details = [pickError(firstTry), pickError(secondTry)].filter(Boolean).join(" | ");
    throw new Error(`No se pudo cargar la playlist ni directamente ni mediante el proxy ligero. El proveedor puede estar bloqueando el acceso o la URL puede no ser válida.${details ? ` (${details})` : ""}`);
  }

  const content = resolved.content;
  const channels = parseM3U(content);
  const suggestedEpgUrls = detectM3UEpgUrls(content);
  const diagnostics = {
    method: resolved.method,
    status: "success" as const,
    fallbackUsed: !firstTry.ok,
    maskedUrl,
    playlistSize: content.length,
    parsedChannels: channels.length,
  };
  if (process.env.NODE_ENV === "development") {
    console.info("[playlist:m3u]", diagnostics);
  }

  return {
    channels,
    suggestedEpgUrls,
    diagnostics,
  };
}

function createNetworkErrorMessage(error: unknown): string {
  if (error instanceof TypeError) {
    return "No se pudo descargar la playlist desde el navegador. Puede ser un bloqueo CORS del proveedor, una URL inaccesible o un problema de red. Como esta versión no usa proxy ni backend, el proveedor debe permitir acceso directo desde navegador.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "No se pudo descargar la playlist. Revisa la URL o la configuración CORS del proveedor.";
}

async function fetchDirect(url: string): Promise<{ ok: true; method: "direct-browser"; content: string } | { ok: false; method: "direct-browser"; error: string }> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      mode: "cors",
    });
  } catch (error) {
    return { ok: false, method: "direct-browser", error: createNetworkErrorMessage(error) };
  }
  if (!response.ok) {
    return { ok: false, method: "direct-browser", error: `HTTP ${response.status}` };
  }
  return { ok: true, method: "direct-browser", content: await response.text() };
}

async function fetchViaProxy(url: string): Promise<{ ok: true; method: "playlist-proxy"; content: string } | { ok: false; method: "playlist-proxy"; error: string }> {
  const proxyUrl = `/api/proxy/playlist?url=${encodeURIComponent(url)}`;
  let response: Response;
  try {
    response = await fetch(proxyUrl, { cache: "no-store" });
  } catch (error) {
    return { ok: false, method: "playlist-proxy", error: createNetworkErrorMessage(error) };
  }
  if (!response.ok) {
    const detail = await safeProxyError(response);
    return { ok: false, method: "playlist-proxy", error: detail ? `HTTP ${response.status}: ${detail}` : `HTTP ${response.status}` };
  }
  return { ok: true, method: "playlist-proxy", content: await response.text() };
}

async function safeProxyError(response: Response): Promise<string | undefined> {
  try {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await response.json()) as { error?: unknown };
      return typeof body.error === "string" ? body.error : undefined;
    }
    return (await response.text()).slice(0, 120);
  } catch {
    return undefined;
  }
}

function shouldPreferPlaylistProxy(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (process.env.NODE_ENV !== "production") {
    return false;
  }
  return window.location.hostname.endsWith(".vercel.app");
}

function pickError(
  result:
    | { ok: true; method: "direct-browser"; content: string }
    | { ok: false; method: "direct-browser"; error: string }
    | { ok: true; method: "playlist-proxy"; content: string }
    | { ok: false; method: "playlist-proxy"; error: string }
    | undefined,
): string | undefined {
  if (!result || result.ok) {
    return undefined;
  }
  return result.error;
}
