"use server";

import { z } from "zod";
import { db } from "../db";
import { getCurrentUser, ForbiddenError } from "../auth";
import { run, type ActionResult } from "../result";
import { UserError } from "../workitems";
import { audit } from "../audit";
import { generateToken } from "../apitokens";

async function me() {
  const user = await getCurrentUser();
  if (!user) throw new ForbiddenError("Not signed in.");
  return user;
}

/** Tokens act as the user who created them, with that user's role. */
export async function createApiToken(name: string): Promise<ActionResult<{ token: string }>> {
  return run(async () => {
    const user = await me();
    const n = z.string().trim().min(1).max(80).parse(name);
    const active = await db.apiToken.count({ where: { userId: user.id, revokedAt: null } });
    if (active >= 20) throw new UserError("You already have 20 active tokens. Revoke one first.");
    const t = generateToken();
    const row = await db.apiToken.create({ data: { userId: user.id, name: n, tokenHash: t.hash, prefix: t.prefix } });
    await audit(user.id, "token.create", "ApiToken", row.id, { name: n, prefix: t.prefix });
    return { token: t.token };
  });
}

export async function revokeApiToken(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await me();
    const row = await db.apiToken.findUnique({ where: { id } });
    if (!row) throw new UserError("Token not found.");
    if (row.userId !== user.id && user.role !== "ADMIN") throw new ForbiddenError("You can only revoke your own tokens.");
    if (!row.revokedAt) await db.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
    await audit(user.id, "token.revoke", "ApiToken", id, { name: row.name, prefix: row.prefix, owner: row.userId });
    return undefined;
  });
}
