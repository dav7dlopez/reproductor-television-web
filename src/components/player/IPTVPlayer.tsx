"use client";

import Hls from "hls.js";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Bug, Loader2, MonitorPlay, Radio } from "lucide-react";
import { PlayerControls } from "@/components/player/PlayerControls";
import { PlayerErrorState } from "@/components/player/PlayerErrorState";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { StatusPill } from "@/components/ui/StatusPill";
import { createHlsController, type HlsController } from "@/lib/player/createHlsController";
import { createMpegTsController, type MpegTsController } from "@/lib/player/createMpegTsController";
import { createPlaybackError, mapMediaElementError } from "@/lib/player/playbackErrors";
import { canPlayNativeHls, createStreamDiagnostics, detectStreamFormat, getHlsCandidateForMpegTs, getMpegTsCandidateForHls, isPictureInPictureAvailable, maskStreamUrl, createProxyStreamUrl, isProxyStreamUrl } from "@/lib/player/playbackSupport";
import { usePlayerStore } from "@/store/usePlayerStore";
import type { IPTVChannel } from "@/types/channel";
import type { AttemptResult, PlaybackAttempt, PlaybackStrategy, PlaybackStrategyPreference, ProxyHeaderProfile, StreamDiagnostics } from "@/types/player";

const LOAD_TIMEOUT_MS = 15000;

interface AttemptState {
  hlsCandidateAttempt: AttemptResult;
  mpegtsAttempt: AttemptResult;
  activeStrategy?: PlaybackStrategy;
  lastTechnicalError?: string;
  ignoredInterruptedPlay?: boolean;
  attempts?: PlaybackAttempt[];
  preferredStrategy?: PlaybackStrategyPreference;
  proxyEnabled?: boolean;
  proxyHeaderProfile?: ProxyHeaderProfile;
  activeUrlIsProxied?: boolean;
  proxyRemoteStatus?: string;
  proxyContentType?: string;
  proxyError?: string;
  proxyManifestValid?: string;
  proxyManifestRewritten?: string;
  proxyRewrittenCount?: string;
  proxyRangeUsed?: string;
  proxyProbeFirstBytes?: string;
}

const initialAttemptState: AttemptState = {
  hlsCandidateAttempt: "not_attempted",
  mpegtsAttempt: "not_attempted",
  attempts: [],
  preferredStrategy: "auto",
};

