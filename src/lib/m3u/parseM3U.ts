import { normalizeCategory } from "@/lib/normalizers/normalizeCategory";
import { normalizeCountry } from "@/lib/normalizers/normalizeCountry";
import { normalizeText } from "@/lib/normalizers/normalizeText";
import type { IPTVChannel } from "@/types/channel";

interface PendingExtInf {
  attributes: Record<string, string>;
  displayName: string;
  raw: string;
}

const ATTRIBUTE_PATTERN = /([\w-]+)="([^"]*)"/g;

export function parseM3U(content: string): IPTVChannel[] {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.some((line) => line.toUpperCase().startsWith("#EXTM3U")) && !lines.some((line) => line.toUpperCase().startsWith("#EXTINF"))) {
    throw new Error("El archivo no parece una playlist M3U válida.");
  }

  const channels: IPTVChannel[] = [];
  let pendingExtInf: PendingExtInf | undefined;

  for (const line of lines) {
    if (line.toUpperCase().startsWith("#EXTINF")) {
      pendingExtInf = parseExtInf(line);
      continue;
    }

    if (line.startsWith("#")) {
      continue;
    }

    if (pendingExtInf && isPotentialStreamUrl(line)) {
      channels.push(createChannel(pendingExtInf, line, channels.length));
      pendingExtInf = undefined;
    }
  }

  if (channels.length === 0) {
    throw new Error("No se encontraron canales reproducibles en la playlist.");
  }

  return channels;
}

export function detectM3UEpgUrls(content: string): string[] {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const extm3uLine = lines.find((line) => line.toUpperCase().startsWith("#EXTM3U"));
  if (!extm3uLine) {
    return [];
  }

  const urls = new Set<string>();
  const attrPattern = /\b(?:x-tvg-url|url-tvg|tvg-url)\s*=\s*"([^"]+)"/gi;
  let match: RegExpExecArray | null;
  while ((match = attrPattern.exec(extm3uLine)) !== null) {
    for (const item of splitMultiUrls(match[1])) {
      urls.add(item);
    }
  }

  const loosePattern = /\b(?:x-tvg-url|url-tvg|tvg-url)\s*=\s*([^\s]+)/gi;
  while ((match = loosePattern.exec(extm3uLine)) !== null) {
    for (const item of splitMultiUrls(match[1].replace(/^['"]|['"]$/g, ""))) {
      urls.add(item);
    }
  }

  return Array.from(urls);
}

function parseExtInf(line: string): PendingExtInf {
  const attributes: Record<string, string> = {};
  const attributePart = line.includes(",") ? line.slice(0, line.lastIndexOf(",")) : line;
  let match: RegExpExecArray | null;

  while ((match = ATTRIBUTE_PATTERN.exec(attributePart)) !== null) {
    attributes[match[1].toLowerCase()] = decodeEntities(match[2].trim());
  }

  const commaIndex = line.lastIndexOf(",");
  const displayName = commaIndex >= 0 ? decodeEntities(line.slice(commaIndex + 1).trim()) : attributes["tvg-name"] || "Canal sin nombre";

  return {
    attributes,
    displayName: displayName || attributes["tvg-name"] || "Canal sin nombre",
    raw: line,
  };
}

function createChannel(extInf: PendingExtInf, streamUrl: string, sourceIndex: number): IPTVChannel {
  const tvgId = extInf.attributes["tvg-id"];
  const tvgName = extInf.attributes["tvg-name"];
  const tvgLogo = extInf.attributes["tvg-logo"];
  const groupTitle = extInf.attributes["group-title"];
  const name = extInf.displayName || tvgName || `Canal ${sourceIndex + 1}`;
  const country = normalizeCountry(groupTitle, tvgName, name);
  const category = normalizeCategory(groupTitle, tvgName, name);

  return {
    id: createChannelId(tvgId, tvgName, name, streamUrl, sourceIndex),
    name,
    normalizedName: normalizeText(name),
    tvgId: tvgId || undefined,
    tvgName: tvgName || undefined,
    tvgLogo: tvgLogo || undefined,
    logo: tvgLogo || undefined,
    groupTitle: groupTitle || undefined,
    streamUrl,
    country: country.name,
    countryCode: country.code,
    category,
    searchIndex: normalizeText([name, tvgName, tvgId, groupTitle, category, country.name].filter(Boolean).join(" ")),
    sourceIndex,
    sourceType: "m3u",
  };
}

function isPotentialStreamUrl(line: string): boolean {
  return /^(https?:\/\/|rtmp:\/\/|rtsp:\/\/|udp:\/\/|\/)/i.test(line);
}

function createChannelId(...parts: Array<string | number | undefined>): string {
  const raw = parts.filter(Boolean).join("|");
  let hash = 0;

  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash << 5) - hash + raw.charCodeAt(index);
    hash |= 0;
  }

  return `channel-${Math.abs(hash)}`;
}

function decodeEntities(value: string): string {
  if (typeof document === "undefined") {
    return value
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }

  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function splitMultiUrls(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => /^https?:\/\//i.test(item));
}
