/** Fields safe to return to the client. Never includes pinHash. */
export const STAFF_SELECT = {
  id: true,
  code: true,
  name: true,
  department: true,
  whatsapp: true,
  role: true,
  active: true,
} as const;

/** Login / SSO handle: trim, uppercase, max 40 chars. Empty → null. */
export function normaliseStaffCode(raw: unknown): string | null {
  const value = String(raw ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 40);
  return value || null;
}

/** Digits only, no leading "+", which is the form WAHA expects. */
export function normaliseWhatsapp(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const digits = value.replace(/[^0-9]/g, "");
  return digits || null;
}
