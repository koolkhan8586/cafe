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

/** Digits only, no leading "+", which is the form WAHA expects. */
export function normaliseWhatsapp(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const digits = value.replace(/[^0-9]/g, "");
  return digits || null;
}
