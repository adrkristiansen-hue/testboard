import "server-only";
import { db } from "./db";

/** Append-only audit trail for admin-relevant actions (configuration, users, auth, tokens). */
export async function audit(actorId: string | null, action: string, entityType: string, entityId?: string | null, details?: unknown) {
  await db.auditLog.create({
    data: {
      actorId,
      action,
      entityType,
      entityId: entityId ?? null,
      details: details === undefined ? null : typeof details === "string" ? details : JSON.stringify(details),
    },
  });
}
