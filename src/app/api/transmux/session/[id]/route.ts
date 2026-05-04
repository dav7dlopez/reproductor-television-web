import { getSessionDebugInfo, listSessionFiles, stopSession } from "@/lib/transmux/sessionManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const debug = getSessionDebugInfo(id);
  const files = listSessionFiles(id);
  return Response.json({ id, debug, files });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const stopped = stopSession(id);
  return Response.json({ stopped });
}
