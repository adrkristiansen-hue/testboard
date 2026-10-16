import { getCurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { getStorage } from "@/server/storage";

// Types safe to show inline in the browser. Everything else (including SVG/HTML) is downloaded.
const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "text/plain"]);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const { id } = await params;
  const att = await db.attachment.findUnique({ where: { id } });
  if (!att) return new Response("Not found", { status: 404 });
  let data: Buffer;
  try {
    data = await getStorage().get(att.storageKey);
  } catch {
    return new Response("File missing from storage", { status: 410 });
  }
  const inline = INLINE_TYPES.has(att.mimeType);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": inline ? att.mimeType : "application/octet-stream",
      "Content-Length": String(data.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
