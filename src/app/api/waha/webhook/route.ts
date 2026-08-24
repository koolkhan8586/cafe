import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api-auth";
import { applyOrderStatus, latestPendingOrderId } from "@/lib/order-workflow";
import { getSettings } from "@/lib/settings";
import { parseWhatsAppCommand } from "@/lib/whatsapp-commands";
import {
  counterBoardUrl,
  isAdminAlertChat,
  sendWhatsApp,
  toChatId,
} from "@/lib/waha";

type WahaMessage = {
  event?: string;
  payload?: {
    from?: string;
    to?: string;
    fromMe?: boolean;
    source?: string;
    body?: string;
    replyTo?: { body?: string | null };
    _data?: Record<string, unknown>;
  };
};

function headerEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function hmacHex(algo: "sha256" | "sha512", secret: string, body: string): string {
  return createHmac(algo, secret).update(body).digest("hex");
}

function hmacBase64(algo: "sha256" | "sha512", secret: string, body: string): string {
  return createHmac(algo, secret).update(body).digest("base64");
}

async function webhookAllowed(request: Request, raw: string): Promise<boolean> {
  const settings = await getSettings();
  const secret = settings.WAHA_API_KEY;

  const apiKey =
    request.headers.get("x-api-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  const hmac = request.headers.get("x-webhook-hmac") ?? "";

  if (apiKey) {
    if (!secret) return false;
    return headerEqual(apiKey, secret);
  }
  if (hmac) {
    if (!secret) return false;
    const candidates = [
      hmacHex("sha512", secret, raw),
      hmacHex("sha256", secret, raw),
      hmacBase64("sha512", secret, raw),
      hmacBase64("sha256", secret, raw),
    ];
    return candidates.some((expected) => headerEqual(hmac, expected));
  }

  // WAHA's default webhook does not send HMAC. Commands still have to come
  // from the configured admin chat.
  return true;
}

function messageText(payload: NonNullable<WahaMessage["payload"]>): string {
  const extra = payload._data ?? {};
  const bits = [
    payload.body,
    typeof extra.selectedButtonId === "string" ? extra.selectedButtonId : "",
    typeof extra.title === "string" ? extra.title : "",
    typeof extra.displayText === "string" ? extra.displayText : "",
  ];
  return bits.filter(Boolean).join("\n");
}

function quotedText(payload: NonNullable<WahaMessage["payload"]>): string {
  const reply = payload.replyTo?.body;
  if (typeof reply === "string") return reply;
  const quoted = payload._data?.quotedMsg;
  if (quoted && typeof quoted === "object" && "body" in quoted) {
    return String((quoted as { body?: unknown }).body ?? "");
  }
  return "";
}

/**
 * WAHA posts incoming WhatsApp messages here so the counter team can
 * ACCEPT / REJECT an order (or ask for COUNTER) from the same chat.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!(await webhookAllowed(request, raw))) {
    return NextResponse.json({ error: "Unauthorized webhook." }, { status: 401 });
  }

  let event: WahaMessage;
  try {
    event = JSON.parse(raw) as WahaMessage;
  } catch {
    return NextResponse.json({ ok: true, ignored: "not-json" });
  }

  const kind = event.event ?? "message";
  if (kind !== "message" && kind !== "message.any") {
    return NextResponse.json({ ok: true, ignored: kind });
  }

  const payload = event.payload;
  if (!payload || payload.fromMe || payload.source === "api") {
    return NextResponse.json({ ok: true, ignored: "outbound" });
  }

  const settings = await getSettings();
  const chat = payload.from ?? "";
  if (!isAdminAlertChat(chat, settings.ADMIN_WHATSAPP_CHAT_ID)) {
    return NextResponse.json({ ok: true, ignored: "not-admin-chat" });
  }

  const command = parseWhatsAppCommand(messageText(payload), quotedText(payload));
  if (!command) {
    return NextResponse.json({ ok: true, ignored: "not-a-command" });
  }

  const replyTo = toChatId(chat) || settings.ADMIN_WHATSAPP_CHAT_ID;

  try {
    if (command.type === "counter") {
      await sendWhatsApp(
        replyTo,
        `*${settings.CAFE_NAME} — Counter*\n${counterBoardUrl(settings)}`,
      );
      return NextResponse.json({ ok: true, action: "counter" });
    }

    let orderId = command.orderId;
    if (orderId == null) {
      orderId = await latestPendingOrderId();
    }
    if (orderId == null) {
      await sendWhatsApp(
        replyTo,
        "No new order to update. Include the number, e.g. ACCEPT 12.",
      );
      return NextResponse.json({ ok: true, action: "no-order" });
    }

    const next = command.type === "accept" ? "PREPARING" : "CANCELLED";
    const { order } = await applyOrderStatus(orderId, next);
    const verb = command.type === "accept" ? "accepted — now Preparing" : "rejected — cancelled";
    await sendWhatsApp(
      replyTo,
      `*${settings.CAFE_NAME}*\nOrder #${order.id} ${verb}.\n🖥 ${counterBoardUrl(settings)}`,
      order.id,
    );
    return NextResponse.json({
      ok: true,
      action: command.type,
      orderId: order.id,
      status: order.status,
    });
  } catch (error) {
    const message =
      error instanceof ApiError
        ? error.message
        : "Could not update that order.";
    await sendWhatsApp(replyTo, `*${settings.CAFE_NAME}*\n${message}`);
    return NextResponse.json({ ok: true, error: message });
  }
}
