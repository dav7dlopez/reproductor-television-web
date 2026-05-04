import Hls, { type ErrorData } from "hls.js";
import { mapHlsError } from "@/lib/player/playbackErrors";
import type { PlaybackError } from "@/types/player";

interface HlsControllerOptions {
  video: HTMLVideoElement;
  url: string;
  onError: (error: PlaybackError, fatal: boolean, hls: Hls) => void;
  onManifestParsed?: () => void;
}

export interface HlsController {
  hls: Hls;
  destroy: () => void;
}

export function createHlsController({ onError, onManifestParsed, url, video }: HlsControllerOptions): HlsController {
  const hls = new Hls({
    enableWorker: true,
    lowLatencyMode: true,
    backBufferLength: 60,
  });

  const handleError = (_event: string, data: ErrorData) => {
    onError(mapHlsError(data), data.fatal, hls);
  };

  const handleManifestParsed = () => {
    onManifestParsed?.();
  };

  hls.on(Hls.Events.ERROR, handleError);
  hls.on(Hls.Events.MANIFEST_PARSED, handleManifestParsed);
  hls.loadSource(url);
  hls.attachMedia(video);

  return {
    hls,
    destroy: () => {
      hls.off(Hls.Events.ERROR, handleError);
      hls.off(Hls.Events.MANIFEST_PARSED, handleManifestParsed);
      hls.destroy();
    },
  };
}
