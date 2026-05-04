import { useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { EpgNavigation } from "@/components/epg/EpgNavigation";
import { EpgTimeline } from "@/components/epg/EpgTimeline";
import { getCurrentProgram } from "@/lib/epg/epgUtils";
import { getEpgProgramsForIptvChannel, useEpgStore } from "@/store/useEpgStore";
import type { IPTVChannel } from "@/types/channel";

export function EpgPanel({ channel }: { channel?: IPTVChannel }) {
  const [offsetHours, setOffsetHours] = useState(0);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const status = useEpgStore((state) => state.status);
  const error = useEpgStore((state) => state.error);
  const source = useEpgStore((state) => state.source);
  const epgChannels = useEpgStore((state) => state.channels);
  const epgPrograms = useEpgStore((state) => state.programs);
  const programsByChannelId = useEpgStore((state) => state.programsByChannelId);
  const matchesByChannelId = useEpgStore((state) => state.matchesByChannelId);

  const programs = useMemo(() => {
    if (!channel) {
      return [];
    }
    return getEpgProgramsForIptvChannel(channel.id, programsByChannelId, matchesByChannelId);
  }, [channel, matchesByChannelId, programsByChannelId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const current = getCurrentProgram(programs, nowTick + offsetHours * 60 * 60 * 1000);
  const currentMatch = channel ? matchesByChannelId[channel.id] : undefined;
  const matchedCount = Object.values(matchesByChannelId).filter((match) => match.method !== "none").length;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sky-100">
          <CalendarClock size={18} />
          <h3 className="font-semibold">EPG</h3>
        </div>
        <EpgNavigation onNext={() => setOffsetHours((value) => value + 2)} onNow={() => setOffsetHours(0)} onPrevious={() => setOffsetHours((value) => value - 2)} />
      </div>
      {!channel ? <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">Selecciona un canal para ver su EPG.</div> : null}
      {channel && status === "loading" ? <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">Cargando EPG...</div> : null}
      {channel && status === "error" ? <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div> : null}
      {channel && status !== "loading" && status !== "error" ? <EpgTimeline offset={offsetHours} programs={programs} /> : null}
      {current ? <p className="mt-2 text-xs text-amber-200">Actual: {current.title}</p> : null}
      {process.env.NODE_ENV === "development" ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-2 text-[11px] text-slate-300">
          <p>EPG URL: {source?.maskedUrl ?? "no configurada"}</p>
          <p>Estado: {status}</p>
          <p>Canales EPG: {epgChannels.length}</p>
          <p>Programas EPG: {epgPrograms.length}</p>
          <p>Matches: {matchedCount} / {Object.keys(matchesByChannelId).length}</p>
          <p>Método match canal: {currentMatch?.method ?? "none"}</p>
        </div>
      ) : null}
    </section>
  );
}
