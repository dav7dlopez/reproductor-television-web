import { buildPlayerApiUrl } from "@/lib/xtream/xtreamUrls";
import type { XtreamCredentialsInput, XtreamLiveCategory, XtreamLiveStream, XtreamLoadedData, XtreamUserInfoResponse } from "@/lib/xtream/xtreamTypes";

export async function loadXtreamLiveData(credentials: XtreamCredentialsInput): Promise<XtreamLoadedData> {
  // Prefer server-side route to avoid browser-side CORS in production (e.g. Vercel).
  const viaServer = await tryLoadViaServerRoute(credentials);
  if (viaServer) {
    return viaServer;
  }

  const [userInfo, categories, streams] = await Promise.all([
    fetchXtreamJson<XtreamUserInfoResponse>(credentials),
    fetchXtreamJson<XtreamLiveCategory[]>(credentials, "get_live_categories"),
    fetchXtreamJson<XtreamLiveStream[]>(credentials, "get_live_streams"),
  ]);

  validateUserInfo(userInfo);

  if (!Array.isArray(categories)) {
    throw new Error("La API Xtream devolvió un formato inesperado para las categorías live.");
  }

  if (!Array.isArray(streams)) {
    throw new Error("La API Xtream devolvió un formato inesperado para los canales live.");
  }

  if (streams.length === 0) {
    throw new Error("La API Xtream no devolvió canales live para este perfil.");
  }

  return { userInfo, categories, streams };
}

async function tryLoadViaServerRoute(credentials: XtreamCredentialsInput): Promise<XtreamLoadedData | undefined> {
  try {
    const response = await fetch("/api/xtream/live", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        serverUrl: credentials.serverUrl,
        username: credentials.username,
        password: credentials.password,
      }),
    });

    if (!response.ok) {
      return undefined;
    }

    const data = (await response.json()) as XtreamLoadedData;
    if (!data || !Array.isArray(data.streams) || !Array.isArray(data.categories)) {
      return undefined;
    }
    return data;
  } catch {
    return undefined;
  }
}

async function fetchXtreamJson<T>(credentials: XtreamCredentialsInput, action?: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(buildPlayerApiUrl(credentials, action), {
      cache: "no-store",
      mode: "cors",
    });
  } catch (error) {
    throw new Error(createNetworkErrorMessage(error));
  }

  if (!response.ok) {
    throw new Error(`La API Xtream respondió con HTTP ${response.status}. Revisa servidor, credenciales o disponibilidad del proveedor.`);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new Error("La API Xtream no devolvió JSON válido.");
  }
}

function validateUserInfo(response: XtreamUserInfoResponse): void {
  const userInfo = response.user_info;

  if (!userInfo) {
    throw new Error("La API Xtream no devolvió información de usuario. Puede ser una respuesta inesperada del proveedor.");
  }

  if (String(userInfo.auth) === "0") {
    throw new Error(userInfo.message || "Credenciales Xtream incorrectas o usuario no autorizado.");
  }

  if (userInfo.status && userInfo.status.toLowerCase() !== "active") {
    throw new Error(`El usuario Xtream no está activo. Estado recibido: ${userInfo.status}.`);
  }
}

function createNetworkErrorMessage(error: unknown): string {
  if (error instanceof TypeError) {
    return "No se pudo conectar con la API Xtream desde el navegador. Puede ser CORS, servidor inaccesible, bloqueo del proveedor o un problema de red. Esta versión no usa proxy/backend.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "No se pudo conectar con la API Xtream desde el navegador.";
}
