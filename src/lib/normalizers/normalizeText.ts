export function normalizeText(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function stableCompareText(a: string, b: string): number {
  return normalizeText(a).localeCompare(normalizeText(b), "es", { sensitivity: "base" });
}
