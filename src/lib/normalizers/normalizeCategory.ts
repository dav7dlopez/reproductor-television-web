import { normalizeText } from "@/lib/normalizers/normalizeText";

const CATEGORY_PATTERNS: Array<{ name: string; patterns: RegExp[] }> = [
  { name: "Deportes", patterns: [/\b(sport|sports|deporte|deportes|futbol|football|soccer|tennis|basket|formula|motor)\b/i] },
  { name: "Noticias", patterns: [/\b(news|noticias|informativo|actualidad|cnn|24h)\b/i] },
  { name: "Cine", patterns: [/\b(movie|movies|cine|peliculas|pelis|cinema|film)\b/i] },
  { name: "Series", patterns: [/\b(series|show|shows|entertainment)\b/i] },
  { name: "Infantiles", patterns: [/\b(kids|infantil|infantiles|children|cartoon|dibujos)\b/i] },
  { name: "Documentales", patterns: [/\b(documentary|documentales|documental|docs|nature|historia)\b/i] },
  { name: "Música", patterns: [/\b(music|musica|música|radio|hits)\b/i] },
  { name: "General", patterns: [/\b(general|tv|television|entretenimiento|nacional)\b/i] },
];

export function normalizeCategory(...candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (!normalized) {
      continue;
    }

    for (const category of CATEGORY_PATTERNS) {
      if (category.patterns.some((pattern) => pattern.test(normalized))) {
        return category.name;
      }
    }
  }

  return "General";
}
