import { useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { EpgNavigation } from "@/components/epg/EpgNavigation";
import { EpgTimeline } from "@/components/epg/EpgTimeline";
import { getCurrentProgram } from "@/lib/epg/epgUtils";
import { getEpgProgramsForIptvChannel, useEpgStore } from "@/store/useEpgStore";
import type { IPTVChannel } from "@/types/channel";

export function EpgPanel({ channel }: { channel?: IPTVChannel }) {
  const [focusOffsetMinutes, setFocusOffsetMinutes] = useState(0);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [selectedDateText, setSelectedDateText] = useState(() => new Date().toISOString().slice(0, 10));
  const status = useEpgStore((state) => state.status);
  const error = useEpgStore((state) => state.error);
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

  const selectedDate = useMemo(() => {
    const [year, month, day] = selectedDateText.split("-").map(Number);
    if (!year || !month || !day) {
      return new Date();
    }
    return new Date(year, month - 1, day);
  }, [selectedDateText]);
  const focusBaseMs = useMemo(() => {
    const selected = new Date(selectedDate);
    const now = new Date(nowTick);
    selected.setHours(now.getHours(), now.getMinutes(), 0, 0);
    return selected.getTime();
  }, [nowTick, selectedDate]);
  const focusMs = focusBaseMs + focusOffsetMinutes * 60 * 1000;
  const current = getCurrentProgram(programs, focusMs);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sky-100">
          <CalendarClock size={18} />
          <h3 className="font-semibold">EPG</h3>
        </div>
        <EpgNavigation
          onDateChange={setSelectedDateText}
          onNext={() => setFocusOffsetMinutes((value) => value + 60)}
          onNow={() => {
            setFocusOffsetMinutes(0);
            setSelectedDateText(new Date().toISOString().slice(0, 10));
          }}
          onPrevious={() => setFocusOffsetMinutes((value) => value - 60)}
          selectedDate={selectedDateText}
        />
      </div>
      {!channel ? <div className="glass-card rounded-2xl p-4 text-sm text-slate-400 light:text-slate-700">Selecciona un canal para ver su EPG.</div> : null}
      {channel && status === "loading" ? <div className="glass-card rounded-2xl p-4 text-sm text-slate-400 light:text-slate-700">Cargando EPG...</div> : null}
      {channel && status === "error" ? <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div> : null}
      {channel && status !== "loading" && status !== "error" ? <EpgTimeline focusMs={focusMs} programs={programs} /> : null}
      {current ? <p className="mt-2 text-xs text-amber-200">Actual: {current.title}</p> : null}
    </section>
  );
}
