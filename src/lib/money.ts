/**
 * All money in this app is an integer count of minor units (paisa, cents).
 * Floats are never used for money: 0.1 + 0.2 !== 0.3 and a cafe's daily
 * totals would drift.
 */

export const MINOR_UNITS_PER_MAJOR = 100;

/** Parse user input like "250", "250.50", "Rs 250.50" into minor units. */
export function parseMoney(input: string | number): number | null {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    return Math.round(input * MINOR_UNITS_PER_MAJOR);
  }
  const cleaned = input.replace(/[^0-9.-]/g, "").trim();
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * MINOR_UNITS_PER_MAJOR);
}

/** Minor units -> a plain decimal string, e.g. 25050 -> "250.50". */
export function toDecimalString(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minor));
  const major = Math.floor(abs / MINOR_UNITS_PER_MAJOR);
  const rest = abs % MINOR_UNITS_PER_MAJOR;
  return `${sign}${major}.${String(rest).padStart(2, "0")}`;
}

/** Minor units -> a display string with thousands separators and currency. */
export function formatMoney(minor: number, currency = "Rs"): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minor));
  const major = Math.floor(abs / MINOR_UNITS_PER_MAJOR);
  const rest = abs % MINOR_UNITS_PER_MAJOR;
  const grouped = major.toLocaleString("en-US");
  return `${sign}${currency} ${grouped}.${String(rest).padStart(2, "0")}`;
}

/**
 * Margin as a percentage of the selling price, rounded to one decimal.
 * Returns null when the price is zero, because margin is then undefined
 * rather than 0 or 100.
 */
export function marginPercent(price: number, cost: number): number | null {
  if (price <= 0) return null;
  return Math.round(((price - cost) / price) * 1000) / 10;
}
