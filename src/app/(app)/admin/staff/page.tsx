import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { StaffManager, type StaffRow } from "@/components/StaffManager";
import { STAFF_SELECT } from "@/lib/staff-validation";

export const dynamic = "force-dynamic";

export default async function AdminStaffPage() {
  await requireRole(["ADMIN"], "/admin/staff");

  const staff = await prisma.staff.findMany({
    select: STAFF_SELECT,
    orderBy: [{ active: "desc" }, { code: "asc" }],
  });

  return (
    <>
      <PageHeader
        title="Staff"
        subtitle="Who can order, who runs the counter, and who sees the numbers."
      />
      <StaffManager initialStaff={staff as StaffRow[]} />
    </>
  );
}
