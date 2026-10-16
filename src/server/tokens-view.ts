import "server-only";
import { db } from "./db";

export interface TokenView {
  id: string;
  name: string;
  prefix: string;
  owner: string;
  createdAt: string;
  lastUsedAt: string | null;
  revoked: boolean;
}

export async function loadTokens(userId?: string): Promise<TokenView[]> {
  const rows = await db.apiToken.findMany({ where: userId ? { userId } : {}, include: { user: { select: { name: true } } }, orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }] });
  return rows.map((r) => ({ id: r.id, name: r.name, prefix: r.prefix, owner: r.user.name, createdAt: r.createdAt.toISOString(), lastUsedAt: r.lastUsedAt?.toISOString() ?? null, revoked: !!r.revokedAt }));
}
