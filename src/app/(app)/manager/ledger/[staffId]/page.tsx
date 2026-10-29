import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { getStatement } from "@/lib/ledger";
import { LEDGER_LABELS, LEDGER_SIGN, type LedgerType } from "@/lib/types";
import { Card, EmptyState, PageHeader, Stat, cn } from "@/components/ui";
import { LedgerPaymentForm } from "@/components/LedgerPaymentForm";

export const dynamic = "force-dynamic";

export default async function StatementPage({
  params,
}: {
  params: Promise<{ staffId: string }>;
}) {
  await requireRole(["ADMIN", "MANAGER"], "/manager/ledger");
  const { staffId } = await params;

  const [settings, staff, lines] = await Promise.all([
    getSettings(),
    prisma.staff.findUnique({
      where: { id: staffId },
      select: { id: true, code: true, name: true, department: true },
    }),
    getStatement(staffId),
  ]);

  if (!staff) notFound();

  const currency = settings.CURRENCY_SYMBOL;
  const balance = lines.length ? lines[lines.length - 1].runningBalance : 0;
  // Split by the effect each entry has on the balance, not by its label: a
  // negative adjustment reduces what is owed and belongs with the payments.
  // Otherwise charged - paid would not equal the balance shown beside them.
  const delta = (line: { type: LedgerType; amount: number }) =>
    (LEDGER_SIGN[line.type] ?? 1) * line.amount;
  const charged = lines.reduce((sum, l) => sum + Math.max(0, delta(l)), 0);
  const paid = lines.reduce((sum, l) => sum + Math.max(0, -delta(l)), 0);

  return (
    <>
      <PageHeader
        title={staff.name}
        subtitle={`${staff.code}${staff.department ? ` · ${staff.department}` : ""}`}
        actions={
          <Link
            href="/manager/ledger"
            className="rounded-lg border border-border-subtle px-3 py-2 text-sm font-medium hover:bg-surface-muted"
          >
            All accounts
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Balance owed"
          value={formatMoney(balance, currency)}
          tone={balance > 0 ? "negative" : balance < 0 ? "positive" : "default"}
          hint={balance < 0 ? "In credit" : balance === 0 ? "Settled" : undefined}
        />
        <Stat label="Total charged" value={formatMoney(charged, currency)} />
        <Stat label="Total paid" value={formatMoney(paid, currency)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        {lines.length === 0 ? (
          <EmptyState
            title="Nothing on this account"
            hint="Credit orders and payments appear here."
            icon="📄"
          />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Entry</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--border)]">
                {[...lines].reverse().map((line) => (
                  <tr key={line.id}>
                    <td className="px-3 py-2 whitespace-nowrap text-muted">
                      {line.createdAt.toLocaleDateString("en-GB")}
                    </td>
                    <td className="px-3 py-2">
                      {LEDGER_LABELS[line.type as LedgerType] ?? line.type}
                      {line.orderId ? (
                        <span className="text-muted"> · #{line.orderId}</span>
                      ) : null}
                      {line.note && !line.orderId ? (
                        <span className="text-muted"> · {line.note}</span>
                      ) : null}
                      {line.createdByName ? (
                        <span className="block text-xs text-muted">
                          by {line.createdByName}
                        </span>
                      ) : null}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right tabular-nums",
                        delta(line) < 0 ? "text-success" : "",
                      )}
                    >
                      {delta(line) < 0 ? "−" : "+"}
                      {formatMoney(Math.abs(delta(line)), currency)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatMoney(line.runningBalance, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <LedgerPaymentForm
            staffId={staff.id}
            staffName={staff.name}
            balance={balance}
            currency={currency}
          />
        </aside>
      </div>
    </>
  );
}
