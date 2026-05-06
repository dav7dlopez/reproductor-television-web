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
      <button className="glass-button inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-slate-100 light:text-slate-800" onClick={onPrevious} type="button">
        <ChevronLeft size={15} />
        Anterior
      </button>
      <button className="glass-button-primary rounded-xl px-3 py-2 text-xs font-semibold" onClick={onNow} type="button">
        Ahora
      </button>
      <button className="glass-button inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-slate-100 light:text-slate-800" onClick={onNext} type="button">
        Siguiente
        <ChevronRight size={15} />
      </button>
      <label className="glass-surface ml-auto inline-flex items-center rounded-xl px-2 py-1 text-xs text-slate-200 light:text-slate-800">
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
