import { detectM3UEpgUrls, parseM3U } from "@/lib/m3u/parseM3U";
import type { IPTVChannel } from "@/types/channel";

export interface M3UPlaylistLoadResult {
  channels: IPTVChannel[];
  suggestedEpgUrls: string[];
}

export async function loadM3UPlaylist(url: string): Promise<M3UPlaylistLoadResult> {
  let response: Response;

  try {
    response = await fetch(url, {
      cache: "no-store",
      mode: "cors",
    });
  } catch (error) {
    throw new Error(createNetworkErrorMessage(error));
  }

  if (!response.ok) {
    throw new Error(`El proveedor respondió con HTTP ${response.status}. Revisa la URL o inténtalo más tarde.`);
  }

  const content = await response.text();
  return {
    channels: parseM3U(content),
    suggestedEpgUrls: detectM3UEpgUrls(content),
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