export function IPTVPlayer() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsControllerRef = useRef<HlsController | null>(null);
  const mpegTsControllerRef = useRef<MpegTsController | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const transmuxSessionRef = useRef<string | undefined>(undefined);
  const cleaningRef = useRef(false);
  const attemptStateRef = useRef<AttemptState>(initialAttemptState);
  const userPauseRequestedRef = useRef(false);
  const stalledRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const waitingSinceRef = useRef<number | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [diagnostics, setDiagnostics] = useState<StreamDiagnostics | undefined>(undefined);
  const [showManualResumeHint, setShowManualResumeHint] = useState(false);
  const autoResumeAttemptedRef = useRef(false);

  const channel = usePlayerStore((state) => state.channel);
  const status = usePlayerStore((state) => state.status);
  const error = usePlayerStore((state) => state.error);
  const muted = usePlayerStore((state) => state.muted);
  const volume = usePlayerStore((state) => state.volume);
  const setStatus = usePlayerStore((state) => state.setStatus);
  const setError = usePlayerStore((state) => state.setError);
  const setMuted = usePlayerStore((state) => state.setMuted);
  const setVolume = usePlayerStore((state) => state.setVolume);
  const setPiPAvailable = usePlayerStore((state) => state.setPiPAvailable);
  const setPiPActive = usePlayerStore((state) => state.setPiPActive);
  const strategyPreference = usePlayerStore((state) => state.strategyPreference);
  const setStrategyPreference = usePlayerStore((state) => state.setStrategyPreference);
  const useExperimentalProxy = usePlayerStore((state) => state.useExperimentalProxy);
  const setUseExperimentalProxy = usePlayerStore((state) => state.setUseExperimentalProxy);
  const proxyHeaderProfile = usePlayerStore((state) => state.proxyHeaderProfile);
  const setProxyHeaderProfile = usePlayerStore((state) => state.setProxyHeaderProfile);

  const clearLoadTimeout = useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const clearStalledTimeout = useCallback(() => {
    if (stalledRef.current) {
      window.clearTimeout(stalledRef.current);
      stalledRef.current = null;
    }
  }, []);

  const updateDiagnostics = useCallback((streamUrl?: string, lastTechnicalError?: string, patch?: Partial<AttemptState>) => {
    const video = videoRef.current;
    if (!video || !streamUrl) {
      setDiagnostics(undefined);
      return;
    }

    attemptStateRef.current = {
      ...attemptStateRef.current,
      ...patch,
      preferredStrategy: strategyPreference,
      proxyEnabled: useExperimentalProxy,
      proxyHeaderProfile,
      lastTechnicalError: lastTechnicalError ?? patch?.lastTechnicalError ?? attemptStateRef.current.lastTechnicalError,
    };
    setDiagnostics(createStreamDiagnostics(streamUrl, video, containerRef.current, attemptStateRef.current.lastTechnicalError, attemptStateRef.current, channel));
  }, [channel, proxyHeaderProfile, strategyPreference, useExperimentalProxy]);

  const destroyHls = useCallback(() => {
    hlsControllerRef.current?.destroy();
    hlsControllerRef.current = null;
  }, []);

  const destroyMpegTs = useCallback(() => {
    try {
      mpegTsControllerRef.current?.destroy();
    } catch {
      // createMpegTsController already guards teardown; keep this extra safe at call site.
    } finally {
      mpegTsControllerRef.current = null;
      const video = videoRef.current;
      if (video) {
        // Forcefully detach any stale MSE pipeline that may continue emitting internal errors.
        video.removeAttribute("src");
        video.load();
      }
    }
  }, []);

  const stopCurrentVideo = useCallback(() => {
    const video = videoRef.current;
    cleaningRef.current = true;
    clearLoadTimeout();
    clearStalledTimeout();
    destroyHls();
    destroyMpegTs();

    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }

    window.setTimeout(() => {
      cleaningRef.current = false;
    }, 0);
  }, [clearLoadTimeout, clearStalledTimeout, destroyHls, destroyMpegTs]);

  const clearTransmuxSession = useCallback(async () => {
    const sessionId = transmuxSessionRef.current;
    transmuxSessionRef.current = undefined;
    if (!sessionId) {
      return;
    }
    try {
      await fetch(`/api/transmux/session/${sessionId}`, { method: "DELETE" });
    } catch {
      // no-op
    }
  }, []);

  const playCurrentVideo = useCallback(async (streamUrl?: string, generation?: number) => {
    const video = videoRef.current;
    if (!video || !channel) {
      return false;
    }

    try {
      setError(undefined);
      setShowManualResumeHint(false);
      setStatus("loading");
      await video.play();
      if (generation !== undefined && generation !== generationRef.current) {
        return false;
      }
      setStatus("playing");
      return true;
    } catch (playError) {
      const message = playError instanceof Error ? playError.message : "play() failed";
      const interruptedByCleanup = /interrupted by a call to pause/i.test(message) && (cleaningRef.current || generation !== generationRef.current);
      const blocked = playError instanceof DOMException && playError.name === "NotAllowedError";

      if (interruptedByCleanup) {
        updateDiagnostics(streamUrl ?? channel.streamUrl, message, { ignoredInterruptedPlay: true });
        return false;
      }

      setStatus("paused");
      updateDiagnostics(streamUrl ?? channel.streamUrl, message);
      if (!blocked) {
        setError(createPlaybackError("media_error", { technicalDetail: message, diagnostics: createCurrentDiagnostics(videoRef.current, containerRef.current, channel.streamUrl, message, attemptStateRef.current, channel) }));
      } else {
        setShowManualResumeHint(true);
      }
      return false;
    }
  }, [channel, setError, setStatus, updateDiagnostics]);

  const retry = useCallback(() => {
    setRetryNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.volume = volume;
    video.muted = muted;
  }, [muted, volume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    setPiPAvailable(isPictureInPictureAvailable(video));

    const handlePlay = () => {
      setShowManualResumeHint(false);
      setStatus("playing");
    };
    const handlePause = () => {
      if (!cleaningRef.current) {
        if (userPauseRequestedRef.current) {
          setShowManualResumeHint(false);
          setStatus("paused");
          return;
        }
        // Safari/live streams can transiently pause right after source attach.
        // Try one transparent auto-resume before showing manual hint.
        if (channel && !error && !autoResumeAttemptedRef.current) {
          autoResumeAttemptedRef.current = true;
          window.setTimeout(() => {
            if (cleaningRef.current || !video.paused) {
              return;
            }
            void video.play().then(() => {
              setShowManualResumeHint(false);
              setStatus("playing");
            }).catch(() => {
              setShowManualResumeHint(true);
              setStatus("paused");
            });
          }, 180);
          return;
        }
        setShowManualResumeHint(true);
        setStatus("paused");
      }
    };
    const handleWaiting = () => {
      clearStalledTimeout();
      waitingSinceRef.current = Date.now();
      const waitingAtTime = video.currentTime;
      stalledRef.current = window.setTimeout(() => {
        const samePlaybackHead = Math.abs(video.currentTime - waitingAtTime) < 0.05;
        if (!cleaningRef.current && !video.paused && samePlaybackHead) {
          setStatus("loading");
        }
      }, 1400);
    };
    const handleCanPlay = () => {
      clearLoadTimeout();
      clearStalledTimeout();
      waitingSinceRef.current = null;
      if (!video.paused) {
        setStatus("playing");
      }
    };
    const handleTimeUpdate = () => {
      lastTimeRef.current = video.currentTime;
      clearStalledTimeout();
      waitingSinceRef.current = null;
      if (!video.paused) {
        setStatus("playing");
      }
    };
    const handleLoadedMetadata = () => {
      // If stream starts with audio but no decodable video track, surface it clearly.
      window.setTimeout(() => {
        if (cleaningRef.current || generationRef.current <= 0) {
          return;
        }
        const hasAudioLikely = !video.muted && !video.paused;
        const noVideoTrack = video.videoWidth === 0 || video.videoHeight === 0;
        if (hasAudioLikely && noVideoTrack) {
          updateDiagnostics(channel?.streamUrl, "audio-without-video", { lastTechnicalError: "Audio presente pero sin pista de vídeo decodificable." });
        }
      }, 2600);
    };
    const handleError = () => {
      clearLoadTimeout();
      if (cleaningRef.current) {
        return;
      }
      setError(mapMediaElementError(video, createCurrentDiagnostics(video, containerRef.current, channel?.streamUrl, video.error?.message, attemptStateRef.current, channel)));
    };
    const handleVolumeChange = () => {
      setMuted(video.muted);
    };
    const handleEnterPiP = () => setPiPActive(true);
    const handleLeavePiP = () => setPiPActive(false);

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("error", handleError);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("volumechange", handleVolumeChange);
    video.addEventListener("enterpictureinpicture", handleEnterPiP);
    video.addEventListener("leavepictureinpicture", handleLeavePiP);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("error", handleError);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("volumechange", handleVolumeChange);
      video.removeEventListener("enterpictureinpicture", handleEnterPiP);
      video.removeEventListener("leavepictureinpicture", handleLeavePiP);
    };
  }, [channel, clearLoadTimeout, clearStalledTimeout, error, setError, setMuted, setPiPActive, setPiPAvailable, setStatus, updateDiagnostics]);

  useEffect(() => {
    const video = videoRef.current;
    generationRef.current += 1;
    const generation = generationRef.current;
    autoResumeAttemptedRef.current = false;

    stopCurrentVideo();
    void clearTransmuxSession();
    attemptStateRef.current = {
      ...initialAttemptState,
      preferredStrategy: strategyPreference,
      proxyEnabled: useExperimentalProxy,
      proxyHeaderProfile,
      attempts: [],
    };

    if (!video || !channel) {
      setStatus("idle");
      setError(undefined);
      setDiagnostics(undefined);
      return;
    }

    updateDiagnostics(channel.streamUrl);
    setError(undefined);
    setStatus("loading");

    const failIfCurrent = (playbackError: ReturnType<typeof createPlaybackError>) => {
      if (generation !== generationRef.current) {
        return;
      }
      clearLoadTimeout();
      setError(playbackError);
    };

    const writeAttempt = (attempt: PlaybackAttempt) => {
      const attempts = [...(attemptStateRef.current.attempts ?? [])];
      const index = attempts.findIndex((item) => item.id === attempt.id);
      if (index >= 0) {
        attempts[index] = { ...attempts[index], ...attempt };
      } else {
        attempts.push(attempt);
      }
      updateDiagnostics(channel.streamUrl, attempt.error, { attempts });
    };

    const updateAttempt = (id: string, result: AttemptResult, errorMessage?: string) => {
      const attempts = (attemptStateRef.current.attempts ?? []).map((attempt) => (attempt.id === id ? { ...attempt, result, error: errorMessage } : attempt));
      updateDiagnostics(channel.streamUrl, errorMessage, { attempts });
    };

    const probeProxyManifest = async (playbackUrl: string, attemptId: string) => {
      if (process.env.NODE_ENV !== "development") {
        return;
      }

      if (playbackUrl.startsWith("/api/transmux/session/")) {
        try {
          const response = await fetch(playbackUrl, { cache: "no-store" });
          if (generation !== generationRef.current) {
            return;
          }
          const contentType = response.headers.get("content-type") ?? "desconocido";
          const text = response.ok ? await response.clone().text() : "";
          const manifestValid = response.ok && text.trimStart().startsWith("#EXTM3U");
          updateDiagnostics(channel.streamUrl, response.ok ? undefined : `Transmux HTTP ${response.status}`, {
            proxyRemoteStatus: String(response.status),
            proxyContentType: contentType,
            proxyManifestValid: manifestValid ? "true" : "false",
            proxyManifestRewritten: "false",
            proxyRewrittenCount: "0",
            activeUrlIsProxied: true,
          });
          if (!response.ok) {
            updateAttempt(attemptId, "failed", `Transmux HTTP ${response.status}`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Transmux probe failed";
          updateDiagnostics(channel.streamUrl, message, {
            proxyError: "transmux-probe-failed",
            activeUrlIsProxied: true,
          });
          updateAttempt(attemptId, "failed", message);
        }
        return;
      }

      if (!isProxyStreamUrl(playbackUrl)) {
        return;
      }

      try {
        const probeUrl = `${playbackUrl}${playbackUrl.includes("?") ? "&" : "?"}probe=1`;
        const response = await fetch(probeUrl, { cache: "no-store", headers: { Range: "bytes=0-511" } });
        if (generation !== generationRef.current) {
          return;
        }

        const proxyRemoteStatus = response.headers.get("x-iptvweb-proxy-remote-status") ?? String(response.status);
        const proxyContentType = response.headers.get("x-iptvweb-proxy-content-type") ?? response.headers.get("content-type") ?? "desconocido";
        const proxyError = response.headers.get("x-iptvweb-proxy-error") ?? undefined;
        const proxyManifestValid = response.headers.get("x-iptvweb-proxy-manifest-valid") ?? "desconocido";
        const proxyManifestRewritten = response.headers.get("x-iptvweb-proxy-manifest-rewritten") ?? "desconocido";
        const proxyRewrittenCount = response.headers.get("x-iptvweb-proxy-rewritten-count") ?? "0";
        const proxyRangeUsed = response.headers.get("x-iptvweb-proxy-range-used") ?? "no";
        const probeBody = await parseProxyProbe(response);
        const responseText = response.ok ? undefined : await readProxyErrorText(response);
        const technicalDetail = response.ok
          ? undefined
          : `Proxy HTTP ${response.status}: ${probeBody.error ?? responseText ?? proxyError ?? "remote fetch failed"}`;

        updateDiagnostics(channel.streamUrl, technicalDetail, {
          proxyRemoteStatus,
          proxyContentType,
          proxyError,
          proxyManifestValid,
          proxyManifestRewritten,
          proxyRewrittenCount,
          proxyRangeUsed,
          proxyProbeFirstBytes: probeBody.firstBytesHex,
          activeUrlIsProxied: true,
        });

        if (!response.ok) {
          updateAttempt(attemptId, "failed", technicalDetail);
        }
      } catch (proxyProbeError) {
        if (generation !== generationRef.current) {
          return;
        }

        const detail = proxyProbeError instanceof Error ? `Proxy probe failed: ${proxyProbeError.message}` : "Proxy probe failed";
        updateDiagnostics(channel.streamUrl, detail, {
          proxyError: "proxy-probe-failed",
          proxyManifestValid: "desconocido",
          proxyManifestRewritten: "false",
          proxyRewrittenCount: "0",
          proxyRangeUsed: "no",
          activeUrlIsProxied: true,
        });
        updateAttempt(attemptId, "failed", detail);
      }
    };

    const createAttempt = (url: string, strategy: PlaybackStrategy, label: string): PlaybackAttempt => ({
      id: `${strategy}:${url}`,
      label,
      strategy,
      maskedUrl: maskAttemptUrl(url),
      streamType: detectStreamFormat(url).type,
      result: "attempting",
    });

    const startTimeout = (activeUrl: string, strategy: PlaybackStrategy) => {
      clearLoadTimeout();
      timeoutRef.current = window.setTimeout(() => {
        failIfCurrent(createPlaybackError("timeout", { diagnostics: createCurrentDiagnostics(video, containerRef.current, channel.streamUrl, `Load timeout during ${strategy}`, attemptStateRef.current, channel) }));
        stopCurrentVideo();
      }, LOAD_TIMEOUT_MS);
      return activeUrl;
    };

    const prepareHlsUrl = (url: string) => {
      if (!useExperimentalProxy || !detectStreamFormat(url).looksLikeHls) {
        return url;
      }
      if (!shouldProxyRemoteUrl(url)) {
        return url;
      }
      return createProxyStreamUrl(url, proxyHeaderProfile);
    };

    const playWithNative = (url: string, strategy: PlaybackStrategy, label = "HTML5 video") => {
      destroyMpegTs();
      destroyHls();
      const playbackUrl = detectStreamFormat(url).looksLikeHls ? prepareHlsUrl(url) : url;
      if (isSafariLikeBrowser() && strategy === "native" && detectStreamFormat(playbackUrl).looksLikeMpegTs) {
        destroyMpegTs();
      }
      const attempt = createAttempt(playbackUrl, strategy, isProxyStreamUrl(playbackUrl) ? `${label} por proxy` : label);
      writeAttempt(attempt);
      updateDiagnostics(channel.streamUrl, undefined, { activeStrategy: strategy });
      updateDiagnostics(channel.streamUrl, undefined, { activeUrlIsProxied: isProxyStreamUrl(playbackUrl) });
      void probeProxyManifest(playbackUrl, attempt.id);
      startTimeout(playbackUrl, strategy);
      video.src = playbackUrl;
      video.load();
      void playCurrentVideo(playbackUrl, generation).then((ok) => updateAttempt(attempt.id, ok ? "success" : "failed", ok ? undefined : attemptStateRef.current.lastTechnicalError));
    };

    const playWithHls = (url: string, strategy: PlaybackStrategy, onFatal?: (technicalDetail?: string) => void, label = strategy === "hls_candidate" ? "HLS alternativa" : "HLS") => {
      destroyMpegTs();
      destroyHls();
      const playbackUrl = prepareHlsUrl(url);
      const attempt = createAttempt(playbackUrl, strategy, useExperimentalProxy ? `${label} por proxy` : label);
      writeAttempt(attempt);
      updateDiagnostics(channel.streamUrl, undefined, { activeStrategy: strategy, activeUrlIsProxied: isProxyStreamUrl(playbackUrl) });
      void probeProxyManifest(playbackUrl, attempt.id);
      startTimeout(playbackUrl, strategy);
      hlsControllerRef.current = createHlsController({
        video,
        url: playbackUrl,
        onManifestParsed: () => {
          if (generation !== generationRef.current) {
            return;
          }
          clearLoadTimeout();
          if (strategy === "hls_candidate") {
            updateDiagnostics(channel.streamUrl, undefined, { hlsCandidateAttempt: "success", activeStrategy: strategy });
          }
          updateAttempt(attempt.id, "success");
          void playCurrentVideo(playbackUrl, generation);
        },
        onError: (playbackError, fatal, hls) => {
          if (!fatal || generation !== generationRef.current) {
            return;
          }

          if (playbackError.code === "media_error") {
            try {
              hls.recoverMediaError();
              return;
            } catch {
              // Fall through to fallback/error path.
            }
          }

          clearLoadTimeout();
          destroyHls();
          updateAttempt(attempt.id, "failed", playbackError.technicalDetail);
          if (onFatal) {
            onFatal(playbackError.technicalDetail);
            return;
          }
          failIfCurrent({ ...playbackError, diagnostics: createCurrentDiagnostics(video, containerRef.current, channel.streamUrl, playbackError.technicalDetail, attemptStateRef.current, channel) });
        },
      });
    };

    const playWithMpegTs = (overrideUrl?: string, label = overrideUrl ? "MPEG-TS fallback" : "MPEG-TS") => {
      if (!window.MediaSource) {
        updateDiagnostics(channel.streamUrl, "mpegts.js unsupported", { mpegtsAttempt: "unsupported" });
        failIfCurrent(createPlaybackError("mpegts_error", { technicalDetail: "mpegts.js unsupported", diagnostics: createCurrentDiagnostics(video, containerRef.current, channel.streamUrl, "mpegts.js unsupported", attemptStateRef.current, channel) }));
        return;
      }

      const mpegTsUrl = overrideUrl ?? channel.streamUrl;
      const mpegTsPlaybackUrl = toAbsolutePlaybackUrl(mpegTsUrl);
      const attempt = createAttempt(mpegTsUrl, "mpegtsjs", label);
      writeAttempt(attempt);
      updateDiagnostics(channel.streamUrl, undefined, { mpegtsAttempt: "attempting", activeStrategy: "mpegtsjs" });
      if (isProxyStreamUrl(mpegTsUrl)) {
        void probeProxyManifest(mpegTsUrl, attempt.id);
      }
      startTimeout(mpegTsPlaybackUrl, "mpegtsjs");
      void createMpegTsController({
        video,
        url: mpegTsPlaybackUrl,
        onMediaInfo: () => {
          if (generation !== generationRef.current) {
            return;
          }
          updateAttempt(attempt.id, "success");
          updateDiagnostics(channel.streamUrl, undefined, { mpegtsAttempt: "success", activeStrategy: "mpegtsjs" });
        },
        onError: (playbackError) => {
          if (generation !== generationRef.current) {
            return;
          }
          clearLoadTimeout();
          updateAttempt(attempt.id, "failed", playbackError.technicalDetail);
          updateDiagnostics(channel.streamUrl, playbackError.technicalDetail, { mpegtsAttempt: "failed", activeStrategy: "mpegtsjs" });
          failIfCurrent(createPlaybackError("mpegts_error", { technicalDetail: playbackError.technicalDetail, diagnostics: createCurrentDiagnostics(video, containerRef.current, channel.streamUrl, playbackError.technicalDetail, attemptStateRef.current, channel) }));
        },
      }).then((controller) => {
        if (generation !== generationRef.current) {
          controller.destroy();
          return;
        }
        mpegTsControllerRef.current = controller;
        void playCurrentVideo(mpegTsPlaybackUrl, generation);
      }).catch((controllerError) => {
        const detail = controllerError instanceof Error ? controllerError.message : "mpegts.js import or setup failed";
        updateAttempt(attempt.id, "failed", detail);
        updateDiagnostics(channel.streamUrl, detail, { mpegtsAttempt: "failed", activeStrategy: "mpegtsjs" });
        failIfCurrent(createPlaybackError("mpegts_error", { technicalDetail: detail, diagnostics: createCurrentDiagnostics(video, containerRef.current, channel.streamUrl, detail, attemptStateRef.current, channel) }));
      });
    };

    const playUrlByDetectedType = (url: string, label: string) => {
      const format = detectStreamFormat(url);
      if (format.looksLikeHls) {
        const canNativeHls = canPlayNativeHls(video);
        if (isSafariLikeBrowser() && canNativeHls) {
          playWithNative(url, "native", label);
        } else if (Hls.isSupported()) {
          playWithHls(url, "hlsjs", undefined, label);
        } else if (canNativeHls) {
          playWithNative(url, "native", label);
        } else {
          failIfCurrent(createPlaybackError("unsupported_format", { technicalDetail: "HLS unsupported", diagnostics: createCurrentDiagnostics(video, containerRef.current, channel.streamUrl, "HLS unsupported", attemptStateRef.current, channel) }));
        }
      } else if (format.looksLikeMpegTs) {
        playWithMpegTs(url);
      } else {
        playWithNative(url, format.looksLikeMp4 ? "native" : "unknown_native", label);
      }
    };

    if (strategyPreference === "direct-source") {
      if (channel.xtream?.directSource) {
        playUrlByDetectedType(channel.xtream.directSource, "direct_source");
      } else {
        failIfCurrent(createPlaybackError("unsupported_format", { technicalDetail: "Este canal no tiene direct_source", diagnostics: createCurrentDiagnostics(video, containerRef.current, channel.streamUrl, "Sin direct_source", attemptStateRef.current, channel) }));
      }
      return () => {
        generationRef.current += 1;
        stopCurrentVideo();
      };
    }

    if (strategyPreference === "force-hls") {
      const hlsUrl = channel.xtream?.hlsUrl ?? (detectStreamFormat(channel.streamUrl).looksLikeMpegTs ? getHlsCandidateForMpegTs(channel.streamUrl) : channel.streamUrl);
      if (hlsUrl) {
        playUrlByDetectedType(hlsUrl, "HLS forzado");
      }
      return () => {
        generationRef.current += 1;
        stopCurrentVideo();
      };
    }

    if (strategyPreference === "force-mpegts") {
      const tsUrl = channel.xtream?.tsUrl ?? (detectStreamFormat(channel.streamUrl).looksLikeHls ? getMpegTsCandidateForHls(channel.streamUrl) : channel.streamUrl);
      if (tsUrl) {
        playWithMpegTs(tsUrl);
      }
      return () => {
        generationRef.current += 1;
        stopCurrentVideo();
      };
    }

    if (strategyPreference === "force-mpegts-proxy") {
      const tsUrl = channel.xtream?.tsUrl ?? (detectStreamFormat(channel.streamUrl).looksLikeHls ? getMpegTsCandidateForHls(channel.streamUrl) : channel.streamUrl);
      if (tsUrl) {
        const proxiedTsUrl = createProxyStreamUrl(tsUrl, proxyHeaderProfile);
        updateDiagnostics(channel.streamUrl, undefined, {
          activeUrlIsProxied: true,
          activeStrategy: "mpegtsjs",
          proxyManifestValid: "not-applicable",
          proxyManifestRewritten: "false",
          proxyRewrittenCount: "0",
        });
        if (isSafariLikeBrowser()) {
          playWithNative(proxiedTsUrl, "native", "MPEG-TS por proxy (nativo Safari)");
        } else {
          playWithMpegTs(proxiedTsUrl, "MPEG-TS por proxy");
        }
      }
      return () => {
        generationRef.current += 1;
        stopCurrentVideo();
      };
    }

    if (strategyPreference === "force-transmux-proxy") {
      const tsUrl = channel.xtream?.tsUrl ?? (detectStreamFormat(channel.streamUrl).looksLikeHls ? getMpegTsCandidateForHls(channel.streamUrl) : channel.streamUrl);
      if (tsUrl) {
        const startupAttempt = createAttempt(tsUrl, "hlsjs", "Transmux startup");
        writeAttempt(startupAttempt);
        void startTransmuxSession(tsUrl, proxyHeaderProfile).then((sessionResult) => {
          if (generation !== generationRef.current) {
            return;
          }
          updateAttempt(startupAttempt.id, "success");
          transmuxSessionRef.current = sessionResult.id;
          updateDiagnostics(channel.streamUrl, undefined, {
            activeStrategy: Hls.isSupported() ? "hlsjs" : "native",
            activeUrlIsProxied: true,
            proxyManifestValid: "not-applicable",
            proxyManifestRewritten: "false",
            proxyRewrittenCount: "0",
          });
          if (Hls.isSupported()) {
            playWithHls(sessionResult.playlistUrl, "hlsjs", undefined, "Transmux proxy HLS");
          } else {
            playWithNative(sessionResult.playlistUrl, "native", "Transmux proxy HLS");
          }
        }).catch(async (error) => {
          if (generation !== generationRef.current) {
            return;
          }
          const detail = error instanceof Error ? error.message : "Transmux start failed";
          updateAttempt(startupAttempt.id, "failed", detail);
          // One controlled retry for fragile providers/process startup races.
          try {
            const retryAttempt = createAttempt(tsUrl, "hlsjs", "Transmux startup (retry)");
            writeAttempt(retryAttempt);
            const retryResult = await startTransmuxSession(tsUrl, proxyHeaderProfile);
            if (generation !== generationRef.current) {
              return;
            }
            updateAttempt(retryAttempt.id, "success");
            transmuxSessionRef.current = retryResult.id;
            if (Hls.isSupported()) {
              playWithHls(retryResult.playlistUrl, "hlsjs", undefined, "Transmux proxy HLS");
            } else {
              playWithNative(retryResult.playlistUrl, "native", "Transmux proxy HLS");
            }
            return;
          } catch (retryError) {
            const retryDetail = retryError instanceof Error ? retryError.message : "Transmux retry failed";
            const looksLikeProxy403 = /\b403\b|forbidden/i.test(retryDetail);
            const directUrl = channel.xtream?.hlsUrl ?? channel.streamUrl;
            if (looksLikeProxy403 && directUrl) {
              const directAttempt = createAttempt(directUrl, "hlsjs", "Fallback directo navegador");
              writeAttempt(directAttempt);
              updateAttempt(directAttempt.id, "attempting");
              playUrlByDetectedType(directUrl, "Fallback directo navegador");
              return;
            }
            failIfCurrent(createPlaybackError("stream_unreachable", { technicalDetail: retryDetail, diagnostics: createCurrentDiagnostics(video, containerRef.current, channel.streamUrl, retryDetail, attemptStateRef.current, channel) }));
          }
        });
      }
      return () => {
        generationRef.current += 1;
        stopCurrentVideo();
        void clearTransmuxSession();
      };
    }

    const streamFormat = detectStreamFormat(channel.streamUrl);

    if (streamFormat.looksLikeHls) {
      const tryMpegTsFallback = (technicalDetail?: string) => {
        const mpegTsCandidate = getMpegTsCandidateForHls(channel.streamUrl);
        if (!mpegTsCandidate) {
          failIfCurrent(createPlaybackError("hls_error", { technicalDetail, diagnostics: createCurrentDiagnostics(video, containerRef.current, channel.streamUrl, technicalDetail, attemptStateRef.current, channel) }));
          return;
        }

        updateDiagnostics(channel.streamUrl, technicalDetail, { hlsCandidateAttempt: "failed", mpegtsAttempt: "attempting" });
        playWithMpegTs(mpegTsCandidate);
      };

      if (isSafariLikeBrowser() && canPlayNativeHls(video)) {
        playWithNative(channel.streamUrl, "native");
      } else if (Hls.isSupported()) {
        playWithHls(channel.streamUrl, "hlsjs", tryMpegTsFallback);
      } else if (canPlayNativeHls(video)) {
        playWithNative(channel.streamUrl, "native");
      } else {
        failIfCurrent(createPlaybackError("unsupported_format", { technicalDetail: `nativeHls=${canPlayNativeHls(video)} hlsJs=false`, diagnostics: createCurrentDiagnostics(video, containerRef.current, channel.streamUrl, undefined, attemptStateRef.current, channel) }));
      }
    } else if (streamFormat.looksLikeMp4) {
      playWithNative(channel.streamUrl, "native");
    } else if (streamFormat.looksLikeMpegTs) {
      const hlsCandidate = getHlsCandidateForMpegTs(channel.streamUrl);
      if (hlsCandidate) {
        updateDiagnostics(channel.streamUrl, undefined, { hlsCandidateAttempt: "attempting", activeStrategy: "hls_candidate" });
        if (Hls.isSupported()) {
          playWithHls(hlsCandidate, "hls_candidate", (technicalDetail) => {
            updateDiagnostics(channel.streamUrl, technicalDetail, { hlsCandidateAttempt: "failed" });
            playWithMpegTs();
          });
        } else if (canPlayNativeHls(video)) {
          playWithNative(hlsCandidate, "hls_candidate");
        } else {
          updateDiagnostics(channel.streamUrl, "No HLS support for candidate", { hlsCandidateAttempt: "unsupported" });
          playWithMpegTs();
        }
      } else {
        playWithMpegTs();
      }
    } else {
      playWithNative(channel.streamUrl, "unknown_native");
    }

    return () => {
      generationRef.current += 1;
      stopCurrentVideo();
      void clearTransmuxSession();
    };
  }, [channel, clearLoadTimeout, clearTransmuxSession, destroyHls, destroyMpegTs, playCurrentVideo, proxyHeaderProfile, retryNonce, setError, setStatus, stopCurrentVideo, strategyPreference, updateDiagnostics, useExperimentalProxy]);

  const togglePlayPause = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !channel) {
      return;
    }

    if (status === "playing") {
      userPauseRequestedRef.current = true;
      video.pause();
      setStatus("paused");
      return;
    }

    userPauseRequestedRef.current = false;
    await playCurrentVideo(channel.streamUrl, generationRef.current);
  }, [channel, playCurrentVideo, setStatus, status]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.muted = !video.muted;
    setMuted(video.muted);
  }, [setMuted]);

  const changeVolume = useCallback((nextVolume: number) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.volume = nextVolume;
    video.muted = nextVolume === 0;
    setVolume(nextVolume);
    setMuted(video.muted);
  }, [setMuted, setVolume]);

  const togglePiP = useCallback(async () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture?.();
      } else if ("requestPictureInPicture" in video) {
        await video.requestPictureInPicture();
      }
    } catch (pipError) {
      const detail = pipError instanceof Error ? pipError.message : "Picture-in-Picture blocked";
      setError(createPlaybackError("unknown", { technicalDetail: detail, diagnostics: createCurrentDiagnostics(video, containerRef.current, channel?.streamUrl, detail, attemptStateRef.current) }));
    }
  }, [channel, setError]);

  const requestFullscreen = useCallback(async () => {
    const container = containerRef.current;
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;

    try {
      if (container?.requestFullscreen) {
        await container.requestFullscreen();
        return;
      }

      // iOS Safari fallback: this API is non-standard but still required on iPhone.
      if (video?.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
        return;
      }

      setError({
        code: "unknown",
        title: "Pantalla completa no disponible",
        message: "Este navegador o dispositivo no permite activar pantalla completa desde este reproductor.",
        recoverable: true,
      });
    } catch (fullscreenError) {
      const detail = fullscreenError instanceof Error ? fullscreenError.message : undefined;
      setError({
        code: "unknown",
        title: "Pantalla completa bloqueada",
        message: "El navegador no permitió activar pantalla completa en este momento.",
        technicalDetail: detail,
        recoverable: true,
        diagnostics: createCurrentDiagnostics(videoRef.current, containerRef.current, channel?.streamUrl, detail, attemptStateRef.current, channel),
      });
    }
  }, [channel, setError]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !channel) {
      setDiagnostics(undefined);
      return;
    }

    setDiagnostics(createCurrentDiagnostics(video, containerRef.current, channel.streamUrl, error?.technicalDetail, attemptStateRef.current, channel));
  }, [channel, error?.technicalDetail]);

  useEffect(() => {
    const onWindowError = (event: ErrorEvent) => {
      const message = event.message ?? "";
      const stack = event.error instanceof Error ? event.error.stack ?? "" : "";
      const mpegTsInvalidState =
        /invalid state/i.test(message) &&
        (/mpegts/i.test(stack) || /mpegts/i.test(event.filename ?? ""));

      if (!mpegTsInvalidState) {
        return;
      }

      // Non-fatal mpegts.js internal state errors can surface on Safari during MSE churn.
      // Preventing default avoids the dev runtime overlay while playback may continue.
      event.preventDefault();
      updateDiagnostics(channel?.streamUrl, `Ignored mpegts InvalidStateError: ${message}`, { ignoredInterruptedPlay: true });
    };

    window.addEventListener("error", onWindowError);
    return () => {
      window.removeEventListener("error", onWindowError);
    };
  }, [channel?.streamUrl, updateDiagnostics]);

  const isLoading = status === "loading";

  return (
    <GlassPanel className="w-full max-w-full overflow-hidden p-3 sm:p-4" elevated>
      <div ref={containerRef} className="group relative aspect-video w-full max-w-full overflow-hidden rounded-[1.6rem] border border-white/10 bg-[radial-gradient(circle_at_50%_35%,rgba(56,189,248,0.24),transparent_30%),linear-gradient(135deg,#020617,#0f172a_55%,#082f49)] light:bg-[radial-gradient(circle_at_50%_35%,rgba(14,165,233,0.18),transparent_30%),linear-gradient(135deg,#e0f2fe,#f8fafc_60%,#dbeafe)]">
        <video
          ref={videoRef}
          className="h-full w-full bg-black object-contain"
          controls={false}
          muted={muted}
          playsInline
          preload="metadata"
        />

        {!channel ? <EmptyPlayerState /> : null}
        {channel && status === "paused" && !error && showManualResumeHint ? <ReadyPlayerState /> : null}
        {isLoading ? <LoadingOverlay /> : null}
        <PlayerErrorState error={error} onRetry={retry} />
        <PlayerDiagnosticsPanel
          channel={channel}
          diagnostics={diagnostics}
          onProxyChange={setUseExperimentalProxy}
          onProxyProfileChange={setProxyHeaderProfile}
          onStrategyChange={setStrategyPreference}
          proxyEnabled={useExperimentalProxy}
          proxyHeaderProfile={proxyHeaderProfile}
          strategy={strategyPreference}
        />

        <PlayerControls channel={channel} onFullscreen={requestFullscreen} onPlayPause={togglePlayPause} onRetry={retry} onToggleMute={toggleMute} onTogglePiP={togglePiP} onVolumeChange={changeVolume} />
      </div>
    </GlassPanel>
  );
}

