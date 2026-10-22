import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { readSsoConfig, authorizeUrl } from "@/lib/sso";
import { appUrl } from "@/server/email";

const COOKIE = "tb_sso";

/** Start Microsoft sign-in: remember state, nonce and PKCE verifier in a short-lived cookie, then redirect. */
export async function GET(request: Request) {
  const config = readSsoConfig(process.env);
  if (!config) return Response.redirect(new URL("/login?error=sso_off", request.url));
  const next = new URL(request.url).searchParams.get("next") ?? "/";
  const state = randomBytes(16).toString("base64url");
  const nonce = randomBytes(16).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  (await cookies()).set(COOKIE, JSON.stringify({ state, nonce, verifier, next: next.startsWith("/") && !next.startsWith("//") ? next : "/" }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/auth/microsoft",
    maxAge: 600,
  });
  const redirectUri = `${appUrl().replace(/\/+$/, "")}/auth/microsoft/callback`;
  return Response.redirect(authorizeUrl(config, { redirectUri, state, nonce, codeChallenge: challenge }));
}
