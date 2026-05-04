import { normalizeText } from "@/lib/normalizers/normalizeText";

export interface NormalizedCountry {
  name: string;
  code?: string;
  confidence: "high" | "medium" | "low";
}

const OTHER_COUNTRY: NormalizedCountry = {
  name: "Otros",
  confidence: "low",
};

const COUNTRY_PATTERNS: Array<{ name: string; code: string; patterns: RegExp[] }> = [
  {
    name: "España",
    code: "ES",
    patterns: [
      /(^|\b)(espana|españa|spain|spanish|esp|es)(\b|$)/i,
      /(^|\b)(espana|spain|es|esp)\s*(tv|television|deportes|movies|cine|news|noticias)?(\b|$)/i,
    ],
  },
  { name: "Portugal", code: "PT", patterns: [/(^|\b)(portugal|portuguese|pt)(\b|$)/i] },
  { name: "Francia", code: "FR", patterns: [/(^|\b)(france|francia|french|fr)(\b|$)/i] },
  { name: "Italia", code: "IT", patterns: [/(^|\b)(italy|italia|italian|it)(\b|$)/i] },
  { name: "Reino Unido", code: "UK", patterns: [/(^|\b)(uk|united kingdom|reino unido|british|england)(\b|$)/i] },
  { name: "Estados Unidos", code: "US", patterns: [/(^|\b)(usa|us|united states|estados unidos|american)(\b|$)/i] },
  { name: "Alemania", code: "DE", patterns: [/(^|\b)(germany|alemania|deutschland|german|de)(\b|$)/i] },
  { name: "Internacional", code: "INT", patterns: [/(^|\b)(international|internacional|latino|latin|world)(\b|$)/i] },
];

export function normalizeCountry(...candidates: Array<string | undefined>): NormalizedCountry {
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (!normalized) {
      continue;
    }

    for (const country of COUNTRY_PATTERNS) {
      if (country.patterns.some((pattern) => pattern.test(normalized))) {
        return { name: country.name, code: country.code, confidence: "high" };
      }
    }
  }

  return OTHER_COUNTRY;
}
