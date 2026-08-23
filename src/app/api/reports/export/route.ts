import { handleApiError, requireApiRole } from "@/lib/api-auth";
import { getSettings } from "@/lib/settings";
import { toDecimalString } from "@/lib/money";
import {
  buildCostReport,
  buildSalesReport,
  rangeFromParams,
  toDateInput,
} from "@/lib/reports";

/** RFC 4180 quoting: wrap in quotes and double any embedded quote. */
function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/**
 * GET /api/reports/export?type=sales|costs&from=&to=
 * Money columns are plain decimals so the file opens cleanly in Excel.
 */
export async function GET(request: Request) {
  try {
    await requireApiRole(["MANAGER"]);

    const url = new URL(request.url);
    const type = url.searchParams.get("type") === "costs" ? "costs" : "sales";
    const range = rangeFromParams(
      url.searchParams.get("from") ?? undefined,
      url.searchParams.get("to") ?? undefined,
    );
    const settings = await getSettings();

    let rows: (string | number)[][];

    if (type === "costs") {
      const report = await buildCostReport(range);
      rows = [
        [
          "Item",
          "Category",
          `Price (${settings.CURRENCY_SYMBOL})`,
          `Cost (${settings.CURRENCY_SYMBOL})`,
          `Profit per unit (${settings.CURRENCY_SYMBOL})`,
          "Margin %",
          "Qty sold",
          `Revenue (${settings.CURRENCY_SYMBOL})`,
          `Profit (${settings.CURRENCY_SYMBOL})`,
          "On menu",
        ],
        ...report.map((row) => [
          row.name,
          row.category,
          toDecimalString(row.price),
          toDecimalString(row.costPrice),
          toDecimalString(row.unitProfit),
          row.margin === null ? "" : row.margin,
          row.qtySold,
          toDecimalString(row.revenue),
          toDecimalString(row.profit),
          row.available ? "yes" : "no",
        ]),
      ];
    } else {
      const report = await buildSalesReport(range);
      rows = [
        [
          "Date",
          "Orders",
          `Revenue (${settings.CURRENCY_SYMBOL})`,
          `Profit (${settings.CURRENCY_SYMBOL})`,
        ],
        ...report.daily.map((point) => [
          point.date,
          point.orders,
          toDecimalString(point.revenue),
          toDecimalString(point.profit),
        ]),
        [],
        ["Totals", report.summary.orderCount,
          toDecimalString(report.summary.revenue),
          toDecimalString(report.summary.profit)],
        [],
        ["Item", "Qty sold", `Revenue (${settings.CURRENCY_SYMBOL})`, `Profit (${settings.CURRENCY_SYMBOL})`],
        ...report.topItems.map((item) => [
          item.name,
          item.qty,
          toDecimalString(item.revenue),
          toDecimalString(item.profit),
        ]),
        [],
        ["Department", "Orders", `Revenue (${settings.CURRENCY_SYMBOL})`],
        ...report.byDepartment.map((row) => [
          row.department,
          row.orders,
          toDecimalString(row.revenue),
        ]),
        [],
        ["Employee", "Employee ID", "Department", "Orders", `Total (${settings.CURRENCY_SYMBOL})`],
        ...report.byEmployee.map((row) => [
          row.name,
          row.code,
          row.department ?? "",
          row.orders,
          toDecimalString(row.revenue),
        ]),
      ];
    }

    const filename = `lsaf-${type}-${toDateInput(range.from)}-to-${toDateInput(range.to)}.csv`;

    // The BOM makes Excel read the file as UTF-8 rather than the local codepage.
    return new Response(`﻿${toCsv(rows)}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
