"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/money";
import {
  ORDER_STATUSES,
  STATUS_LABELS,
  STATUS_TRANSITIONS,
  type OrderStatus,
} from "@/lib/types";
import {
  Card,
  EmptyState,
  StatusBadge,
  buttonDanger,
  buttonPrimary,
  buttonSecondary,
  cn,
} from "@/components/ui";

export type BoardOrder = {
  id: number;
  status: string;
  subtotal: number;
  notes: string | null;
  createdAt: string;
  staff: { name: string; code: string; department: string | null };
  items: { id: string; nameSnapshot: string; qty: number; notes: string | null }[];
};

const POLL_MS = 10_000;

/** Columns the counter actually works from; finished orders go in the history. */
const ACTIVE: OrderStatus[] = ["PENDING", "PREPARING", "READY"];

export function OrderBoard({
  initialOrders,
  currency,
}: {
  initialOrders: BoardOrder[];
  currency: string;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  // Skip a poll result that lands while a status change is still in flight,
  // otherwise the board would flicker back to the old status.
  const busyRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (busyRef.current !== null) return;
    try {
      const res = await fetch("/api/orders?scope=all", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { orders?: BoardOrder[] };
      if (data.orders) setOrders(data.orders);
    } catch {
      // A dropped poll is harmless; the next tick will catch up.
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  async function move(order: BoardOrder, next: OrderStatus) {
    setBusyId(order.id);
    busyRef.current = order.id;
    setError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not update the order.");
        return;
      }
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: next } : o)),
      );
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusyId(null);
      busyRef.current = null;
      void refresh();
    }
  }

  const active = orders.filter((o) =>
    ACTIVE.includes(o.status as OrderStatus),
  );
  const history = orders.filter(
    (o) => !ACTIVE.includes(o.status as OrderStatus),
  );

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {active.length === 0 ? (
        <EmptyState title="Nothing waiting" hint="New orders appear here automatically." />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {ACTIVE.map((status) => {
            const column = active.filter((o) => o.status === status);
            return (
              <section key={status}>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
                  {STATUS_LABELS[status]}
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs tabular-nums">
                    {column.length}
                  </span>
                </h2>
                <div className="space-y-3">
                  {column.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      currency={currency}
                      busy={busyId === order.id}
                      onMove={move}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <div>
        <button
          type="button"
          className={buttonSecondary}
          onClick={() => setShowHistory((v) => !v)}
        >
          {showHistory ? "Hide" : "Show"} completed &amp; cancelled ({history.length})
        </button>

        {showHistory ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {history.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                currency={currency}
                busy={false}
                onMove={move}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function OrderCard({
  order,
  currency,
  busy,
  onMove,
}: {
  order: BoardOrder;
  currency: string;
  busy: boolean;
  onMove: (order: BoardOrder, next: OrderStatus) => void;
}) {
  const status = order.status as OrderStatus;
  const nextStatuses = ORDER_STATUSES.includes(status)
    ? STATUS_TRANSITIONS[status]
    : [];

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">#{order.id}</p>
          <p className="text-sm text-muted">
            {order.staff.name}
            {order.staff.department ? ` · ${order.staff.department}` : ""}
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      <ul className="mt-3 space-y-1 text-sm">
        {order.items.map((item) => (
          <li key={item.id}>
            <span className="font-medium tabular-nums">{item.qty}×</span>{" "}
            {item.nameSnapshot}
            {item.notes ? (
              <span className="text-muted italic"> — {item.notes}</span>
            ) : null}
          </li>
        ))}
      </ul>

      {order.notes ? (
        <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          📝 {order.notes}
        </p>
      ) : null}

      <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3 text-sm">
        <span className="text-muted">
          {new Date(order.createdAt).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <span className="font-semibold tabular-nums">
          {formatMoney(order.subtotal, currency)}
        </span>
      </div>

      {nextStatuses.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {nextStatuses.map((next) => (
            <button
              key={next}
              type="button"
              disabled={busy}
              className={cn(
                "flex-1",
                next === "CANCELLED" ? buttonDanger : buttonPrimary,
              )}
              onClick={() => onMove(order, next)}
            >
              {next === "CANCELLED"
                ? "Reject"
                : next === "PREPARING"
                  ? "Accept"
                  : `Mark ${STATUS_LABELS[next].toLowerCase()}`}
            </button>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
