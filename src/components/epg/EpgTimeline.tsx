import { useEffect, useMemo, useState } from "react";
import { formatProgramTime, getCurrentProgram, getProgramProgress, sortProgramsByDate } from "@/lib/epg/epgUtils";
import type { EpgProgram } from "@/types/epg";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatHourLabel(ms: number) {
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
}

interface EpgTimelineProps {
  programs: EpgProgram[];
  focusMs: number;
}

interface TimelineSegment {
  id: string;
  startMs: number;
  stopMs: number;
  program?: EpgProgram;
}

export function EpgTimeline({ programs, focusMs }: EpgTimelineProps) {
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const sortedPrograms = useMemo(() => sortProgramsByDate(programs), [programs]);
  const current = useMemo(() => getCurrentProgram(sortedPrograms, nowTick), [sortedPrograms, nowTick]);

  const windowDurationMs = 4 * 60 * 60 * 1000;
  const windowStartMs = focusMs - windowDurationMs / 2;
  const windowEndMs = focusMs + windowDurationMs / 2;
  const visiblePrograms = sortedPrograms
    .filter((program) => program.stopMs > windowStartMs && program.startMs < windowEndMs)
    .map((program) => ({
      ...program,
      startMs: Math.max(program.startMs, windowStartMs),
      stopMs: Math.min(program.stopMs, windowEndMs),
    }));

  const segments = useMemo<TimelineSegment[]>(() => {
    const result: TimelineSegment[] = [];
    let cursor = windowStartMs;

    for (const program of visiblePrograms) {
      if (program.startMs > cursor) {
        result.push({
          id: `gap-${cursor}-${program.startMs}`,
          startMs: cursor,
          stopMs: program.startMs,
        });
      }

      result.push({
        id: program.id,
        startMs: program.startMs,
        stopMs: program.stopMs,
        program,
      });
      cursor = program.stopMs;
    }

    if (cursor < windowEndMs) {
      result.push({
        id: `gap-${cursor}-${windowEndMs}`,
        startMs: cursor,
        stopMs: windowEndMs,
      });
    }
    return result;
  }, [visiblePrograms, windowEndMs, windowStartMs]);

  const tickCount = 8;
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => {
    const ratio = index / tickCount;
    return {
      ms: windowStartMs + ratio * windowDurationMs,
      leftPct: ratio * 100,
    };
  });

  const nowLinePct = clamp(((nowTick - windowStartMs) / windowDurationMs) * 100, 0, 100);
  const showNowLine = nowTick >= windowStartMs && nowTick <= windowEndMs;

  const minutesInWindow = windowDurationMs / (60 * 1000);
  const timelineWidthPx = Math.max(760, minutesInWindow * 3.2);

  if (sortedPrograms.length === 0) {
    return <div className="glass-card rounded-2xl p-4 text-sm text-slate-400 light:text-slate-700">Sin programación disponible.</div>;
  }

  return (
    <div className="min-w-0 space-y-3">
      <div className="glass-card overflow-x-auto rounded-2xl p-3">
        <div className="min-w-full" style={{ width: `max(100%, ${timelineWidthPx}px)` }}>
          <div className="mb-2 grid grid-cols-9 gap-2 px-1 text-[11px] text-slate-300 light:text-slate-700">
            {ticks.map((tick) => (
              <span className="text-center" key={tick.ms}>{formatHourLabel(tick.ms)}</span>
            ))}
          </div>

          <div className="relative h-28">
          {ticks.map((tick) => (
            <span
              className="absolute inset-y-0 w-px bg-white/8"
              key={`line-${tick.ms}`}
              style={{ left: `${tick.leftPct}%` }}
            />
          ))}

          {showNowLine ? (
            <span className="absolute inset-y-0 z-20 w-[2px] bg-cyan-300/90 shadow-[0_0_14px_rgba(56,189,248,0.55)]" style={{ left: `${nowLinePct}%` }} />
          ) : null}

          {segments.map((segment) => {
            const startPct = clamp(((segment.startMs - windowStartMs) / windowDurationMs) * 100, 0, 100);
            const endPct = clamp(((segment.stopMs - windowStartMs) / windowDurationMs) * 100, 0, 100);
            const widthPct = Math.max(endPct - startPct, 2.5);
            const program = segment.program;
            const isCurrent = Boolean(program && current?.id === program.id);

            return (
              <article
                className={`glass-timeline-card absolute top-2 h-20 overflow-hidden rounded-xl border px-2 py-1 ${
                  !program
                    ? "text-slate-400 light:text-slate-600"
                    : isCurrent
                      ? "border-cyan-300/70 bg-cyan-300/14 text-cyan-100 light:text-slate-900"
                      : "text-slate-100 light:text-slate-800"
                }`}
                key={segment.id}
                style={{ left: `${startPct}%`, width: `${widthPct}%` }}
              >
                {program ? (
                  <>
                    <p className="line-clamp-2 text-[12px] font-semibold leading-4">{program.title}</p>
                    <p className="mt-1 text-[11px] text-slate-300 light:text-slate-700">{formatProgramTime(program.startMs)} - {formatProgramTime(program.stopMs)}</p>
                  </>
                ) : (
                  <p className="pt-5 text-center text-[11px] text-slate-500 light:text-slate-600">Sin emisión</p>
                )}
                {program && isCurrent ? (
                  <div className="mt-2 h-1.5 rounded-full bg-white/12">
                    <div className="h-full rounded-full bg-cyan-300" style={{ width: `${Math.round(getProgramProgress(program, nowTick) * 100)}%` }} />
                  </div>
                ) : null}
              </article>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
}
