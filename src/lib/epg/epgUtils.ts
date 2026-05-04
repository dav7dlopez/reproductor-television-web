import type { EpgProgram } from "@/types/epg";

export function parseXmltvDate(raw: string): number {
  const normalized = raw.trim();
  const match = /^(\d{14})(?:\s*([+-]\d{4}))?/.exec(normalized);
  if (!match) {
    return Number.NaN;
  }

  const datePart = match[1];
  const year = Number(datePart.slice(0, 4));
  const month = Number(datePart.slice(4, 6));
  const day = Number(datePart.slice(6, 8));
  const hour = Number(datePart.slice(8, 10));
  const minute = Number(datePart.slice(10, 12));
  const second = Number(datePart.slice(12, 14));

  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetRaw = match[2];
  if (!offsetRaw) {
    return utcMs;
  }

  const sign = offsetRaw.startsWith("-") ? -1 : 1;
  const offsetHours = Number(offsetRaw.slice(1, 3));
  const offsetMinutes = Number(offsetRaw.slice(3, 5));
  const offsetMs = sign * (offsetHours * 60 + offsetMinutes) * 60 * 1000;
  return utcMs - offsetMs;
}

export function sortProgramsByDate(programs: EpgProgram[]): EpgProgram[] {
  return [...programs].sort((a, b) => a.startMs - b.startMs || a.stopMs - b.stopMs);
}

export function getCurrentProgram(programs: EpgProgram[], nowMs = Date.now()): EpgProgram | undefined {
  return programs.find((program) => nowMs >= program.startMs && nowMs < program.stopMs);
}

export function getProgramProgress(program: EpgProgram, nowMs = Date.now()): number {
  const total = program.stopMs - program.startMs;
  if (total <= 0) {
    return 0;
  }
  const elapsed = nowMs - program.startMs;
  return Math.max(0, Math.min(1, elapsed / total));
}

export function formatProgramTime(timestampMs: number, locale = "es-ES"): string {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(timestampMs));
}

export function splitProgramsAroundNow(programs: EpgProgram[], nowMs = Date.now()) {
  const sorted = sortProgramsByDate(programs);
  const previous = sorted.filter((program) => program.stopMs <= nowMs);
  const current = sorted.find((program) => nowMs >= program.startMs && nowMs < program.stopMs);
  const next = sorted.filter((program) => program.startMs > nowMs);

  return {
    previous: previous.slice(-8),
    current,
    next: next.slice(0, 12),
  };
}

export function getProgramsForDay(programs: EpgProgram[], date: Date): EpgProgram[] {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return programs.filter((program) => program.stopMs > start.getTime() && program.startMs < end.getTime());
}
