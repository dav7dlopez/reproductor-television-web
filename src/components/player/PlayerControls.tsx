"use client";

import { Maximize, Pause, Play, Power, RotateCcw, Volume1, Volume2, VolumeX } from "lucide-react";
import { PipButton } from "@/components/player/PipButton";
import { getCurrentProgram } from "@/lib/epg/epgUtils";
import { getEpgProgramsForIptvChannel, useEpgStore } from "@/store/useEpgStore";
import { usePlayerStore } from "@/store/usePlayerStore";
import type { IPTVChannel } from "@/types/channel";

interface PlayerControlsProps {
  channel?: IPTVChannel;
  onFullscreen: () => void;
  onPlayPause: () => void;
  onRetry: () => void;
  onToggleMute: () => void;
  onTogglePiP: () => void;
  onVolumeChange: (volume: number) => void;
  onStop: () => void;
}

const controlButtonClass = "inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/12 bg-white/12 text-white backdrop-blur-xl transition hover:bg-sky-300/22 disabled:cursor-not-allowed disabled:opacity-50 light:border-slate-300/70 light:bg-white/75 light:text-slate-900";

export function PlayerControls({ channel, onFullscreen, onPlayPause, onRetry, onToggleMute, onTogglePiP, onVolumeChange, onStop }: PlayerControlsProps) {
  const status = usePlayerStore((state) => state.status);
  const muted = usePlayerStore((state) => state.muted);
  const volume = usePlayerStore((state) => state.volume);
  const isPiPAvailable = usePlayerStore((state) => state.isPiPAvailable);
  const isPiPActive = usePlayerStore((state) => state.isPiPActive);
  const programsByChannelId = useEpgStore((state) => state.programsByChannelId);
  const matchesByChannelId = useEpgStore((state) => state.matchesByChannelId);
  const isPlaying = status === "playing";
  const nowProgram = channel ? getCurrentProgram(getEpgProgramsForIptvChannel(channel.id, programsByChannelId, matchesByChannelId)) : undefined;

  return (
    <div className="pointer-events-none absolute inset-x-2 bottom-2 z-30 sm:inset-x-4 sm:bottom-4">
      <div className="pointer-events-auto rounded-2xl border border-white/12 bg-slate-950/50 p-2 shadow-[0_20px_60px_rgba(2,8,23,0.28)] backdrop-blur-xl light:bg-white/72">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-sky-200 light:text-sky-700">{channel?.name ?? "Sin canal seleccionado"}</p>
            <h3 className="truncate text-sm font-semibold text-white light:text-slate-950">{nowProgram?.title ?? "Sin EPG"}</h3>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button aria-label={isPlaying ? "Pausar" : "Reproducir"} className={`${controlButtonClass} bg-sky-300 text-slate-950 hover:bg-cyan-200`} disabled={!channel || status === "loading"} onClick={onPlayPause} type="button">
              {isPlaying ? <Pause size={17} /> : <Play size={17} />}
            </button>
            {status === "error" ? (
              <button aria-label="Reintentar" className={controlButtonClass} onClick={onRetry} type="button">
                <RotateCcw size={17} />
              </button>
            ) : null}
            <button aria-label="Sonido" className={controlButtonClass} disabled={!channel} onClick={onToggleMute} type="button">
              {muted || volume === 0 ? <VolumeX size={17} /> : volume < 0.5 ? <Volume1 size={17} /> : <Volume2 size={17} />}
            </button>
            <button aria-label="Detener" className={controlButtonClass} disabled={!channel} onClick={onStop} type="button">
              <Power size={17} />
            </button>
            <label className="hidden items-center gap-2 rounded-xl border border-white/12 bg-white/12 px-2 py-1.5 backdrop-blur-xl light:border-slate-300/70 light:bg-white/75 md:flex">
              <span className="sr-only">Volumen</span>
              <input className="w-20 accent-sky-300" disabled={!channel} max="1" min="0" onChange={(event) => onVolumeChange(Number(event.target.value))} step="0.05" type="range" value={muted ? 0 : volume} />
            </label>
            {isPiPAvailable ? <PipButton className={controlButtonClass} isActive={isPiPActive} onToggle={onTogglePiP} /> : null}
            <button aria-label="Pantalla completa" className={controlButtonClass} disabled={!channel} onClick={onFullscreen} type="button">
              <Maximize size={17} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
