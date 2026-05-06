"use client";

import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { PlaybackError } from "@/types/player";

interface PlayerErrorStateProps {
  error?: PlaybackError;
  onRetry: () => void;
}

export function PlayerErrorState({ error, onRetry }: PlayerErrorStateProps) {
  if (!error) {
    return null;
  }

  const showTechnicalDetails = process.env.NODE_ENV === "development" && (error.technicalDetail || error.diagnostics);

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-slate-950/72 p-4 backdrop-blur-md light:bg-white/72">
      <div className="max-w-xl rounded-[1.75rem] border border-rose-300/25 bg-rose-500/12 p-5 text-rose-50 shadow-[0_24px_90px_rgba(244,63,94,0.18)] light:bg-rose-50/92 light:text-rose-900">
        <div className="flex gap-3">
          <AlertTriangle className="mt-1 shrink-0" size={22} />
          <div>
            <h3 className="text-lg font-semibold">{error.title}</h3>
            <p className="mt-2 text-sm leading-6 opacity-90">{error.message}</p>
            {error.suggestion ? <p className="mt-3 text-sm leading-6 opacity-85">{error.suggestion}</p> : null}
            {showTechnicalDetails ? (
              <details className="mt-3 rounded-2xl bg-black/20 p-3 text-xs opacity-90 light:bg-white/78">
                <summary className="cursor-pointer font-semibold">Detalles técnicos</summary>
                {error.technicalDetail ? <p className="mt-2 font-mono">{error.technicalDetail}</p> : null}
                {error.diagnostics ? (
                  <dl className="mt-2 grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1 font-mono">
                    <dt>URL</dt><dd className="truncate">{error.diagnostics.maskedUrl}</dd>
                    <dt>Tipo</dt><dd>{error.diagnostics.streamType}</dd>
                    <dt>Extensión</dt><dd>{error.diagnostics.extension ?? "sin extensión"}</dd>
                    <dt>HLS nativo</dt><dd>{error.diagnostics.nativeHls ? "sí" : "no"}</dd>
                    <dt>hls.js</dt><dd>{error.diagnostics.hlsJs ? "sí" : "no"}</dd>
                  </dl>
                ) : null}
              </details>
            ) : null}
          </div>
        </div>
        {error.recoverable ? (
          <Button className="mt-5 w-full" onClick={onRetry} type="button" variant="secondary">
            <RefreshCcw size={17} /> Reintentar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
