"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/money";

/**
 * Daily revenue as stacked bars: cost at the base, profit on top, so the full
 * bar height reads as revenue and the split reads as where the money went.
 *
 * Series colours come from --series-profit / --series-cost in globals.css:
 * categorical slots 1 and 2 of the validated default palette, with dark-mode
 * steps chosen for the dark surface.
 */

export type Point = {
  date: string;
  revenue: number;
  profit: number;
  orders: number;
};

const PLOT_HEIGHT = 200;
const TOP_PAD = 12;
const BOTTOM_PAD = 28;
const LEFT_PAD = 64;
const RIGHT_PAD = 8;
const SEGMENT_GAP = 2;
const CORNER = 4;

export function RevenueChart({
  points,
  currency,
}: {
  points: Point[];
  currency: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const max = useMemo(
    () => Math.max(1, ...points.map((p) => p.revenue)),
    [points],
  );
  const ticks = useMemo(() => niceTicks(max), [max]);
  const axisMax = ticks[ticks.length - 1];

  // Spread a short range across a comfortable width instead of leaving one
  // lonely bar at the left edge; a long range scrolls horizontally instead.
  const count = Math.max(1, points.length);
  const plotWidth = Math.max(560, count * 44);
  const bandWidth = plotWidth / count;
  const width = LEFT_PAD + RIGHT_PAD + plotWidth;
  const height = PLOT_HEIGHT + TOP_PAD + BOTTOM_PAD;
  const barWidth = Math.min(48, bandWidth * 0.6);

  const y = (value: number) =>
    TOP_PAD + PLOT_HEIGHT - (value / axisMax) * PLOT_HEIGHT;

  const active = hover === null ? null : points[hover];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
        <LegendSwatch className="bg-series-profit" label="Profit" />
        <LegendSwatch className="bg-series-cost" label="Cost" />
      </div>

      <div className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label={`Revenue by day, ${points.length} days, peak ${formatMoney(max, currency)}`}
          className="max-w-full"
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={LEFT_PAD}
                x2={width - RIGHT_PAD}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={LEFT_PAD - 8}
                y={y(tick) + 4}
                textAnchor="end"
                fontSize={11}
                fill="var(--muted)"
              >
                {shortMoney(tick, currency)}
              </text>
            </g>
          ))}

          {points.map((point, index) => {
            const bandX = LEFT_PAD + index * bandWidth;
            const x = bandX + (bandWidth - barWidth) / 2;
            const revenueTop = y(point.revenue);
            const total = TOP_PAD + PLOT_HEIGHT - revenueTop;
            // A negative profit means cost overran revenue; the bar then shows
            // revenue entirely as cost and the tooltip carries the real number.
            const profitShare =
              point.profit > 0 ? Math.min(point.profit / point.revenue, 1) : 0;
            const profitHeight = Math.max(0, total * profitShare - SEGMENT_GAP);
            const costHeight = Math.max(0, total - profitHeight - SEGMENT_GAP);

            return (
              <g
                key={point.date}
                onMouseEnter={() => setHover(index)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(index)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                role="button"
                aria-label={`${point.date}: revenue ${formatMoney(point.revenue, currency)}, profit ${formatMoney(point.profit, currency)}`}
                className="outline-none"
              >
                {/* Full-band hit target so the tooltip is easy to catch. */}
                <rect
                  x={bandX}
                  y={TOP_PAD}
                  width={bandWidth}
                  height={PLOT_HEIGHT}
                  fill={hover === index ? "var(--surface-muted)" : "transparent"}
                />
                {profitHeight > 0 ? (
                  <rect
                    x={x}
                    y={revenueTop}
                    width={barWidth}
                    height={profitHeight}
                    rx={CORNER}
                    fill="var(--series-profit)"
                  />
                ) : null}
                <rect
                  x={x}
                  y={TOP_PAD + PLOT_HEIGHT - costHeight}
                  width={barWidth}
                  height={costHeight}
                  rx={profitHeight > 0 ? 0 : CORNER}
                  fill="var(--series-cost)"
                />
              </g>
            );
          })}

          <line
            x1={LEFT_PAD}
            x2={width - RIGHT_PAD}
            y1={TOP_PAD + PLOT_HEIGHT}
            y2={TOP_PAD + PLOT_HEIGHT}
            stroke="var(--border)"
            strokeWidth={1}
          />

          {points.map((point, index) => {
            // Label only the ends and the hovered day, so the axis stays quiet.
            const show =
              index === 0 || index === points.length - 1 || hover === index;
            if (!show) return null;
            return (
              <text
                key={`label-${point.date}`}
                x={LEFT_PAD + index * bandWidth + bandWidth / 2}
                y={height - 8}
                textAnchor="middle"
                fontSize={11}
                fill="var(--muted)"
              >
                {point.date.slice(5)}
              </text>
            );
          })}
        </svg>

        {/* Fixed height so showing and hiding the tooltip does not shift the
            page underneath the chart. */}
        <div className="mt-3 min-h-[5.5rem]">
          {active ? (
            <div className="pointer-events-none inline-block rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm shadow-sm">
              <p className="font-medium">{active.date}</p>
              <p className="text-muted">
                Revenue{" "}
              <span className="font-semibold tabular-nums text-foreground">
                {formatMoney(active.revenue, currency)}
              </span>
            </p>
              <p className="text-muted">
                Profit{" "}
              <span className="font-semibold tabular-nums text-foreground">
                {formatMoney(active.profit, currency)}
              </span>{" "}
              · cost{" "}
              <span className="tabular-nums">
                {formatMoney(active.revenue - active.profit, currency)}
              </span>
            </p>
              <p className="text-muted">
                {active.orders} order{active.orders === 1 ? "" : "s"}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">
              Hover a bar for that day&rsquo;s revenue, profit and order count.
            </p>
          )}
        </div>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-muted">
          View as a table
        </summary>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="pb-2">Date</th>
              <th className="pb-2 text-right">Orders</th>
              <th className="pb-2 text-right">Revenue</th>
              <th className="pb-2 text-right">Profit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--border)]">
            {points.map((point) => (
              <tr key={point.date}>
                <td className="py-1.5">{point.date}</td>
                <td className="py-1.5 text-right tabular-nums">{point.orders}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatMoney(point.revenue, currency)}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatMoney(point.profit, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`h-3 w-3 rounded-sm ${className}`} aria-hidden />
      <span className="text-muted">{label}</span>
    </span>
  );
}

/**
 * Ticks a human would choose: a 1/2/2.5/5 step at the right magnitude, giving
 * three or four gridlines whose labels are round numbers rather than 667s.
 */
function niceTicks(max: number): number[] {
  const target = 4;
  const rough = max / target;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const step =
    [1, 2, 2.5, 5, 10].find((m) => m * magnitude >= rough)! * magnitude;
  const ticks: number[] = [];
  for (let value = 0; value < max + step; value += step) {
    ticks.push(Math.round(value));
  }
  return ticks;
}

/** Axis labels drop the minor units: "Rs 12k" rather than "Rs 12,000.00". */
function shortMoney(minor: number, currency: string): string {
  const major = minor / 100;
  if (major >= 1000) return `${currency} ${Math.round(major / 100) / 10}k`;
  return `${currency} ${Math.round(major)}`;
}