function EmptyPlayerState() {
  return (
    <div className="absolute inset-0 grid place-items-center p-5 text-center">
      <div>
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-sky-300/20 bg-sky-300/12 text-sky-100 light:text-sky-800">
          <MonitorPlay size={28} />
        </div>
        <h2 className="mt-5 text-2xl font-semibold sm:text-4xl">Selecciona un canal para empezar</h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-slate-300 light:text-slate-600">El reproductor usará HTML5 video, HLS nativo si está disponible, hls.js cuando haga falta y compatibilidad MPEG-TS experimental.</p>
      </div>
    </div>
  );
}

function ReadyPlayerState() {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center bg-slate-950/16 p-5 text-center light:bg-white/10">
      <div className="rounded-[1.6rem] border border-white/12 bg-slate-950/45 px-5 py-4 backdrop-blur-xl light:bg-white/65">
        <StatusPill><Radio size={14} /> Pulsa Reproducir si el navegador lo pausó</StatusPill>
      </div>
    </div>
  );
}

function LoadingOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-slate-950/38 backdrop-blur-[2px] light:bg-white/32">
      <div className="rounded-3xl border border-white/12 bg-slate-950/55 p-5 text-center backdrop-blur-xl light:bg-white/72">
        <Loader2 className="mx-auto animate-spin text-sky-200 light:text-sky-700" size={34} />
        <p className="mt-3 text-sm font-semibold">Cargando stream...</p>
      </div>
    </div>
  );
}

