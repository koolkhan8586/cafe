import type { ReactNode } from "react";
import { STATUS_LABELS, type OrderStatus } from "@/lib/types";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border-subtle bg-surface shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  icon = "☕",
}: {
  title: string;
  hint?: string;
  icon?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border-subtle p-10 text-center">
      <div className="text-3xl" aria-hidden>
        {icon}
      </div>
      <p className="mt-3 font-medium">{title}</p>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

const STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING: "bg-warning-soft text-warning",
  PREPARING: "bg-info-soft text-info",
  READY: "bg-success-soft text-success",
  COMPLETED: "bg-surface-muted text-muted",
  CANCELLED: "bg-danger-soft text-danger",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        STATUS_STYLES[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-success"
      : tone === "negative"
        ? "text-danger"
        : "text-foreground";
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums", toneClass)}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}

export const inputClass =
  "w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25 disabled:opacity-60";

export const labelClass = "block text-sm font-medium mb-1.5";

export const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-55";

export const buttonPrimary = cn(
  buttonBase,
  "bg-brand text-on-brand hover:bg-brand-strong",
);

export const buttonSecondary = cn(
  buttonBase,
  "border border-border-subtle bg-surface hover:bg-surface-muted",
);

export const buttonDanger = cn(
  buttonBase,
  "border border-danger/30 bg-danger-soft text-danger hover:bg-danger/15",
);
