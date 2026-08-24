import { redirect } from "next/navigation";
import { homeForRole } from "@/lib/auth";
import {
  hrSsoConfigured,
  type HrSsoFail,
  verifyHrSsoToken,
} from "@/lib/hr-sso";
import { staffFromHrSso } from "@/lib/hr-sso-staff";
import { writeSession } from "@/lib/session";
import { isRole } from "@/lib/types";

function fail(reason: HrSsoFail): never {
  redirect(`/login?sso=${reason}`);
}

/**
 * GET /sso?token=...
 *
 * HR signs a 2-minute HMAC token (see koolkhan8586/hr-laravel CafeSsoService)
 * and sends the browser here. We verify with HR_SSO_SECRET, start a Cafe
 * session, and land on the role home (employees → /menu).
 */
export async function GET(request: Request) {
  if (!hrSsoConfigured()) fail("disabled");

  const token = new URL(request.url).searchParams.get("token");
  const payload = verifyHrSsoToken(token);
  if (!payload) fail("invalid");

  const staff = await staffFromHrSso(payload);
  if (!staff) fail("unknown");
  if (!staff.active) fail("inactive");
  if (!isRole(staff.role)) fail("invalid");

  await writeSession({
    sub: staff.id,
    code: staff.code,
    name: staff.name,
    role: staff.role,
  });

  redirect(homeForRole(staff.role));
}
