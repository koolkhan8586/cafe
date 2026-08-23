import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { Role } from "@/lib/types";

export const SESSION_COOKIE = "lsaf_session";
const MAX_AGE_SECONDS = 60 * 60 * 12; // a single working day

export type SessionPayload = {
  sub: string; // Staff.id
  code: string;
  name: string;
  role: Role;
  exp: number; // unix seconds
};

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (value && value.length >= 16) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET must be set to at least 16 characters in production.",
    );
  }
  // Dev-only fallback so `npm run dev` works before .env is filled in.
  return "insecure-development-session-secret";
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string): string {
  return crypto.createHmac("sha256", secret()).update(data).digest("base64url");
}

export function serializeSession(
  payload: Omit<SessionPayload, "exp">,
  maxAgeSeconds = MAX_AGE_SECONDS,
): { token: string; maxAge: number } {
  const full: SessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  };
  const body = base64url(JSON.stringify(full));
  return { token: `${body}.${sign(body)}`, maxAge: maxAgeSeconds };
}

export function parseSession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(body);

  // Constant-time compare; timingSafeEqual throws on length mismatch.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function readSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return parseSession(store.get(SESSION_COOKIE)?.value);
}

export async function writeSession(
  payload: Omit<SessionPayload, "exp">,
): Promise<void> {
  const { token, maxAge } = serializeSession(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
