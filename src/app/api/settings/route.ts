import { NextResponse } from "next/server";
import { handleApiError, requireApiRole } from "@/lib/api-auth";
import { getSettings, saveSettings, type AppSettings } from "@/lib/settings";

/** Never echo the API key back to the browser; report only whether it is set. */
function redact(settings: AppSettings) {
  const { WAHA_API_KEY, ...rest } = settings;
  return { ...rest, WAHA_API_KEY_SET: WAHA_API_KEY.length > 0 };
}

export async function GET() {
  try {
    await requireApiRole(["ADMIN"]);
    return NextResponse.json({ settings: redact(await getSettings()) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireApiRole(["ADMIN"]);
    const body = (await request.json()) as Record<string, unknown>;

    const patch: Partial<AppSettings> = {};
    for (const key of [
      "CAFE_NAME",
      "CURRENCY_SYMBOL",
      "WAHA_BASE_URL",
      "WAHA_SESSION",
      "ADMIN_WHATSAPP_CHAT_ID",
      "NOTIFY_EMPLOYEE_ON_STATUS",
    ] as const) {
      if (body[key] !== undefined) patch[key] = String(body[key]).trim();
    }

    // An empty API key means "leave it alone", so that saving the form without
    // re-typing the secret does not wipe it.
    if (typeof body.WAHA_API_KEY === "string" && body.WAHA_API_KEY.trim()) {
      patch.WAHA_API_KEY = body.WAHA_API_KEY.trim();
    }

    await saveSettings(patch);
    return NextResponse.json({ settings: redact(await getSettings()) });
  } catch (error) {
    return handleApiError(error);
  }
}
