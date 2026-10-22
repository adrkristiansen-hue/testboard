// Microsoft Entra ID (Azure AD) sign-in: configuration and the decision who may sign in (pure, unit-tested).

export interface SsoConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** E-mail domains that may get an account automatically, e.g. ["sariba.no", "sariba.se"] */
  allowedDomains: string[];
  /** Create accounts for allowed domains on first sign-in */
  autoCreate: boolean;
  /** Organisation for automatically created accounts */
  organization: string;
}

export function readSsoConfig(env: Record<string, string | undefined>): SsoConfig | null {
  const tenantId = env.MS_ENTRA_TENANT_ID?.trim();
  // A specific tenant is required: "common"/"organizations" would let any Microsoft account in.
  if (tenantId && ["common", "organizations", "consumers"].includes(tenantId.toLowerCase())) return null;
  const clientId = env.MS_ENTRA_CLIENT_ID?.trim();
  const clientSecret = env.MS_ENTRA_CLIENT_SECRET?.trim();
  if (!tenantId || !clientId || !clientSecret) return null;
  return {
    tenantId,
    clientId,
    clientSecret,
    allowedDomains: (env.MS_ENTRA_ALLOWED_DOMAINS ?? "")
      .split(",")
      .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean),
    autoCreate: env.MS_ENTRA_AUTO_CREATE !== "false",
    organization: env.MS_ENTRA_ORGANIZATION?.trim() || "Sariba",
  };
}

export function authorizeUrl(c: SsoConfig, p: { redirectUri: string; state: string; nonce: string; codeChallenge: string }): string {
  const q = new URLSearchParams({
    client_id: c.clientId,
    response_type: "code",
    redirect_uri: p.redirectUri,
    response_mode: "query",
    scope: "openid profile email",
    state: p.state,
    nonce: p.nonce,
    code_challenge: p.codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `https://login.microsoftonline.com/${encodeURIComponent(c.tenantId)}/oauth2/v2.0/authorize?${q}`;
}

export const issuerFor = (tenantId: string) => `https://login.microsoftonline.com/${tenantId}/v2.0`;
export const jwksFor = (tenantId: string) => `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
export const tokenUrlFor = (tenantId: string) => `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

/** The e-mail to match on: the `email` claim, else the sign-in name (UPN). */
export function emailFromClaims(claims: Record<string, unknown>): string | null {
  for (const k of ["email", "preferred_username", "upn"]) {
    const v = claims[k];
    if (typeof v === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return v.trim().toLowerCase();
  }
  return null;
}

export type SsoDecision =
  | { action: "login"; userId: string }
  | { action: "create"; email: string; name: string }
  | { action: "deny"; reason: "NO_EMAIL" | "INACTIVE" | "NOT_ALLOWED" };

/**
 * Who may sign in with Microsoft. Only e-mail domains you control (MS_ENTRA_ALLOWED_DOMAINS) are accepted,
 * so a guest account in the tenant can never take over a customer's password account with the same e-mail.
 * - an existing, active account from an allowed domain signs in;
 * - unknown people from an allowed domain get an account when auto-create is on;
 * - everyone else is refused (customers use their invite link and password).
 */
export function decideSsoLogin(claims: { email: string | null; name?: string | null }, existing: { id: string; active: boolean } | null, c: Pick<SsoConfig, "allowedDomains" | "autoCreate">): SsoDecision {
  if (!claims.email) return { action: "deny", reason: "NO_EMAIL" };
  const domain = claims.email.split("@")[1];
  if (!c.allowedDomains.includes(domain)) return { action: "deny", reason: "NOT_ALLOWED" };
  if (existing) return existing.active ? { action: "login", userId: existing.id } : { action: "deny", reason: "INACTIVE" };
  if (c.autoCreate) return { action: "create", email: claims.email, name: claims.name?.trim() || claims.email.split("@")[0] };
  return { action: "deny", reason: "NOT_ALLOWED" };
}
