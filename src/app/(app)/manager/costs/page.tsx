import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { buildCostReport, rangeFromParams, toDateInput } from "@/lib/reports";
import { Card, EmptyState, PageHeader, Stat, cn } from "@/components/ui";
import { RangePicker } from "@/components/RangePicker";

export const dynamic = "force-dynamic";

export default async function ManagerCostsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireRole(["MANAGER"], "/manager/costs");

  const params = await searchParams;
  const range = rangeFromParams(params.from, params.to);
  const [settings, rows] = await Promise.all([
    getSettings(),
    buildCostReport(range),
  ]);

  const currency = settings.CURRENCY_SYMBOL;
  const sold = rows.filter((row) => row.qtySold > 0);
  const soldRevenue = sold.reduce((sum, row) => sum + row.revenue, 0);
  const soldProfit = sold.reduce((sum, row) => sum + row.profit, 0);

  const withMargin = rows.filter((r) => r.margin !== null);
  const bestMargin = [...withMargin].sort((a, b) => b.margin! - a.margin!)[0];
  const worstMargin = [...withMargin].sort((a, b) => a.margin! - b.margin!)[0];
  const noCost = rows.filter((row) => row.costPrice === 0);

  const exportHref = `/api/reports/export?type=costs&from=${toDateInput(range.from)}&to=${toDateInput(range.to)}`;

  return (
    <>
      <PageHeader
        title="Costs &amp; margin"
        subtitle="What each item costs, what it earns, and what it actually made in this period."
      />

      <RangePicker
        from={toDateInput(range.from)}
        to={toDateInput(range.to)}
        basePath="/manager/costs"
        exportHref={exportHref}
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Revenue from items sold" value={formatMoney(soldRevenue, currency)} />
        <Stat
          label="Profit from items sold"
          value={formatMoney(soldProfit, currency)}
          tone={soldProfit >= 0 ? "positive" : "negative"}
          hint={
            soldRevenue > 0
              ? `${Math.round((soldProfit / soldRevenue) * 1000) / 10}% blended margin`
              : undefined
          }
        />
        <Stat
          label="Best margin"
          value={bestMargin ? `${bestMargin.margin}%` : "—"}
          hint={bestMargin?.name}
        />
        <Stat
          label="Thinnest margin"
          value={worstMargin ? `${worstMargin.margin}%` : "—"}
          hint={worstMargin?.name}
        />
      </div>

      {noCost.length > 0 ? (
        <p className="mt-4 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          {noCost.length} item{noCost.length === 1 ? " has" : "s have"} no cost price
          set, so {noCost.length === 1 ? "its" : "their"} margin reads as 100%. Ask
          the admin to fill these in: {noCost.map((r) => r.name).join(", ")}.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No menu items yet" icon="📋" />
        </div>
      ) : (
        <Card className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Cost</th>
                <th className="px-3 py-2 text-right">Profit / unit</th>
                <th className="px-3 py-2 text-right">Margin</th>
                <th className="px-3 py-2 text-right">Sold</th>
                <th className="px-3 py-2 text-right">Revenue</th>
                <th className="px-3 py-2 text-right">Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border)]">
              {rows.map((row) => (
                <tr key={row.id} className={row.available ? "" : "opacity-60"}>
                  <td className="px-3 py-2 font-medium">
                    {row.name}
                    {!row.available ? (
                      <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted">
                        hidden
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-muted">{row.category}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(row.price, currency)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(row.costPrice, currency)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(row.unitProfit, currency)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-medium tabular-nums",
                      row.margin === null
                        ? "text-muted"
                        : row.margin < 20
                          ? "text-danger"
                          : row.margin < 40
                            ? "text-warning"
                            : "text-success",
                    )}
                  >
                    {row.margin === null ? "—" : `${row.margin}%`}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.qtySold}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(row.revenue, currency)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(row.profit, currency)}
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
