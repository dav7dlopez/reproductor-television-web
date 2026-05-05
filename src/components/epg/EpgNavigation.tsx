import { ChevronLeft, ChevronRight } from "lucide-react";

interface EpgNavigationProps {
  onPrevious: () => void;
  onNow: () => void;
  onNext: () => void;
  selectedDate: string;
  onDateChange: (date: string) => void;
}

export function EpgNavigation({ onPrevious, onNow, onNext, selectedDate, onDateChange }: EpgNavigationProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-slate-100" onClick={onPrevious} type="button">
        <ChevronLeft size={15} />
        Anterior
      </button>
      <button className="rounded-xl border border-amber-300/40 bg-amber-300/20 px-3 py-2 text-xs font-semibold text-amber-100" onClick={onNow} type="button">
        Ahora
      </button>
      <button className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-slate-100" onClick={onNext} type="button">
        Siguiente
        <ChevronRight size={15} />
      </button>
      <label className="ml-auto inline-flex items-center rounded-xl border border-white/10 bg-white/10 px-2 py-1 text-xs text-slate-200">
        <span className="sr-only">Fecha EPG</span>
        <input
          className="bg-transparent text-xs text-slate-100 outline-none [color-scheme:dark]"
          onChange={(event) => onDateChange(event.target.value)}
          type="date"
          value={selectedDate}
        />
      </label>
    </div>
  );
}
