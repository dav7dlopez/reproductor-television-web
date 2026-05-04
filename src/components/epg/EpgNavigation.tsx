import { ChevronLeft, ChevronRight } from "lucide-react";

export function EpgNavigation({ onPrevious, onNow, onNext }: { onPrevious: () => void; onNow: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button className="rounded-xl border border-white/10 bg-white/10 p-2" onClick={onPrevious} type="button"><ChevronLeft size={15} /></button>
      <button className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs" onClick={onNow} type="button">Ahora</button>
      <button className="rounded-xl border border-white/10 bg-white/10 p-2" onClick={onNext} type="button"><ChevronRight size={15} /></button>
    </div>
  );
}
