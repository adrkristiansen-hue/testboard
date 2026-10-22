import { describe, expect, it } from "vitest";
import { authorizeUrl, decideSsoLogin, emailFromClaims, readSsoConfig } from "@/lib/sso";

const env = { MS_ENTRA_TENANT_ID: "tid", MS_ENTRA_CLIENT_ID: "cid", MS_ENTRA_CLIENT_SECRET: "s", MS_ENTRA_ALLOWED_DOMAINS: "Sariba.no, @sariba.se" };

describe("SSO config", () => {
  it("is off without tenant, client and secret, or with a multi-tenant id", () => {
    expect(readSsoConfig({})).toBeNull();
    expect(readSsoConfig({ ...env, MS_ENTRA_TENANT_ID: "common" })).toBeNull();
    expect(readSsoConfig(env)).toMatchObject({ allowedDomains: ["sariba.no", "sariba.se"], autoCreate: true, organization: "Sariba" });
  });
  it("builds an authorize URL with PKCE and the tenant", () => {
    const u = new URL(authorizeUrl(readSsoConfig(env)!, { redirectUri: "https://tb/cb", state: "st", nonce: "no", codeChallenge: "ch" }));
    expect(u.pathname).toBe("/tid/oauth2/v2.0/authorize");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ client_id: "cid", code_challenge: "ch", code_challenge_method: "S256", state: "st", nonce: "no", scope: "openid profile email" });
  });
});

describe("decideSsoLogin", () => {
  const c = { allowedDomains: ["sariba.no"], autoCreate: true };
  it("signs in existing active accounts from allowed domains", () => {
    expect(decideSsoLogin({ email: "erik@sariba.no" }, { id: "u1", active: true }, c)).toEqual({ action: "login", userId: "u1" });
    expect(decideSsoLogin({ email: "erik@sariba.no" }, { id: "u1", active: false }, c)).toEqual({ action: "deny", reason: "INACTIVE" });
  });
  it("creates accounts for new people from allowed domains only when auto-create is on", () => {
    expect(decideSsoLogin({ email: "ny@sariba.no", name: "Ny Person" }, null, c)).toEqual({ action: "create", email: "ny@sariba.no", name: "Ny Person" });
    expect(decideSsoLogin({ email: "ny@sariba.no" }, null, { ...c, autoCreate: false }).action).toBe("deny");
  });
  it("never lets other domains in, not even onto existing accounts", () => {
    expect(decideSsoLogin({ email: "maja@kunde.no" }, { id: "u2", active: true }, c)).toEqual({ action: "deny", reason: "NOT_ALLOWED" });
    expect(decideSsoLogin({ email: null }, null, c)).toEqual({ action: "deny", reason: "NO_EMAIL" });
  });
  it("reads the e-mail from email, preferred_username or upn", () => {
    expect(emailFromClaims({ preferred_username: "Erik@Sariba.no" })).toBe("erik@sariba.no");
    expect(emailFromClaims({ email: "not-an-email", upn: "x@sariba.no" })).toBe("x@sariba.no");
    expect(emailFromClaims({})).toBeNull();
  });
});
