"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, buttonPrimary, buttonSecondary, inputClass } from "@/components/ui";

const PRESETS: { label: string; days: number }[] = [
  { label: "Today", days: 0 },
  { label: "7 days", days: 6 },
  { label: "30 days", days: 29 },
  { label: "90 days", days: 89 },
];

function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function RangePicker({
  from,
  to,
  basePath,
  exportHref,
}: {
  from: string;
  to: string;
  basePath: string;
  exportHref?: string;
}) {
  const router = useRouter();
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);

  function apply(nextFrom: string, nextTo: string) {
    setStart(nextFrom);
    setEnd(nextTo);
    router.push(`${basePath}?from=${nextFrom}&to=${nextTo}`);
  }

  function applyPreset(days: number) {
    const today = new Date();
    const past = new Date(today.getTime() - days * 86_400_000);
    apply(isoDay(past), isoDay(today));
  }

  return (
    <Card className="flex flex-wrap items-end gap-3 p-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted" htmlFor="range-from">
          From
        </label>
        <input
          id="range-from"
          type="date"
          className={inputClass}
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted" htmlFor="range-to">
          To
        </label>
        <input
          id="range-to"
          type="date"
          className={inputClass}
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
      </div>

      <button type="button" className={buttonPrimary} onClick={() => apply(start, end)}>
        Apply
      </button>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={buttonSecondary}
            onClick={() => applyPreset(preset.days)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {exportHref ? (
        <a href={exportHref} className={`${buttonSecondary} ml-auto`} download>
          Export CSV
        </a>
      ) : null}
    </Card>
  );
}
