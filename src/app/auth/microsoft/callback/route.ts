import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { db } from "@/server/db";
import { setSessionCookie } from "@/server/session";
import { audit } from "@/server/audit";
import { appUrl } from "@/server/email";
import { decideSsoLogin, emailFromClaims, issuerFor, jwksFor, readSsoConfig, tokenUrlFor } from "@/lib/sso";

const COOKIE = "tb_sso";
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function fail(request: Request, code: string) {
  return Response.redirect(new URL(`/login?error=${code}`, request.url));
}

/** Finish Microsoft sign-in: check state, exchange the code, verify the ID token, then sign in or refuse. */
export async function GET(request: Request) {
  const config = readSsoConfig(process.env);
  if (!config) return fail(request, "sso_off");
  const url = new URL(request.url);
  const jar = await cookies();
  const saved = (() => {
    try {
      return JSON.parse(jar.get(COOKIE)?.value ?? "") as { state: string; nonce: string; verifier: string; next: string };
    } catch {
      return null;
    }
  })();
  jar.delete({ name: COOKIE, path: "/auth/microsoft" });
  if (url.searchParams.get("error")) return fail(request, "sso_cancelled");
  const code = url.searchParams.get("code");
  if (!saved || !code || url.searchParams.get("state") !== saved.state) return fail(request, "sso_failed");

  const redirectUri = `${appUrl().replace(/\/+$/, "")}/auth/microsoft/callback`;
  const tokenRes = await fetch(tokenUrlFor(config.tenantId), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: saved.verifier }),
  }).catch(() => null);
  const tokens = tokenRes?.ok ? ((await tokenRes.json()) as { id_token?: string }) : null;
  if (!tokens?.id_token) return fail(request, "sso_failed");

  let claims: Record<string, unknown>;
  try {
    let jwks = jwksCache.get(config.tenantId);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(jwksFor(config.tenantId)));
      jwksCache.set(config.tenantId, jwks);
    }
    const verified = await jwtVerify(tokens.id_token, jwks, { issuer: issuerFor(config.tenantId), audience: config.clientId });
    claims = verified.payload as Record<string, unknown>;
  } catch {
    return fail(request, "sso_failed");
  }
  if (claims.nonce !== saved.nonce || claims.tid !== config.tenantId) return fail(request, "sso_failed");

  const email = emailFromClaims(claims);
  const existing = email ? await db.user.findUnique({ where: { email } }) : null;
  const decision = decideSsoLogin({ email, name: typeof claims.name === "string" ? claims.name : null }, existing, config);
  if (decision.action === "deny") {
    await audit(existing?.id ?? null, "auth.ssoDenied", "User", existing?.id ?? null, { email, reason: decision.reason });
    return fail(request, decision.reason === "INACTIVE" ? "sso_inactive" : "sso_denied");
  }
  let userId: string;
  if (decision.action === "create") {
    const org = await db.organization.upsert({ where: { name: config.organization }, create: { name: config.organization, internal: true }, update: {} });
    const user = await db.user.create({
      // No usable password: these people always sign in with Microsoft.
      data: { email: decision.email, name: decision.name, role: "MEMBER", organizationId: org.id, authProvider: "MICROSOFT", passwordHash: await bcrypt.hash(randomBytes(24).toString("hex"), 10) },
    });
    userId = user.id;
    await audit(user.id, "auth.ssoUserCreated", "User", user.id, { email: decision.email });
  } else {
    userId = decision.userId;
    await db.user.update({ where: { id: userId }, data: { authProvider: "MICROSOFT" } });
  }
  await setSessionCookie(userId);
  await audit(userId, "auth.login", "User", userId, { via: "microsoft" });
  return Response.redirect(new URL(saved.next || "/", request.url));
}
