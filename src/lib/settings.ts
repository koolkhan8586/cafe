import { prisma } from "@/lib/prisma";

/**
 * Settings that admins can edit from the UI. Each falls back to an environment
 * variable, so a fresh deployment works from env alone and the UI is optional.
 */
export const SETTING_KEYS = {
  cafeName: "CAFE_NAME",
  currency: "CURRENCY_SYMBOL",
  publicUrl: "CAFE_PUBLIC_URL",
  wahaBaseUrl: "WAHA_BASE_URL",
  wahaApiKey: "WAHA_API_KEY",
  wahaSession: "WAHA_SESSION",
  adminChatId: "ADMIN_WHATSAPP_CHAT_ID",
  notifyEmployee: "NOTIFY_EMPLOYEE_ON_STATUS",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

const DEFAULTS: Record<SettingKey, string> = {
  CAFE_NAME: "Cafe LSAF",
  CURRENCY_SYMBOL: "Rs",
  CAFE_PUBLIC_URL: "https://cafe.khanmusa.com",
  WAHA_BASE_URL: "",
  WAHA_API_KEY: "",
  WAHA_SESSION: "default",
  ADMIN_WHATSAPP_CHAT_ID: "",
  NOTIFY_EMPLOYEE_ON_STATUS: "false",
};

export type AppSettings = Record<SettingKey, string>;

/**
 * Resolution order: database override -> environment variable -> default.
 * A row whose value is an empty string is treated as "not set" so that
 * clearing a field in the UI falls back to env rather than blanking config.
 */
export async function getSettings(): Promise<AppSettings> {
  const rows = await prisma.setting.findMany();
  const overrides = new Map(rows.map((r) => [r.key, r.value]));

  const resolved = {} as AppSettings;
  for (const key of Object.keys(DEFAULTS) as SettingKey[]) {
    const dbValue = overrides.get(key)?.trim();
    const envValue = process.env[key]?.trim();
    resolved[key] = dbValue || envValue || DEFAULTS[key];
  }
  return resolved;
}

export async function saveSettings(values: Partial<AppSettings>): Promise<void> {
  const entries = Object.entries(values).filter(([key]) =>
    Object.prototype.hasOwnProperty.call(DEFAULTS, key),
  );
  for (const [key, value] of entries) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: String(value ?? "") },
      update: { value: String(value ?? "") },
    });
  }
}
