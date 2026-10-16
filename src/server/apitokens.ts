import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import type { CurrentUser } from "./auth";
import type { Role } from "@/lib/types";

const PREFIX = "tb_";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A new random token. Only its hash is stored; the plain value is shown once. */
export function generateToken(): { token: string; prefix: string; hash: string } {
  const token = PREFIX + randomBytes(32).toString("base64url");
  return { token, prefix: token.slice(0, 10), hash: hashToken(token) };
}

/** Resolve "Authorization: Bearer tb_..." to an active user. */
export async function userFromToken(header: string | null): Promise<CurrentUser | null> {
  const m = /^Bearer\s+(tb_[A-Za-z0-9_-]{20,})$/.exec(header?.trim() ?? "");
  if (!m) return null;
  const row = await db.apiToken.findUnique({ where: { tokenHash: hashToken(m[1]) }, include: { user: true } });
  if (!row || row.revokedAt || !row.user.active) return null;
  // Throttle writes: update "last used" at most once a minute.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await db.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  }
  const u = row.user;
  return { id: u.id, name: u.name, email: u.email, color: u.color, role: u.role as Role };
}
