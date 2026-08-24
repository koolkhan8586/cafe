import "server-only";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { STATUS_LABELS, type OrderStatus } from "@/lib/types";

/**
 * Thin client for WAHA (WhatsApp HTTP API, https://waha.devlike.pro).
 *
 * Design rule: sending a WhatsApp message must never fail an order. Every
 * send is wrapped, logged to NotificationLog, and returns a result object
 * instead of throwing.
 */

export type SendResult =
  | { status: "SENT" }
  | { status: "SKIPPED"; reason: string }
  | { status: "FAILED"; error: string };

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * WAHA addresses individuals as "<number>@c.us" and groups as "<id>@g.us".
 * Accept a bare number for convenience and normalise it.
 */
export function toChatId(raw: string): string {
  const value = raw.trim();
  if (value === "") return "";
  if (value.includes("@")) return value;
  const digits = value.replace(/[^0-9]/g, "");
  return digits ? `${digits}@c.us` : "";
}

async function wahaFetch(
  baseUrl: string,
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${baseUrl.replace(/\/+$/, "")}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-Api-Key": apiKey } : {}),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Ask WAHA for the session state — used by the "Test connection" button. */
export async function checkWahaSession(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const settings = await getSettings();
  const baseUrl = settings.WAHA_BASE_URL;
  if (!baseUrl) {
    return { ok: false, detail: "WAHA base URL is not configured." };
  }
  try {
    const res = await wahaFetch(
      baseUrl,
      settings.WAHA_API_KEY,
      `/api/sessions/${encodeURIComponent(settings.WAHA_SESSION)}`,
    );
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, detail: `WAHA responded ${res.status}: ${trim(text)}` };
    }
    let state = "unknown";
    try {
      state = (JSON.parse(text) as { status?: string }).status ?? "unknown";
    } catch {
      // Non-JSON body; fall through with the raw text as detail.
    }
    if (state.toUpperCase() !== "WORKING") {
      return {
        ok: false,
        detail: `Session "${settings.WAHA_SESSION}" is ${state}. Scan the QR code in WAHA to pair it.`,
      };
    }
    return { ok: true, detail: `Session "${settings.WAHA_SESSION}" is working.` };
  } catch (error) {
    return { ok: false, detail: describeError(error) };
  }
}

/** Send a text message and record the attempt. */
export async function sendWhatsApp(
  chatIdRaw: string,
  body: string,
  orderId?: number,
): Promise<SendResult> {
  const settings = await getSettings();
  const chatId = toChatId(chatIdRaw);

  const log = async (result: SendResult) => {
    await prisma.notificationLog.create({
      data: {
        orderId: orderId ?? null,
        target: chatId || chatIdRaw || "(none)",
        body,
        status: result.status,
        error: result.status === "SENT" ? null : describeResult(result),
      },
    });
    return result;
  };

  if (!settings.WAHA_BASE_URL) {
    return log({ status: "SKIPPED", reason: "WAHA base URL is not configured." });
  }
  if (!chatId) {
    return log({ status: "SKIPPED", reason: "No WhatsApp recipient configured." });
  }

  try {
    const res = await wahaFetch(
      settings.WAHA_BASE_URL,
      settings.WAHA_API_KEY,
      "/api/sendText",
      {
        method: "POST",
        body: JSON.stringify({
          session: settings.WAHA_SESSION,
          chatId,
          text: body,
        }),
      },
    );
    if (!res.ok) {
      const detail = trim(await res.text());
      return log({
        status: "FAILED",
        error: `WAHA responded ${res.status}: ${detail}`,
      });
    }
    return log({ status: "SENT" });
  } catch (error) {
    return log({ status: "FAILED", error: describeError(error) });
  }
}

type OrderForMessage = {
  id: number;
  subtotal: number;
  notes: string | null;
  createdAt: Date;
  staff: { name: string; code: string; department: string | null };
  items: { nameSnapshot: string; qty: number; lineTotal: number; notes: string | null }[];
};

