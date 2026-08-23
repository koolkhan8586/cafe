import { NextResponse } from "next/server";
import { authenticate, homeForRole } from "@/lib/auth";
import { writeSession } from "@/lib/session";
import { isRole } from "@/lib/types";

export async function POST(request: Request) {
  let body: { code?: unknown; secret?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  const secret = typeof body.secret === "string" ? body.secret : "";

  if (!code || !secret) {
    return NextResponse.json(
      { error: "Enter your employee ID and PIN." },
      { status: 400 },
    );
  }

  const staff = await authenticate(code, secret);
  if (!staff || !isRole(staff.role)) {
    // Deliberately vague: never reveal whether the ID or the PIN was wrong.
    return NextResponse.json(
      { error: "Employee ID or PIN is incorrect." },
      { status: 401 },
    );
  }

  await writeSession({
    sub: staff.id,
    code: staff.code,
    name: staff.name,
    role: staff.role,
  });

  return NextResponse.json({ redirectTo: homeForRole(staff.role) });
}
