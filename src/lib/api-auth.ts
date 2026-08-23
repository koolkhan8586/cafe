import "server-only";
import { NextResponse } from "next/server";
import { readSession, type SessionPayload } from "@/lib/session";
import { isRole, type Role } from "@/lib/types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Route-handler counterpart to requireRole: returns 401/403 JSON, no redirect. */
export async function requireApiRole(roles: Role[]): Promise<SessionPayload> {
  const user = await readSession();
  if (!user) throw new ApiError(401, "Not signed in.");
  if (!isRole(user.role) || !roles.includes(user.role)) {
    throw new ApiError(403, "You do not have access to this action.");
  }
  return user;
}

/** Wrap a route handler so thrown ApiErrors become clean JSON responses. */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Unhandled API error:", error);
  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}
