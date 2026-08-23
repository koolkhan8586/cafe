import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatMoney, marginPercent } from "@/lib/money";
import { buildSalesReport, rangeFromParams, toDateInput } from "@/lib/reports";
import { Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { RangePicker } from "@/components/RangePicker";
import { RevenueChart } from "@/components/RevenueChart";

export const dynamic = "force-dynamic";

export default async function ManagerPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireRole(["MANAGER"], "/manager");

  const params = await searchParams;
  const range = rangeFromParams(params.from, params.to);
  const [settings, report] = await Promise.all([
    getSettings(),
    buildSalesReport(range),
  ]);

  const currency = settings.CURRENCY_SYMBOL;
  const { summary } = report;
  const margin = marginPercent(summary.revenue, summary.cost);

  const exportHref = `/api/reports/export?from=${toDateInput(range.from)}&to=${toDateInput(range.to)}`;

  return (
    <>
      <PageHeader
        title="Sales"
        subtitle="Cancelled orders are excluded from every figure on this page."
      />

      <RangePicker
        from={toDateInput(range.from)}
        to={toDateInput(range.to)}
        basePath="/manager"
        exportHref={exportHref}
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Revenue" value={formatMoney(summary.revenue, currency)} />
        <Stat
          label="Profit"
          value={formatMoney(summary.profit, currency)}
          hint={margin === null ? undefined : `${margin}% margin`}
          tone={summary.profit >= 0 ? "positive" : "negative"}
        />
        <Stat
          label="Orders"
          value={String(summary.orderCount)}
          hint={
            summary.cancelledCount > 0
              ? `${summary.cancelledCount} cancelled, not counted`
              : `${summary.itemCount} items`
          }
        />
        <Stat
          label="Average order"
          value={formatMoney(summary.averageOrder, currency)}
        />
      </div>

      {report.daily.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No orders in this range"
            hint="Widen the dates, or wait for the counter to take some orders."
            icon="📊"
          />
        </div>
      ) : (
        <>
          <Card className="mt-6 p-4">
            <h2 className="mb-4 font-semibold">Revenue by day</h2>
            <RevenueChart points={report.daily} currency={currency} />
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card className="p-4">
              <h2 className="mb-3 font-semibold">Top sellers</h2>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="pb-2">Item</th>
                    <th className="pb-2 text-right">Sold</th>
                    <th className="pb-2 text-right">Revenue</th>
                    <th className="pb-2 text-right">Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--border)]">
                  {report.topItems.slice(0, 10).map((item) => (
                    <tr key={item.name}>
                      <td className="py-2 pr-2">{item.name}</td>
                      <td className="py-2 text-right tabular-nums">{item.qty}</td>
                      <td className="py-2 text-right tabular-nums">
                        {formatMoney(item.revenue, currency)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatMoney(item.profit, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card className="p-4">
              <h2 className="mb-3 font-semibold">By department</h2>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="pb-2">Department</th>
                    <th className="pb-2 text-right">Orders</th>
                    <th className="pb-2 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--border)]">
                  {report.byDepartment.map((row) => (
                    <tr key={row.department}>
                      <td className="py-2 pr-2">{row.department}</td>
                      <td className="py-2 text-right tabular-nums">{row.orders}</td>
                      <td className="py-2 text-right tabular-nums">
                        {formatMoney(row.revenue, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          <Card className="mt-6 overflow-x-auto p-4">
            <h2 className="mb-3 font-semibold">By employee</h2>
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="pb-2">Employee</th>
                  <th className="pb-2">Department</th>
                  <th className="pb-2 text-right">Orders</th>
                  <th className="pb-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--border)]">
                {report.byEmployee.map((row) => (
                  <tr key={row.code}>
                    <td className="py-2 pr-2">
                      {row.name}{" "}
                      <span className="font-mono text-xs text-muted">{row.code}</span>
                    </td>
                    <td className="py-2 text-muted">{row.department ?? "—"}</td>
                    <td className="py-2 text-right tabular-nums">{row.orders}</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatMoney(row.revenue, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}
