import Hls, { type ErrorData } from "hls.js";
import type { PlaybackError, PlaybackErrorCode, StreamDiagnostics } from "@/types/player";

interface PlaybackErrorOptions {
  technicalDetail?: string;
  diagnostics?: StreamDiagnostics;
}

export function createPlaybackError(code: PlaybackErrorCode, options?: PlaybackErrorOptions | string): PlaybackError {
  const normalizedOptions: PlaybackErrorOptions = typeof options === "string" ? { technicalDetail: options } : options ?? {};
  const base: Record<PlaybackErrorCode, Omit<PlaybackError, "code" | "technicalDetail" | "diagnostics">> = {
    stream_unreachable: {
      title: "Canal no accesible",
      message: "Este canal no está disponible ahora mismo.",
      suggestion: "Prueba otro canal o pulsa Reintentar.",
      recoverable: true,
    },
    cors_or_network: {
      title: "Bloqueo de red o CORS",
      message: "El navegador no pudo acceder al stream. Si el proveedor bloquea CORS, esta versión sin proxy/backend no puede saltarse esa restricción.",
      suggestion: "Comprueba si otros canales del mismo proveedor funcionan. Si todos fallan, probablemente haga falta soporte CORS del proveedor o un proxy opcional.",
      recoverable: true,
    },
    unsupported_format: {
      title: "Formato no compatible",
      message: "Este navegador no puede reproducir este formato de stream directamente ni mediante hls.js.",
      suggestion: "Si el proveedor ofrece una variante HLS (.m3u8), usa esa URL. Si solo ofrece MPEG-TS directo, haría falta estudiar mpegts.js o un transmuxer/proxy.",
      recoverable: false,
    },
    timeout: {
      title: "Tiempo de carga agotado",
      message: "El canal tardó demasiado en empezar. Puede estar caído, saturado o bloqueado por el proveedor.",
      suggestion: "Reintenta o prueba otro canal. Si ocurre con todos, puede ser CORS, token caducado o bloqueo del proveedor.",
      recoverable: true,
    },
    media_error: {
      title: "Error de reproducción",
      message: "No se pudo reproducir este canal en el navegador.",
      suggestion: "Prueba otro canal o pulsa Reintentar.",
      recoverable: true,
    },
    hls_error: {
      title: "Error HLS",
      message: "No se pudo cargar correctamente el stream HLS.",
      suggestion: "Pulsa Reintentar o prueba otro canal.",
      recoverable: true,
    },
    mpegts_direct: {
      title: "MPEG-TS directo no compatible",
      message: "Este canal usa un formato MPEG-TS directo. Se ha intentado reproducir con compatibilidad extendida, pero el navegador/proveedor lo ha bloqueado o no es compatible.",
      suggestion: "Puede funcionar en otra app IPTV o requerir una URL HLS .m3u8.",
      recoverable: true,
    },
    mpegts_error: {
      title: "Error MPEG-TS",
      message: "Este canal usa un formato MPEG-TS directo. Se ha intentado reproducir con compatibilidad extendida, pero el navegador/proveedor lo ha bloqueado o no es compatible.",
      suggestion: "Puede funcionar en otra app IPTV o requerir una URL HLS .m3u8.",
      recoverable: true,
    },
    unknown: {
      title: "Error desconocido",
      message: "No se pudo reproducir el canal. Prueba de nuevo o selecciona otro canal.",
      suggestion: "No se ha podido detectar claramente el formato del stream.",
      recoverable: true,
    },
  };

  const error: PlaybackError = {
    code,
    ...base[code],
    technicalDetail: normalizedOptions.technicalDetail,
    diagnostics: normalizedOptions.diagnostics,
  };

  return addFormatSpecificMessage(error);
}

