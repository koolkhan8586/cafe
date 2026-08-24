import { NextResponse } from "next/server";
import { handleApiError, requireApiRole } from "@/lib/api-auth";
import { getSettings } from "@/lib/settings";
import { checkWahaSession, sendWhatsApp } from "@/lib/waha";

/**
 * POST /api/waha/test
 * body: { send?: boolean } — when true, also fires a real test message at the
 * configured admin chat so the admin can confirm delivery end to end.
 */
export async function POST(request: Request) {
  try {
    await requireApiRole(["ADMIN"]);

    let body: { send?: unknown } = {};
    try {
      body = await request.json();
    } catch {
      // An empty body is fine: default to a status check only.
    }

    const session = await checkWahaSession();
    if (!session.ok || body.send !== true) {
      return NextResponse.json({ session });
    }

    const settings = await getSettings();
    const result = await sendWhatsApp(
      settings.ADMIN_WHATSAPP_CHAT_ID,
      `*${settings.CAFE_NAME}*\nTest message — WhatsApp notifications are wired up.\nReply ACCEPT / REJECT / COUNTER on the next order alert.`,
    );
    return NextResponse.json({ session, send: result });
  } catch (error) {
    return handleApiError(error);
  }
}
