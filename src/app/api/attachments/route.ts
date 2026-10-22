import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { getStorage, MAX_UPLOAD_BYTES } from "@/server/storage";
import { canEdit } from "@/lib/types";
import { accessFor, can, canSeeItem } from "@/server/access";

/** Upload a file (multipart: file, workItemId). Returns { id, url, fileName, mimeType, size }. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canEdit(user.role)) return NextResponse.json({ error: "Read-only users cannot upload" }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  const workItemId = Number(form.get("workItemId"));
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!Number.isInteger(workItemId)) return NextResponse.json({ error: "workItemId required" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: `File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)` }, { status: 413 });
  const item = await db.workItem.findUnique({ where: { id: workItemId }, select: { id: true, projectId: true, moduleId: true, createdById: true } });
  const access = item ? await accessFor(user, item.projectId) : null;
  if (!item || !access || !canSeeItem(access, item)) return NextResponse.json({ error: "Work item not found" }, { status: 404 });
  // Attach to the item (edit rights) or paste into a comment (comment rights).
  const allowed = can(access, "items.edit") || can(access, "comments.add") || (item.createdById === user.id && can(access, "items.editOwn"));
  if (!allowed) return NextResponse.json({ error: "Your role in this project does not allow uploads" }, { status: 403 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = (file.name || "pasted-image.png").replace(/[\\/\r\n"]/g, "_").slice(0, 200);
  const storageKey = await getStorage().put(buffer, fileName);
  const att = await db.attachment.create({
    data: { workItemId, fileName, mimeType: file.type || "application/octet-stream", size: file.size, storageKey, uploadedById: user.id },
  });
  return NextResponse.json({ id: att.id, url: `/api/attachments/${att.id}`, fileName: att.fileName, mimeType: att.mimeType, size: att.size });
}