export function mapMediaElementError(video: HTMLVideoElement, diagnostics?: StreamDiagnostics): PlaybackError {
  const error = video.error;

  if (!error) {
    return createPlaybackError("unknown", { diagnostics });
  }

  const technicalDetail = getMediaErrorDetail(error);

  switch (error.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return createPlaybackError("stream_unreachable", { technicalDetail, diagnostics });
    case MediaError.MEDIA_ERR_NETWORK:
      return createPlaybackError("cors_or_network", { technicalDetail, diagnostics });
    case MediaError.MEDIA_ERR_DECODE:
      return createPlaybackError("media_error", { technicalDetail, diagnostics });
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return createPlaybackError(diagnostics?.looksLikeMpegTs ? "mpegts_direct" : "unsupported_format", { technicalDetail, diagnostics });
    default:
      return createPlaybackError("unknown", { technicalDetail: `MediaError ${error.code}`, diagnostics });
  }
}

export function mapHlsError(data: ErrorData, diagnostics?: StreamDiagnostics): PlaybackError {
  const detail = `${data.type}: ${data.details}${data.fatal ? " fatal" : ""}`;

  if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
    return createPlaybackError("cors_or_network", { technicalDetail: detail, diagnostics });
  }

  if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
    return createPlaybackError("media_error", { technicalDetail: detail, diagnostics });
  }

  return createPlaybackError("hls_error", { technicalDetail: detail, diagnostics });
}

function addFormatSpecificMessage(error: PlaybackError): PlaybackError {
  const diagnostics = error.diagnostics;

  if (!diagnostics) {
    return error;
  }

  if (diagnostics.proxyEnabled && diagnostics.proxyRemoteStatus === "403") {
    return {
      ...error,
      message: "El proveedor ha bloqueado este canal (403), incluso con proxy.",
      suggestion: "Prueba otro canal. Si pasa en todos, hay bloqueo del proveedor.",
    };
  }

  if (diagnostics.proxyEnabled && diagnostics.activeStrategy === "mpegtsjs" && diagnostics.activeUrlIsProxied && error.code === "media_error") {
    return {
      ...error,
      message: "El canal llega, pero el navegador no puede decodificarlo.",
      suggestion: "Suele ser un problema de codec o formato.",
    };
  }

  if (diagnostics.proxyEnabled && diagnostics.activeStrategy === "mpegtsjs" && diagnostics.activeUrlIsProxied && error.code === "cors_or_network") {
    return {
      ...error,
      message: "No se pudo cargar el canal a través del proxy.",
      suggestion: "Prueba otro canal o cambia el perfil de proxy.",
    };
  }

  if (diagnostics.possibleProxyNextStep) {
    return {
      ...error,
      message: "Este navegador no pudo cargar el canal.",
      suggestion: "Si falla en todos, puede ser bloqueo del proveedor o CORS.",
    };
  }

  if (diagnostics.looksLikeMpegTs && error.code !== "mpegts_direct" && error.code !== "mpegts_error") {
    return {
      ...error,
      message: "Este canal usa formato MPEG-TS directo (.ts).",
      suggestion: "Puede no ser compatible con navegador.",
    };
  }

  if (diagnostics.looksLikeHls && (error.code === "media_error" || error.code === "unsupported_format" || error.code === "hls_error")) {
    return {
      ...error,
      suggestion: "Canal HLS (.m3u8). Si falla, suele ser CORS, token o codec.",
    };
  }

  if (diagnostics.streamType === "unknown") {
    return {
      ...error,
      suggestion: "No se ha podido detectar claramente el formato del stream. Puede ser una URL sin extensión, un endpoint que redirige o un formato no compatible.",
    };
  }

  return error;
}

function getMediaErrorDetail(error: MediaError): string {
  return error.message ? `${mediaErrorName(error.code)}: ${error.message}` : mediaErrorName(error.code);
}

function mediaErrorName(code: number): string {
  switch (code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return "MEDIA_ERR_ABORTED";
    case MediaError.MEDIA_ERR_NETWORK:
      return "MEDIA_ERR_NETWORK";
    case MediaError.MEDIA_ERR_DECODE:
      return "MEDIA_ERR_DECODE";
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "MEDIA_ERR_SRC_NOT_SUPPORTED";
    default:
      return `MEDIA_ERR_${code}`;
  }
}
