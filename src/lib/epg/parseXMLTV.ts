import { normalizeText } from "@/lib/normalizers/normalizeText";
import { parseXmltvDate } from "@/lib/epg/epgUtils";
import type { EpgChannel, EpgProgram } from "@/types/epg";

export interface ParsedXmltvResult {
  channels: EpgChannel[];
  programs: EpgProgram[];
}

export function parseXMLTV(xml: string): ParsedXmltvResult {
  if (typeof DOMParser === "undefined") {
    throw new Error("XMLTV parsing no disponible en este entorno.");
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("El XMLTV no tiene un formato válido.");
  }

  const channels = Array.from(doc.querySelectorAll("channel")).map((node): EpgChannel | undefined => {
    const id = node.getAttribute("id")?.trim();
    if (!id) {
      return undefined;
    }
    const displayNames = Array.from(node.querySelectorAll("display-name"))
      .map((nameNode) => nameNode.textContent?.trim())
      .filter((value): value is string => Boolean(value));
    const icon = node.querySelector("icon")?.getAttribute("src")?.trim() || undefined;
    const normalizedNames = displayNames.map((value) => normalizeText(value));

    const channel: EpgChannel = {
      id,
      displayNames,
      normalizedNames,
    };
    if (icon) {
      channel.icon = icon;
    }
    return channel;
  }).filter((item): item is EpgChannel => Boolean(item));

  const programs = Array.from(doc.querySelectorAll("programme")).map((node, index): EpgProgram | undefined => {
    const channelId = node.getAttribute("channel")?.trim();
    const startRaw = node.getAttribute("start")?.trim();
    const stopRaw = node.getAttribute("stop")?.trim();
    if (!channelId || !startRaw || !stopRaw) {
      return undefined;
    }

    const startMs = parseXmltvDate(startRaw);
    const stopMs = parseXmltvDate(stopRaw);
    if (!Number.isFinite(startMs) || !Number.isFinite(stopMs) || stopMs <= startMs) {
      return undefined;
    }

    const title = node.querySelector("title")?.textContent?.trim() || "Sin título";
    const description = node.querySelector("desc")?.textContent?.trim() || undefined;
    const category = node.querySelector("category")?.textContent?.trim() || undefined;

    const program: EpgProgram = {
      id: `${channelId}:${startMs}:${index}`,
      channelId,
      title,
      start: startRaw,
      stop: stopRaw,
      startMs,
      stopMs,
    };
    if (description) {
      program.description = description;
    }
    if (category) {
      program.category = category;
    }
    return program;
  }).filter((item): item is EpgProgram => Boolean(item));

  return { channels, programs };
}
