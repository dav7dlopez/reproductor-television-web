import { NextRequest } from "next/server";
import { buildPlayerApiUrl } from "@/lib/xtream/xtreamUrls";
import type { XtreamCredentialsInput, XtreamLiveCategory, XtreamLiveStream, XtreamLoadedData, XtreamUserInfoResponse } from "@/lib/xtream/xtreamTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface XtreamLiveBody {
  serverUrl?: string;
  username?: string;
  password?: string;
}

export async function POST(request: NextRequest) {
  let body: XtreamLiveBody;
  try {
    body = (await request.json()) as XtreamLiveBody;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const credentials: XtreamCredentialsInput = {
    serverUrl: body.serverUrl?.trim() ?? "",
    username: body.username?.trim() ?? "",
    password: body.password ?? "",
  };

  if (!credentials.serverUrl || !credentials.username || !credentials.password) {
    return Response.json({ error: "Faltan serverUrl, username o password." }, { status: 400 });
  }

  let server: URL;
  try {
    server = new URL(credentials.serverUrl);
  } catch {
    return Response.json({ error: "Server URL inválida." }, { status: 400 });
  }

  if (!["http:", "https:"].includes(server.protocol)) {
    return Response.json({ error: "Server URL debe usar http o https." }, { status: 400 });
  }

  try {
    const data = await loadXtreamLiveDataServer(credentials);
    return Response.json(data, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo cargar Xtream desde servidor.";
    return Response.json({ error: message }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}

async function loadXtreamLiveDataServer(credentials: XtreamCredentialsInput): Promise<XtreamLoadedData> {
  const [userInfo, categories, streams] = await Promise.all([
    fetchXtreamJsonServer<XtreamUserInfoResponse>(credentials),
    fetchXtreamJsonServer<XtreamLiveCategory[]>(credentials, "get_live_categories"),
    fetchXtreamJsonServer<XtreamLiveStream[]>(credentials, "get_live_streams"),
  ]);

  const user = userInfo.user_info;
  if (!user) {
    throw new Error("La API Xtream no devolvió información de usuario.");
  }
  if (String(user.auth) === "0") {
    throw new Error(user.message || "Credenciales Xtream incorrectas o usuario no autorizado.");
  }
  if (user.status && user.status.toLowerCase() !== "active") {
    throw new Error(`El usuario Xtream no está activo. Estado: ${user.status}.`);
  }

  if (!Array.isArray(categories)) {
    throw new Error("La API Xtream devolvió categorías en formato inesperado.");
  }
  if (!Array.isArray(streams)) {
    throw new Error("La API Xtream devolvió canales en formato inesperado.");
  }
  if (streams.length === 0) {
    throw new Error("La API Xtream no devolvió canales live para este perfil.");
  }

  return { userInfo, categories, streams };
}

async function fetchXtreamJsonServer<T>(credentials: XtreamCredentialsInput, action?: string): Promise<T> {
  const url = buildPlayerApiUrl(credentials, action);
  let response: Response;

  try {
    response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
    });
  } catch {
    throw new Error("No se pudo conectar con la API Xtream desde el servidor de la app.");
  }

  if (!response.ok) {
    throw new Error(`La API Xtream respondió con HTTP ${response.status}.`);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new Error("La API Xtream no devolvió JSON válido.");
  }
}
