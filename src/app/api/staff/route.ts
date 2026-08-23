import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, handleApiError, requireApiRole } from "@/lib/api-auth";
import { hashSecret, minSecretLength } from "@/lib/auth";
import { isRole, type Role } from "@/lib/types";
import { normaliseWhatsapp, STAFF_SELECT } from "@/lib/staff-validation";

export async function GET() {
  try {
    await requireApiRole(["ADMIN"]);
    const staff = await prisma.staff.findMany({
      select: STAFF_SELECT,
      orderBy: [{ role: "asc" }, { code: "asc" }],
    });
    return NextResponse.json({ staff });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireApiRole(["ADMIN"]);
    const body = (await request.json()) as Record<string, unknown>;

    const code = String(body.code ?? "").trim().toUpperCase();
    const name = String(body.name ?? "").trim();
    const role = String(body.role ?? "EMPLOYEE").toUpperCase();
    const secret = String(body.secret ?? "");

    if (!code) throw new ApiError(400, "Enter an employee ID.");
    if (!name) throw new ApiError(400, "Enter a name.");
    if (!isRole(role)) throw new ApiError(400, "Pick a valid role.");

    const minLength = minSecretLength(role as Role);
    if (secret.length < minLength) {
      throw new ApiError(
        400,
        role === "EMPLOYEE"
          ? `The PIN must be at least ${minLength} digits.`
          : `The password must be at least ${minLength} characters.`,
      );
    }

    const existing = await prisma.staff.findUnique({ where: { code } });
    if (existing) throw new ApiError(409, `Employee ID ${code} is already taken.`);

    const person = await prisma.staff.create({
      data: {
        code: code.slice(0, 40),
        name: name.slice(0, 120),
        department: String(body.department ?? "").trim().slice(0, 80) || null,
        whatsapp: normaliseWhatsapp(body.whatsapp),
        role,
        pinHash: await hashSecret(secret),
      },
      select: STAFF_SELECT,
    });

    return NextResponse.json({ staff: person }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
