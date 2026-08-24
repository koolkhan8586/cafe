/**
 * Parse cafe-counter replies from WhatsApp (text or button titles).
 *
 * Accept / reject may include an order number, or omit it when the person
 * replies to the original alert (the quoted body has "order #12").
 */
export type WhatsAppCommand =
  | { type: "accept"; orderId: number | null }
  | { type: "reject"; orderId: number | null }
  | { type: "counter" };

const ORDER_ID = /(?:order\s*)?#\s*(\d+)\b|\b(\d{1,9})\b/i;

function firstOrderId(text: string): number | null {
  const match = text.match(ORDER_ID);
  if (!match) return null;
  const raw = match[1] ?? match[2];
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function orderIdFromQuoted(quoted: string | null | undefined): number | null {
  if (!quoted) return null;
  const match = quoted.match(/order\s*#\s*(\d+)/i);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function compact(raw: string): string {
  return raw
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseWhatsAppCommand(
  raw: string,
  quoted?: string | null,
): WhatsAppCommand | null {
  const text = compact(raw);
  if (!text) return null;

  const upper = text.toUpperCase();
  const quotedId = orderIdFromQuoted(quoted);

  if (
    /^(COUNTER|BOARD|COUNTER BOARD|OPEN COUNTER)\b/.test(upper) ||
    upper === "🖥" ||
    upper === "COUNTER"
  ) {
    return { type: "counter" };
  }

  const accept = /^(✅|ACCEPT|ACCEPTED|YES|OK|START|PREPARE)(?:\s|#|$)/.test(
    upper,
  );
  const reject = /^(❌|REJECT|REJECTED|NO|CANCEL|CANCELLED|CANCELED)(?:\s|#|$)/.test(
    upper,
  );

  if (accept) {
    return { type: "accept", orderId: firstOrderId(text) ?? quotedId };
  }
  if (reject) {
    return { type: "reject", orderId: firstOrderId(text) ?? quotedId };
  }

  return null;
}
