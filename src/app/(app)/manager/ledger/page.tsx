import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { listStaffBalances } from "@/lib/ledger";
import { Card, EmptyState, PageHeader, Stat, cn } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  await requireRole(["ADMIN", "MANAGER"], "/manager/ledger");

  const [settings, balances] = await Promise.all([
    getSettings(),
    listStaffBalances(),
  ]);
  const currency = settings.CURRENCY_SYMBOL;

  // Only people with activity or a balance are worth listing; a staff list
  // where nobody has ever ordered on credit is just noise here.
  const rows = balances.filter((b) => b.charged !== 0 || b.paid !== 0);
  const owing = rows.filter((r) => r.balance > 0);
  const outstanding = owing.reduce((sum, r) => sum + r.balance, 0);
  const inCredit = rows.filter((r) => r.balance < 0);

  return (
    <>
      <PageHeader
        title="Staff ledger"
        subtitle="What each person owes for orders taken on account."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Total outstanding"
          value={formatMoney(outstanding, currency)}
          hint={`${owing.length} ${owing.length === 1 ? "person" : "people"} owing`}
          tone={outstanding > 0 ? "negative" : "default"}
        />
        <Stat label="Accounts with activity" value={String(rows.length)} />
        <Stat
          label="In credit"
          value={String(inCredit.length)}
          hint={inCredit.length ? "Paid more than they owe" : undefined}
        />
      </div>

      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No credit orders yet"
            hint="An order placed on account shows up here."
            icon="📒"
          />
        </div>
      ) : (
        <Card className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[42rem] text-sm">
            <thead className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Department</th>
                <th className="px-3 py-2 text-right">Charged</th>
                <th className="px-3 py-2 text-right">Paid</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2 text-right">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border)]">
              {rows.map((row) => (
                <tr key={row.staffId} className={row.active ? "" : "opacity-60"}>
                  <td className="px-3 py-2 font-medium">
                    <Link
                      href={`/manager/ledger/${row.staffId}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {row.name}
                    </Link>{" "}
                    <span className="font-mono text-xs text-muted">{row.code}</span>
                  </td>
                  <td className="px-3 py-2 text-muted">{row.department ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(row.charged, currency)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(row.paid, currency)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-semibold tabular-nums",
                      row.balance > 0
                        ? "text-danger"
                        : row.balance < 0
                          ? "text-success"
                          : "text-muted",
                    )}
                  >
                    {formatMoney(row.balance, currency)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-muted">
                    {row.lastActivity
                      ? row.lastActivity.toLocaleDateString("en-GB")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
