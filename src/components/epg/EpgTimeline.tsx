import { useEffect, useMemo, useState } from "react";
import { splitProgramsAroundNow } from "@/lib/epg/epgUtils";
import { EpgProgramCard } from "@/components/epg/EpgProgramCard";
import type { EpgProgram } from "@/types/epg";

export function EpgTimeline({ programs, offset }: { programs: EpgProgram[]; offset: number }) {
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const nowMs = nowTick + offset * 60 * 60 * 1000;
  const view = useMemo(() => splitProgramsAroundNow(programs, nowMs), [nowMs, programs]);

  const cards = [...view.previous.slice(-2), ...(view.current ? [view.current] : []), ...view.next.slice(0, 3)];
  if (cards.length === 0) {
    return <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">Sin programación disponible.</div>;
  }

  return (
    <div className="grid gap-2 md:grid-cols-3">
      {cards.map((program) => (
        <EpgProgramCard isCurrent={view.current?.id === program.id} key={program.id} program={program} />
      ))}
    </div>
  );
}