function PlayerDiagnosticsPanel({
  channel,
  diagnostics,
  onProxyChange,
  onProxyProfileChange,
  onStrategyChange,
  proxyEnabled,
  proxyHeaderProfile,
  strategy,
}: {
  channel?: IPTVChannel;
  diagnostics?: StreamDiagnostics;
  onProxyChange: (enabled: boolean) => void;
  onProxyProfileChange: (profile: ProxyHeaderProfile) => void;
  onStrategyChange: (strategy: PlaybackStrategyPreference) => void;
  proxyEnabled: boolean;
  proxyHeaderProfile: ProxyHeaderProfile;
  strategy: PlaybackStrategyPreference;
}) {
  const [probeResult, setProbeResult] = useState<string>("Sin prueba TS manual todavía.");
  const [copyStatus, setCopyStatus] = useState<string>("");
  const [isVisible, setIsVisible] = useState(false);

  if (process.env.NODE_ENV !== "development" || !diagnostics) {
    return null;
  }

  const currentDiagnostics = diagnostics;

  const rows = [
    ["Proxy", currentDiagnostics.proxyEnabled ? "sí" : "no"],
    ["Perfil proxy", currentDiagnostics.proxyHeaderProfile ?? proxyHeaderProfile],
    ["URL proxificada", currentDiagnostics.activeUrlIsProxied ? "sí" : "no"],
    ["Proxy status remoto", currentDiagnostics.proxyRemoteStatus ?? "no disponible"],
    ["Proxy content-type", currentDiagnostics.proxyContentType ?? "no disponible"],
    ["Proxy range usado", currentDiagnostics.proxyRangeUsed ?? "no"],
    ["Proxy error", currentDiagnostics.proxyError ?? "sin error proxy"],
    ["Manifest válido", currentDiagnostics.proxyManifestValid ?? "no disponible"],
    ["Manifest reescrito", currentDiagnostics.proxyManifestRewritten ?? "no disponible"],
    ["URLs reescritas", currentDiagnostics.proxyRewrittenCount ?? "0"],
    ["Primeros bytes (hex)", currentDiagnostics.proxyProbeFirstBytes ?? "no disponible"],
    ["sourceType", currentDiagnostics.sourceType ?? "desconocido"],
    ["profileType", currentDiagnostics.profileType ?? "desconocido"],
    ["URL activa", currentDiagnostics.maskedUrl],
    ["Origen URL", currentDiagnostics.urlOrigin],
    ["Tipo", currentDiagnostics.streamType],
    ["Extensión", currentDiagnostics.extension ?? "sin extensión"],
    ["stream_id", currentDiagnostics.streamId ?? "no aplica"],
    ["direct_source", currentDiagnostics.usesDirectSource ? "sí" : "no"],
    ["TS oficial", channel?.xtream?.tsUrl ? maskStreamUrl(channel.xtream.tsUrl) : "no aplica"],
    ["Xtream hlsUrl", currentDiagnostics.xtreamHlsUrl ?? "no aplica"],
    ["Xtream tsUrl", currentDiagnostics.xtreamTsUrl ?? "no aplica"],
    ["Xtream direct", currentDiagnostics.xtreamDirectSource ?? "no aplica"],
    ["HLS candidata", currentDiagnostics.hlsCandidateUrl ?? "no disponible"],
    ["mpegts.js", currentDiagnostics.mpegtsJs ? "soportado" : "no soportado"],
    ["Estrategia activa", currentDiagnostics.activeStrategy ?? "sin estrategia"],
    ["HLS nativo", currentDiagnostics.nativeHls ? "sí" : "no"],
    ["hls.js", currentDiagnostics.hlsJs ? "sí" : "no"],
    ["PiP", currentDiagnostics.pip ? "sí" : "no"],
    ["Proxy sugerido", currentDiagnostics.possibleProxyNextStep ? "sí" : "no"],
    ["Último error", currentDiagnostics.lastTechnicalError ?? "sin error técnico"],
  ];

  async function copyDiagnostics() {
    const text = [
      "IPTVWeb playback diagnostics",
      `strategy=${strategy}`,
      `proxyEnabled=${proxyEnabled ? "yes" : "no"}`,
      `proxyProfile=${currentDiagnostics.proxyHeaderProfile ?? proxyHeaderProfile}`,
      `proxyRemoteStatus=${currentDiagnostics.proxyRemoteStatus ?? "n/a"}`,
      `proxyContentType=${currentDiagnostics.proxyContentType ?? "n/a"}`,
      `proxyRangeUsed=${currentDiagnostics.proxyRangeUsed ?? "no"}`,
      `proxyError=${currentDiagnostics.proxyError ?? "none"}`,
      `proxyManifestValid=${currentDiagnostics.proxyManifestValid ?? "n/a"}`,
      `proxyManifestRewritten=${currentDiagnostics.proxyManifestRewritten ?? "n/a"}`,
      `proxyRewrittenCount=${currentDiagnostics.proxyRewrittenCount ?? "0"}`,
      `sourceType=${currentDiagnostics.sourceType ?? "unknown"}`,
      `profileType=${currentDiagnostics.profileType ?? "unknown"}`,
      `streamType=${currentDiagnostics.streamType}`,
      `extension=${currentDiagnostics.extension ?? "none"}`,
      `activeUrl=${currentDiagnostics.maskedUrl}`,
      `urlOrigin=${currentDiagnostics.urlOrigin}`,
      `streamId=${currentDiagnostics.streamId ?? "n/a"}`,
      `usesDirectSource=${currentDiagnostics.usesDirectSource ? "yes" : "no"}`,
      `nativeHls=${currentDiagnostics.nativeHls ? "yes" : "no"}`,
      `hlsJs=${currentDiagnostics.hlsJs ? "yes" : "no"}`,
      `mpegtsJs=${currentDiagnostics.mpegtsJs ? "yes" : "no"}`,
      `browser=${navigator.userAgent}`,
      `lastError=${currentDiagnostics.lastTechnicalError ?? "none"}`,
      "attempts:",
      ...currentDiagnostics.attempts.map((attempt, index) => `${index + 1}. ${attempt.label} | ${attempt.strategy} | ${attempt.streamType} | ${attempt.result} | ${attempt.maskedUrl}${attempt.error ? ` | ${attempt.error}` : ""}`),
    ].join("\n");
    const copied = await copyTextToClipboard(text);
    setCopyStatus(copied ? "Diagnóstico copiado" : "No se pudo copiar automáticamente");
    window.setTimeout(() => setCopyStatus(""), 1800);
  }

  return (
    <>
      <button
        aria-label={isVisible ? "Ocultar diagnóstico" : "Mostrar diagnóstico"}
        className="pointer-events-auto absolute right-3 top-3 z-30 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-slate-950/60 text-sky-100 backdrop-blur-xl transition hover:bg-slate-900/70 light:bg-white/70 light:text-sky-800"
        onClick={() => setIsVisible((value) => !value)}
        type="button"
      >
        <Bug size={16} />
      </button>
      {isVisible ? <div className="pointer-events-auto absolute left-3 top-14 z-30 hidden max-h-[calc(100%-4rem)] max-w-[min(44rem,calc(100%-1.5rem))] overflow-auto rounded-2xl border border-white/12 bg-slate-950/72 p-3 text-[11px] text-slate-200 shadow-[0_18px_60px_rgba(2,8,23,0.28)] backdrop-blur-2xl lg:block">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-semibold uppercase tracking-[0.18em] text-sky-200">Diagnóstico dev</p>
        <div className="flex items-center gap-2">
          {copyStatus ? <span className="text-[10px] text-sky-200">{copyStatus}</span> : null}
          <button className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-semibold text-sky-100" onClick={copyDiagnostics} type="button">Copiar diagnóstico</button>
        </div>
      </div>
      <label className="mb-3 flex items-center gap-2 text-slate-300">
        <input checked={proxyEnabled} className="accent-sky-300" onChange={(event) => onProxyChange(event.target.checked)} type="checkbox" />
        Usar proxy experimental
      </label>
      <label className="mb-3 grid gap-1 text-slate-400">
        Perfil headers proxy
        <select
          className="rounded-xl border border-white/10 bg-slate-950/80 px-2 py-1 text-slate-100"
          onChange={(event) => onProxyProfileChange(event.target.value as ProxyHeaderProfile)}
          value={proxyHeaderProfile}
        >
          <option value="default">Default</option>
          <option value="browser-like">Browser-like</option>
          <option value="vlc-like">VLC-like</option>
          <option value="iptv-smarters-like">IPTV-Smarters-like</option>
          <option value="tivimate-like">TiviMate-like</option>
          <option value="generic-iptv">Generic-IPTV</option>
          <option value="no-origin">No-Origin</option>
        </select>
      </label>
      <button
        className="mb-3 rounded-xl border border-sky-300/25 bg-sky-400/10 px-3 py-2 text-left text-sky-100 transition hover:bg-sky-400/15"
        onClick={() => {
          void testOfficialTsByProxy(channel, proxyHeaderProfile).then((result) => {
            setProbeResult(result);
          });
        }}
        type="button"
      >
        Probar TS oficial por proxy
      </button>
      <label className="mb-3 grid gap-1 text-slate-400">
        Estrategia preferida
        <select className="rounded-xl border border-white/10 bg-slate-950/80 px-2 py-1 text-slate-100" onChange={(event) => onStrategyChange(event.target.value as PlaybackStrategyPreference)} value={strategy}>
          <option value="auto">Auto</option>
          <option value="prefer-hls">Preferir HLS .m3u8</option>
          <option value="force-hls">Forzar HLS .m3u8</option>
          <option value="force-mpegts">Forzar MPEG-TS .ts</option>
          <option value="force-mpegts-proxy">Forzar MPEG-TS por proxy</option>
          <option value="force-transmux-proxy">Forzar Transmux proxy (HLS)</option>
          <option value="direct-source">Usar direct_source</option>
        </select>
      </label>
      <dl className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-3 gap-y-1">
        {rows.map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-slate-500">{label}</dt>
            <dd className="truncate font-mono">{value}</dd>
          </Fragment>
        ))}
      </dl>
      <div className="mt-3 border-t border-white/10 pt-3">
        <p className="mb-2 font-semibold uppercase tracking-[0.18em] text-sky-200">Intentos</p>
        <div className="grid gap-2">
          {currentDiagnostics.attempts.length === 0 ? <p className="text-slate-500">Sin intentos todavía.</p> : null}
          {currentDiagnostics.attempts.map((attempt, index) => (
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2" key={attempt.id}>
              <p className="font-semibold text-slate-100">{index + 1}. {attempt.label} · {attempt.result}</p>
              <p className="font-mono text-slate-400">{attempt.strategy} · {attempt.streamType}</p>
              <p className="truncate font-mono text-slate-300">{attempt.maskedUrl}</p>
              {attempt.error ? <p className="truncate font-mono text-rose-200">{attempt.error}</p> : null}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-2">
        <p className="mb-1 font-semibold uppercase tracking-[0.18em] text-sky-200">Última prueba TS</p>
        <p className="whitespace-pre-wrap font-mono text-slate-300">{probeResult}</p>
      </div>
      {currentDiagnostics.possibleProxyNextStep ? <p className="mt-3 rounded-xl border border-sky-300/20 bg-sky-300/10 p-2 text-sky-100">Posible siguiente paso: proxy opcional. La API carga canales, pero los streams fallan por NetworkError/CORS.</p> : null}
      </div> : null}
    </>
  );
}

function createCurrentDiagnostics(video: HTMLVideoElement | null, container: HTMLElement | null, url?: string, lastTechnicalError?: string, attemptState?: AttemptState, channel?: import("@/types/channel").IPTVChannel) {
  if (!video || !url) {
    return undefined;
  }

  return createStreamDiagnostics(url, video, container, lastTechnicalError, attemptState, channel);
}

async function readProxyErrorText(response: Response): Promise<string | undefined> {
  try {
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = (await response.clone().json()) as { error?: unknown };
      return typeof body.error === "string" ? body.error : undefined;
    }

    const text = await response.clone().text();
    return text.slice(0, 180).replace(/(username=)[^&\s]+/gi, "$1••••").replace(/(password=)[^&\s]+/gi, "$1••••");
  } catch {
    return undefined;
  }
}

