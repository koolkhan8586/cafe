import "server-only";
import crypto from "node:crypto";
import { hashSecret } from "@/lib/auth";
import type { HrSsoPayload } from "@/lib/hr-sso";
import { prisma } from "@/lib/prisma";

/**
 * Resolve a Cafe staff row from a verified HR SSO payload.
 * Existing accounts keep their role; unknown codes are provisioned as EMPLOYEE
 * so the first HR click works without a matching seed row.
 */
export async function staffFromHrSso(payload: HrSsoPayload) {
  const existing = await prisma.staff.findUnique({
    where: { code: payload.code },
  });

  if (existing) {
    if (payload.name && payload.name !== existing.name) {
      return prisma.staff.update({
        where: { id: existing.id },
        data: { name: payload.name },
      });
    }
    return existing;
  }

  const pinHash = await hashSecret(crypto.randomBytes(32).toString("hex"));
  return prisma.staff.create({
    data: {
      code: payload.code,
      name: payload.name || payload.code,
      role: "EMPLOYEE",
      pinHash,
    },
  });
}
