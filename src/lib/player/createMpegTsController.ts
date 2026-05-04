import { createPlaybackError } from "@/lib/player/playbackErrors";
import type { PlaybackError } from "@/types/player";

type MpegTsLib = typeof import("mpegts.js").default;
type MpegTsPlayer = ReturnType<MpegTsLib["createPlayer"]>;

interface MpegTsControllerOptions {
  video: HTMLVideoElement;
  url: string;
  onError: (error: PlaybackError) => void;
  onMediaInfo?: () => void;
}

export interface MpegTsController {
  player: MpegTsPlayer;
  destroy: () => void;
}

export async function createMpegTsController({ onError, onMediaInfo, url, video }: MpegTsControllerOptions): Promise<MpegTsController> {
  const { default: mpegts } = await import("mpegts.js");
  const safariLike = isSafariLike();
  mpegts.LoggingControl?.applyConfig?.({
    enableVerbose: false,
    enableDebug: false,
    enableInfo: false,
    enableWarn: false,
    enableError: false,
  });

  const player = mpegts.createPlayer(
    {
      type: "mpegts",
      isLive: true,
      cors: true,
      url,
    },
    {
      // Safari/WebKit can be unstable with aggressive live buffering and worker mode on MSE TS.
      enableWorker: !safariLike,
      enableStashBuffer: safariLike,
      stashInitialSize: 128 * 1024,
      isLive: true,
      liveBufferLatencyChasing: !safariLike,
      autoCleanupSourceBuffer: !safariLike,
      autoCleanupMaxBackwardDuration: 30,
      autoCleanupMinBackwardDuration: 10,
    },
  );

  const handleError = (type: string, detail: string, info?: unknown) => {
    const technicalDetail = [type, detail, stringifyInfo(info)].filter(Boolean).join(" · ");
    const code = type === mpegts.ErrorTypes.NETWORK_ERROR ? "cors_or_network" : type === mpegts.ErrorTypes.MEDIA_ERROR ? "media_error" : "mpegts_error";
    onError(createPlaybackError(code, { technicalDetail }));
  };

  const handleMediaInfo = () => {
    onMediaInfo?.();
  };

  player.on(mpegts.Events.ERROR, handleError);
  player.on(mpegts.Events.MEDIA_INFO, handleMediaInfo);
  safeCall(() => player.attachMediaElement(video));
  safeCall(() => player.load());

  return {
    player,
    destroy: () => {
      safeCall(() => player.off(mpegts.Events.ERROR, handleError));
      safeCall(() => player.off(mpegts.Events.MEDIA_INFO, handleMediaInfo));
      safeCall(() => player.pause());
      safeCall(() => player.unload());
      safeCall(() => player.detachMediaElement());
      safeCall(() => player.destroy());
    },
  };
}

function stringifyInfo(info: unknown): string | undefined {
  if (!info) {
    return undefined;
  }

  if (typeof info === "string") {
    return info;
  }

  try {
    return JSON.stringify(info);
  } catch {
    return String(info);
  }
}

function safeCall(fn: () => void): void {
  try {
    fn();
  } catch {
    // mpegts.js may throw InvalidStateError during rapid teardown/reload on some browsers.
  }
}

function isSafariLike(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent;
  return /Safari/i.test(userAgent) && !/Chrome|Chromium|Edg|OPR/i.test(userAgent);
}
