import { formatProgramTime, getProgramProgress } from "@/lib/epg/epgUtils";
import type { EpgProgram } from "@/types/epg";

export function EpgProgramCard({ program, isCurrent }: { program: EpgProgram; isCurrent?: boolean }) {
  const progress = isCurrent ? Math.round(getProgramProgress(program) * 100) : 0;

  return (
    <article className={`rounded-xl border p-3 ${isCurrent ? "border-amber-300/50 bg-amber-400/12" : "border-white/10 bg-white/[0.03]"}`}>
      <p className="text-xs text-slate-400">{formatProgramTime(program.startMs)} - {formatProgramTime(program.stopMs)}</p>
      <h4 className={`mt-1 text-sm font-semibold ${isCurrent ? "text-amber-200" : "text-slate-200"}`}>{program.title}</h4>
      {program.category ? <p className="text-xs text-slate-400">{program.category}</p> : null}
      {isCurrent ? (
        <div className="mt-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-amber-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-amber-200">{progress}%</p>
        </div>
      ) : null}
    </article>
  );
}