/** The message the cafe admin receives the moment an order is placed. */
export async function notifyAdminOfOrder(order: OrderForMessage): Promise<SendResult> {
  const settings = await getSettings();
  const currency = settings.CURRENCY_SYMBOL;

  const lines = order.items.map((item) => {
    const note = item.notes ? ` (${item.notes})` : "";
    return `• ${item.qty} x ${item.nameSnapshot}${note} — ${formatMoney(item.lineTotal, currency)}`;
  });

  const body = [
    `*${settings.CAFE_NAME} — New order #${order.id}*`,
    "",
    `👤 ${order.staff.name} (${order.staff.code})`,
    order.staff.department ? `🏢 ${order.staff.department}` : null,
    `🕒 ${order.createdAt.toLocaleString("en-GB")}`,
    "",
    ...lines,
    "",
    `*Total: ${formatMoney(order.subtotal, currency)}*`,
    order.notes ? `\n📝 Note: ${order.notes}` : null,
    "",
    "Reply from this chat:",
    `✅ ACCEPT ${order.id} — start preparing`,
    `❌ REJECT ${order.id} — cancel`,
    `🖥 COUNTER — ${counterBoardUrl(settings)}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const chatId = settings.ADMIN_WHATSAPP_CHAT_ID;
  const buttons = await sendWhatsAppButtons(
    chatId,
    {
      header: `${settings.CAFE_NAME} — #${order.id}`,
      body,
      footer: "Or reply ACCEPT / REJECT / COUNTER",
      buttons: [
        { type: "reply", text: `ACCEPT ${order.id}` },
        { type: "reply", text: `REJECT ${order.id}` },
        { type: "url", text: "Counter", url: counterBoardUrl(settings) },
      ],
    },
    order.id,
  );
  if (buttons.status === "SENT") return buttons;
  return sendWhatsApp(chatId, body, order.id);
}

/** Optional courtesy message to the employee when their order changes state. */
export async function notifyEmployeeOfStatus(
  order: { id: number; staff: { name: string; whatsapp: string | null } },
  status: OrderStatus,
): Promise<SendResult> {
  const settings = await getSettings();
  if (settings.NOTIFY_EMPLOYEE_ON_STATUS !== "true") {
    return { status: "SKIPPED", reason: "Employee status notifications are off." };
  }
  if (!order.staff.whatsapp) {
    return { status: "SKIPPED", reason: "Employee has no WhatsApp number." };
  }
  const body = `*${settings.CAFE_NAME}*\nOrder #${order.id} is now: ${STATUS_LABELS[status]}`;
  return sendWhatsApp(order.staff.whatsapp, body, order.id);
}

function describeResult(result: SendResult): string {
  if (result.status === "SKIPPED") return result.reason;
  if (result.status === "FAILED") return result.error;
  return "";
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return `WAHA did not respond within ${REQUEST_TIMEOUT_MS / 1000}s.`;
    }
    return error.message;
  }
  return String(error);
}

function trim(text: string, max = 300): string {
  const value = text.trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function cafePublicUrl(settings: { CAFE_PUBLIC_URL: string }): string {
  return settings.CAFE_PUBLIC_URL.replace(/\/+$/, "") || "https://cafe.khanmusa.com";
}

export function counterBoardUrl(settings: { CAFE_PUBLIC_URL: string }): string {
  return `${cafePublicUrl(settings)}/admin/orders`;
}

/** True when this WhatsApp chat is the configured order-alert destination. */
export function isAdminAlertChat(fromRaw: string, adminChatRaw: string): boolean {
  const from = toChatId(fromRaw);
  const admin = toChatId(adminChatRaw);
  if (!from || !admin) return false;
  return from.toLowerCase() === admin.toLowerCase();
}

type ButtonSpec =
  | { type: "reply"; text: string }
  | { type: "url"; text: string; url: string };

/**
 * Interactive buttons. Many WAHA engines return 501; callers should fall back
 * to sendText. Logged like sendWhatsApp.
 */
async function sendWhatsAppButtons(
  chatIdRaw: string,
  message: {
    header: string;
    body: string;
    footer: string;
    buttons: ButtonSpec[];
  },
  orderId?: number,
): Promise<SendResult> {
  const settings = await getSettings();
  const chatId = toChatId(chatIdRaw);
  const logBody = `[buttons] ${message.body}`;

  const log = async (result: SendResult) => {
    // Only persist a successful buttons send. 501/unsupported engines fall
    // through to sendText; a FAILED row here would look like the alert never
    // went out.
    if (result.status === "SENT") {
      await prisma.notificationLog.create({
        data: {
          orderId: orderId ?? null,
          target: chatId || chatIdRaw || "(none)",
          body: logBody,
          status: "SENT",
          error: null,
        },
      });
    }
    return result;
  };

  if (!settings.WAHA_BASE_URL) {
    return log({ status: "SKIPPED", reason: "WAHA base URL is not configured." });
  }
  if (!chatId) {
    return log({ status: "SKIPPED", reason: "No WhatsApp recipient configured." });
  }

  try {
    const res = await wahaFetch(
      settings.WAHA_BASE_URL,
      settings.WAHA_API_KEY,
      "/api/sendButtons",
      {
        method: "POST",
        body: JSON.stringify({
          session: settings.WAHA_SESSION,
          chatId,
          header: message.header,
          body: message.body,
          footer: message.footer,
          buttons: message.buttons,
        }),
      },
    );
    if (!res.ok) {
      const detail = trim(await res.text());
      return log({
        status: "FAILED",
        error: `WAHA responded ${res.status}: ${detail}`,
      });
    }
    return log({ status: "SENT" });
  } catch (error) {
    return log({ status: "FAILED", error: describeError(error) });
  }
}
