import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { rangeFromParams, toDateInput } from "@/lib/reports";
import { PageHeader, Stat } from "@/components/ui";
import { RangePicker } from "@/components/RangePicker";
import { ExpenseManager, type ExpenseRow } from "@/components/ExpenseManager";

export const dynamic = "force-dynamic";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireRole(["ADMIN", "MANAGER"], "/manager/expenses");

  const params = await searchParams;
  const range = rangeFromParams(params.from, params.to);

  const [settings, expenses] = await Promise.all([
    getSettings(),
    prisma.expense.findMany({
      where: { spentAt: { gte: range.from, lte: range.to } },
      include: { createdBy: { select: { name: true } } },
      orderBy: [{ spentAt: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const currency = settings.CURRENCY_SYMBOL;
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  const byCategory = new Map<string, number>();
  for (const expense of expenses) {
    byCategory.set(
      expense.category,
      (byCategory.get(expense.category) ?? 0) + expense.amount,
    );
  }
  const topCategory = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];

  const days = Math.max(
    1,
    Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000),
  );

  const rows: ExpenseRow[] = expenses.map((expense) => ({
    id: expense.id,
    category: expense.category,
    amount: expense.amount,
    spentAt: toDateInput(expense.spentAt),
    note: expense.note,
    createdByName: expense.createdBy?.name ?? null,
  }));

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle="Money going out: supplies, rent, utilities and the rest."
      />

      <RangePicker
        from={toDateInput(range.from)}
        to={toDateInput(range.to)}
        basePath="/manager/expenses"
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat
          label="Total in range"
          value={formatMoney(total, currency)}
          hint={`${expenses.length} ${expenses.length === 1 ? "entry" : "entries"}`}
        />
        <Stat
          label="Daily average"
          value={formatMoney(Math.round(total / days), currency)}
          hint={`Over ${days} days`}
        />
        <Stat
          label="Biggest category"
          value={topCategory ? topCategory[0] : "—"}
          hint={topCategory ? formatMoney(topCategory[1], currency) : undefined}
        />
      </div>

      <div className="mt-6">
        <ExpenseManager initialExpenses={rows} currency={currency} />
      </div>
    </>
  );
}
