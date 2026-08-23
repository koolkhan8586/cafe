import "server-only";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { readSession, type SessionPayload } from "@/lib/session";
import { isRole, type Role } from "@/lib/types";

const BCRYPT_ROUNDS = 10;

/** Employees use a short numeric PIN; admins and managers use a password. */
export const PIN_MIN_LENGTH = 4;
export const PASSWORD_MIN_LENGTH = 8;

export function minSecretLength(role: Role): number {
  return role === "EMPLOYEE" ? PIN_MIN_LENGTH : PASSWORD_MIN_LENGTH;
}

export function hashSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, BCRYPT_ROUNDS);
}

export function verifySecret(secret: string, hash: string): Promise<boolean> {
  return bcrypt.compare(secret, hash);
}

/**
 * Look up a login. Always runs a bcrypt comparison, even when the code is
 * unknown, so response timing does not reveal which employee IDs exist.
 */
const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8HxdG7bFZuVfCLd4RyhNiF/ZUOUXCa";

export async function authenticate(code: string, secret: string) {
  const staff = await prisma.staff.findUnique({
    where: { code: code.trim().toUpperCase() },
  });
  const ok = await verifySecret(secret, staff?.pinHash ?? DUMMY_HASH);
  if (!staff || !ok || !staff.active) return null;
  return staff;
}

export async function currentUser(): Promise<SessionPayload | null> {
  return readSession();
}

/** Require any logged-in user, or bounce to the login page. */
export async function requireUser(nextPath?: string): Promise<SessionPayload> {
  const user = await readSession();
  if (!user) {
    redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  }
  return user;
}

/**
 * Require one of the given roles. An admin also counts as a manager and vice
 * versa is NOT true: managers see money, admins run the counter. Keep them
 * separate and list both explicitly where a page serves both.
 */
export async function requireRole(
  roles: Role[],
  nextPath?: string,
): Promise<SessionPayload> {
  const user = await requireUser(nextPath);
  if (!isRole(user.role) || !roles.includes(user.role)) {
    redirect("/denied");
  }
  return user;
}

/** Landing page for a role, used after login and from the root route. */
export function homeForRole(role: Role): string {
  switch (role) {
    case "ADMIN":
      return "/admin/orders";
    case "MANAGER":
      return "/manager";
    default:
      return "/menu";
  }
}
