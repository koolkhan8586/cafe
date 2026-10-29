import "server-only";
import { prisma } from "@/lib/prisma";
import { LEDGER_SIGN, type LedgerType } from "@/lib/types";

/**
 * Staff credit accounts.
 *
 * The balance is never stored. It is always recomputed from LedgerEntry rows,
 * so correcting or deleting an entry cannot leave a stale total behind.
 * Amounts are minor units and the direction comes from the entry type via
 * LEDGER_SIGN; a negative ADJUSTMENT writes an amount off.
 *
 * A positive balance means the person owes the cafe.
 */

export type LedgerLine = {
  id: string;
  type: LedgerType;
  amount: number;
  orderId: number | null;
  note: string | null;
  createdAt: Date;
  createdByName: string | null;
  /** Balance owed immediately after this entry. */
  runningBalance: number;
};

export type StaffBalance = {
  staffId: string;
  code: string;
  name: string;
  department: string | null;
  active: boolean;
  charged: number;
  paid: number;
  balance: number;
  lastActivity: Date | null;
};

function signed(type: string, amount: number): number {
  const sign = LEDGER_SIGN[type as LedgerType];
  // An unrecognised type must not silently count as a charge.
  return sign === undefined ? 0 : sign * amount;
}

/** One row per person who has ever had ledger activity, plus anyone who owes. */
export async function listStaffBalances(): Promise<StaffBalance[]> {
  const [staff, entries] = await Promise.all([
    prisma.staff.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        department: true,
        active: true,
      },
      orderBy: [{ active: "desc" }, { code: "asc" }],
    }),
    prisma.ledgerEntry.findMany({
      select: { staffId: true, type: true, amount: true, createdAt: true },
    }),
  ]);

  const totals = new Map<
    string,
    { charged: number; paid: number; lastActivity: Date | null }
  >();

  for (const entry of entries) {
    const row =
      totals.get(entry.staffId) ?? { charged: 0, paid: 0, lastActivity: null };
    const delta = signed(entry.type, entry.amount);
    if (delta >= 0) {
      row.charged += delta;
    } else {
      row.paid += -delta;
    }
    if (!row.lastActivity || entry.createdAt > row.lastActivity) {
      row.lastActivity = entry.createdAt;
    }
    totals.set(entry.staffId, row);
  }

  return staff.map((person) => {
    const row = totals.get(person.id) ?? {
      charged: 0,
      paid: 0,
      lastActivity: null,
    };
    return {
      staffId: person.id,
      code: person.code,
      name: person.name,
      department: person.department,
      active: person.active,
      charged: row.charged,
      paid: row.paid,
      balance: row.charged - row.paid,
      lastActivity: row.lastActivity,
    };
  });
}

/** Full statement for one person, oldest first, with a running balance. */
export async function getStatement(staffId: string): Promise<LedgerLine[]> {
  const entries = await prisma.ledgerEntry.findMany({
    where: { staffId },
    include: { createdBy: { select: { name: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  let running = 0;
  return entries.map((entry) => {
    running += signed(entry.type, entry.amount);
    return {
      id: entry.id,
      type: entry.type as LedgerType,
      amount: entry.amount,
      orderId: entry.orderId,
      note: entry.note,
      createdAt: entry.createdAt,
      createdByName: entry.createdBy?.name ?? null,
      runningBalance: running,
    };
  });
}

export async function getBalance(staffId: string): Promise<number> {
  const entries = await prisma.ledgerEntry.findMany({
    where: { staffId },
    select: { type: true, amount: true },
  });
  return entries.reduce((sum, e) => sum + signed(e.type, e.amount), 0);
}

/** Total outstanding across everyone — what the cafe is owed right now. */
export async function totalOutstanding(): Promise<number> {
  const balances = await listStaffBalances();
  return balances.reduce((sum, b) => sum + Math.max(0, b.balance), 0);
}