interface ProxyProbePayload {
  error?: string;
  firstBytesHex?: string;
  contentLength?: string;
  looksLikeVideoMp2t?: boolean;
  looksLikeHtml?: boolean;
}

async function parseProxyProbe(response: Response): Promise<ProxyProbePayload> {
  try {
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return {};
    }
    const body = (await response.clone().json()) as {
      error?: unknown;
      firstBytesHex?: unknown;
      contentLength?: unknown;
      looksLikeVideoMp2t?: unknown;
      looksLikeHtml?: unknown;
    };
    return {
      error: typeof body.error === "string" ? body.error : undefined,
      firstBytesHex: typeof body.firstBytesHex === "string" ? body.firstBytesHex : undefined,
      contentLength: typeof body.contentLength === "string" ? body.contentLength : undefined,
      looksLikeVideoMp2t: typeof body.looksLikeVideoMp2t === "boolean" ? body.looksLikeVideoMp2t : undefined,
      looksLikeHtml: typeof body.looksLikeHtml === "boolean" ? body.looksLikeHtml : undefined,
    };
  } catch {
    return {};
  }
}

async function testOfficialTsByProxy(channel: IPTVChannel | undefined, profile: ProxyHeaderProfile): Promise<string> {
  const tsUrl = channel?.xtream?.tsUrl ?? (detectStreamFormat(channel?.streamUrl ?? "").looksLikeMpegTs ? channel?.streamUrl : undefined);
  if (!tsUrl) {
    return "No hay URL .ts oficial disponible para este canal.";
  }

  try {
    const proxyUrl = createProxyStreamUrl(tsUrl, profile, true);
    const response = await fetch(proxyUrl, { cache: "no-store", headers: { Range: "bytes=0-511" } });
    const body = await parseProxyProbe(response);
    const lines = [
      `status=${response.headers.get("x-iptvweb-proxy-remote-status") ?? response.status}`,
      `contentType=${response.headers.get("x-iptvweb-proxy-content-type") ?? response.headers.get("content-type") ?? "unknown"}`,
      `contentLength=${body.contentLength ?? "n/a"}`,
      `acceptRanges=${response.headers.get("accept-ranges") ?? "n/a"}`,
      `rangeUsed=${response.headers.get("x-iptvweb-proxy-range-used") ?? "no"}`,
      `profile=${response.headers.get("x-iptvweb-proxy-profile") ?? profile}`,
      `looksLikeVideoMp2t=${body.looksLikeVideoMp2t ? "yes" : "no"}`,
      `looksLikeHtml=${body.looksLikeHtml ? "yes" : "no"}`,
      `manifestValid=${response.headers.get("x-iptvweb-proxy-manifest-valid") ?? "n/a"}`,
      `rewritten=${response.headers.get("x-iptvweb-proxy-manifest-rewritten") ?? "n/a"}`,
      `firstBytesHex=${body.firstBytesHex ?? "n/a"}`,
      `error=${body.error ?? "none"}`,
      `url=${maskStreamUrl(tsUrl)}`,
    ];
    return lines.join("\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : "probe failed";
    return `Error de prueba TS por proxy: ${message}`;
  }
}

interface TransmuxStartResponse {
  id: string;
  status: "starting" | "ready";
  playlistUrl: string;
  error?: string;
  debug?: {
    ended?: boolean;
    exitCode?: number | null;
    stderrTail?: string;
  };
}

async function startTransmuxSession(url: string, profile: ProxyHeaderProfile): Promise<{ id: string; playlistUrl: string }> {
  const response = await fetch("/api/transmux/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, profile }),
  });

  const payload = (await response.json()) as Partial<TransmuxStartResponse>;
  if (!response.ok || !payload.id || !payload.playlistUrl) {
    const reason = payload.error ?? "No se pudo iniciar sesión transmux";
    const debug = payload.debug?.stderrTail ? ` | ${payload.debug.stderrTail}` : "";
    throw new Error(`${reason}${debug}`);
  }

  const playlistUrl = payload.playlistUrl;
  const ready = await waitUntilManifestReady(playlistUrl, 12000);
  if (!ready.ok) {
    throw new Error(`Transmux no listo (${ready.reason})`);
  }

  return { id: payload.id, playlistUrl };
}

async function waitUntilManifestReady(playlistUrl: string, timeoutMs: number): Promise<{ ok: true } | { ok: false; reason: string }> {
  const startedAt = Date.now();
  let lastStatus = "unknown";
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(playlistUrl, { cache: "no-store" });
      lastStatus = String(response.status);
      if (response.ok) {
        const text = await response.text();
        if (text.trimStart().startsWith("#EXTM3U")) {
          return { ok: true };
        }
      }
    } catch {
      // keep polling
    }
    await delay(250);
  }
  return { ok: false, reason: `status=${lastStatus}` };
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

function maskAttemptUrl(url: string): string {
  return maskStreamUrl(url);
}

function toAbsolutePlaybackUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  if (typeof window === "undefined") {
    return url;
  }

  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
}

function isSafariLikeBrowser(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const userAgent = navigator.userAgent;
  return /Safari/i.test(userAgent) && !/Chrome|Chromium|Edg|OPR/i.test(userAgent);
}

function shouldProxyRemoteUrl(url: string): boolean {
  if (url.startsWith("/")) {
    return false;
  }

  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }
    if (parsed.origin === (typeof window !== "undefined" ? window.location.origin : "")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
