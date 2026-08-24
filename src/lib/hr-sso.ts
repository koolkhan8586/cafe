import crypto from "node:crypto";

/**
 * HR → Cafe SSO token.
 *
 * Must stay in sync with HR `App\Services\CafeSsoService`:
 *   base64url(json).base64url(hmac-sha256)
 *
 * Payload: { code, name, iat, exp, nonce }
 */
export const HR_SSO_MIN_SECRET = 16;

export type HrSsoPayload = {
  code: string;
  name: string;
  iat: number;
  exp: number;
  nonce: string;
};

export type HrSsoFail = "disabled" | "invalid" | "unknown" | "inactive";

export const HR_SSO_FAIL_MESSAGE: Record<HrSsoFail, string> = {
  disabled:
    "Cafe SSO is not configured. Sign in with your employee ID and PIN.",
  invalid:
    "That HR Cafe link expired or is invalid. Open Cafe from HR again, or sign in with your PIN.",
  unknown:
    "No Cafe account matches that employee code. Ask the cafe admin to add you.",
  inactive:
    "Your Cafe account is deactivated. Ask the cafe admin.",
};

export function hrSsoSecret(): string | null {
  const value = process.env.HR_SSO_SECRET;
  if (!value || value.length < HR_SSO_MIN_SECRET) return null;
  return value;
}

export function hrSsoConfigured(): boolean {
  return hrSsoSecret() !== null;
}

function signBody(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("base64url");
}

function timingSafeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function signHrSsoToken(
  payload: HrSsoPayload,
  secret: string,
): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signBody(body, secret)}`;
}

export function verifyHrSsoToken(
  token: string | null | undefined,
  secret: string | null = hrSsoSecret(),
  nowSeconds = Math.floor(Date.now() / 1000),
): HrSsoPayload | null {
  if (!secret || secret.length < HR_SSO_MIN_SECRET) return null;
  if (!token) return null;

  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!body || !signature) return null;
  if (!timingSafeEqual(signature, signBody(body, secret))) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const rec = parsed as Record<string, unknown>;

  const code =
    typeof rec.code === "string" ? rec.code.trim().toUpperCase() : "";
  if (!code) return null;

  const name = typeof rec.name === "string" ? rec.name.trim() : "";
  const iat = rec.iat;
  const exp = rec.exp;
  const nonce = rec.nonce;
  if (typeof iat !== "number" || !Number.isFinite(iat)) return null;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
  if (typeof nonce !== "string" || nonce.length === 0) return null;
  // Allow 60s of clock skew on iat; exp is the hard stop (HR default TTL is 120s).
  if (iat > nowSeconds + 60) return null;
  if (exp <= nowSeconds) return null;

  return { code, name, iat, exp, nonce };
}
