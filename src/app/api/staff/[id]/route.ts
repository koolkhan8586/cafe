import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, handleApiError, requireApiRole } from "@/lib/api-auth";
import { hashSecret, minSecretLength } from "@/lib/auth";
import { writeSession } from "@/lib/session";
import { isRole, type Role } from "@/lib/types";
import {
  normaliseStaffCode,
  normaliseWhatsapp,
  STAFF_SELECT,
} from "@/lib/staff-validation";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiRole(["ADMIN"]);
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    const target = await prisma.staff.findUnique({ where: { id } });
    if (!target) throw new ApiError(404, "That person no longer exists.");

    const data: Record<string, unknown> = {};

    if (body.code !== undefined) {
      const code = normaliseStaffCode(body.code);
      if (!code) throw new ApiError(400, "Enter an employee ID.");
      if (code !== target.code) {
        const taken = await prisma.staff.findUnique({ where: { code } });
        if (taken) {
          throw new ApiError(409, `Employee ID ${code} is already taken.`);
        }
        data.code = code;
      }
    }

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw new ApiError(400, "Enter a name.");
      data.name = name.slice(0, 120);
    }
    if (body.department !== undefined) {
      data.department = String(body.department).trim().slice(0, 80) || null;
    }
    if (body.whatsapp !== undefined) {
      data.whatsapp = normaliseWhatsapp(body.whatsapp);
    }

    const nextRole = body.role !== undefined ? String(body.role).toUpperCase() : target.role;
    if (body.role !== undefined) {
      if (!isRole(nextRole)) throw new ApiError(400, "Pick a valid role.");
      // Never let the last admin demote themselves out of the admin screens.
      if (target.role === "ADMIN" && nextRole !== "ADMIN") {
        const admins = await prisma.staff.count({
          where: { role: "ADMIN", active: true },
        });
        if (admins <= 1) {
          throw new ApiError(409, "This is the only admin — promote someone else first.");
        }
      }
      data.role = nextRole;
    }

    if (body.active !== undefined) {
      const active = Boolean(body.active);
      if (!active && target.id === actor.sub) {
        throw new ApiError(409, "You cannot deactivate your own account.");
      }
      if (!active && target.role === "ADMIN") {
        const admins = await prisma.staff.count({
          where: { role: "ADMIN", active: true },
        });
        if (admins <= 1) {
          throw new ApiError(409, "This is the only active admin.");
        }
      }
      data.active = active;
    }

    if (body.secret !== undefined) {
      const secret = String(body.secret);
      const minLength = minSecretLength(nextRole as Role);
      if (secret.length < minLength) {
        throw new ApiError(
          400,
          nextRole === "EMPLOYEE"
            ? `The PIN must be at least ${minLength} digits.`
            : `The password must be at least ${minLength} characters.`,
        );
      }
      data.pinHash = await hashSecret(secret);
    }

    const staff = await prisma.staff.update({
      where: { id },
      data,
      select: STAFF_SELECT,
    });

    // Keep the signed-in admin's nav label in sync if they renamed their own ID.
    if (
      staff.id === actor.sub &&
      (staff.code !== actor.code ||
        staff.name !== actor.name ||
        staff.role !== actor.role)
    ) {
      await writeSession({
        sub: staff.id,
        code: staff.code,
        name: staff.name,
        role: staff.role as Role,
      });
    }

    return NextResponse.json({ staff });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * People are deactivated rather than deleted: their past orders are part of
 * the sales record, and Order.staffId is a required relation.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiRole(["ADMIN"]);
    const { id } = await params;

    if (id === actor.sub) {
      throw new ApiError(409, "You cannot deactivate your own account.");
    }

    const target = await prisma.staff.findUnique({
      where: { id },
      include: { _count: { select: { orders: true } } },
    });
    if (!target) throw new ApiError(404, "That person no longer exists.");

    if (target.role === "ADMIN") {
      const admins = await prisma.staff.count({
        where: { role: "ADMIN", active: true },
      });
      if (admins <= 1) throw new ApiError(409, "This is the only active admin.");
    }

    if (target._count.orders > 0) {
      const staff = await prisma.staff.update({
        where: { id },
        data: { active: false },
        select: STAFF_SELECT,
      });
      return NextResponse.json({
        staff,
        deactivated: true,
        message: `${target.name} has orders on record, so the account was deactivated instead of deleted.`,
      });
    }

    await prisma.staff.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
