import { extname } from "node:path";
import { Readable } from "node:stream";
import { openSessionFile } from "@/lib/transmux/sessionManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await context.params;
  const stream = openSessionFile(id, file);

  if (!stream) {
    return Response.json({ error: "Transmux file not found" }, { status: 404 });
  }

  const headers = new Headers();
  headers.set("cache-control", "no-store");
  headers.set("access-control-allow-origin", "*");
  headers.set("content-type", getContentType(file));

  return new Response(Readable.toWeb(stream) as ReadableStream, { status: 200, headers });
}

function getContentType(file: string): string {
  const ext = extname(file).toLowerCase();
  if (ext === ".m3u8") return "application/vnd.apple.mpegurl";
  if (ext === ".ts") return "video/mp2t";
  return "application/octet-stream";
}
