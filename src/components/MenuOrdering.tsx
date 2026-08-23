"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import {
  Card,
  buttonPrimary,
  buttonSecondary,
  cn,
  inputClass,
} from "@/components/ui";

export type MenuItemView = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  available: boolean;
};

export type MenuCategory = {
  id: string;
  name: string;
  items: MenuItemView[];
};

type CartLine = { item: MenuItemView; qty: number; notes: string };

type SubmitState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done"; orderId: number; whatsapp: "SENT" | "SKIPPED" | "FAILED" }
  | { kind: "error"; message: string };

export function MenuOrdering({
  categories,
  currency,
}: {
  categories: MenuCategory[];
  currency: string;
}) {
  const router = useRouter();
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [orderNotes, setOrderNotes] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>(categories[0]?.id ?? "");
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  const lines = useMemo(() => Object.values(cart), [cart]);
  const total = useMemo(
    () => lines.reduce((sum, line) => sum + line.item.price * line.qty, 0),
    [lines],
  );
  const itemCount = useMemo(
    () => lines.reduce((sum, line) => sum + line.qty, 0),
    [lines],
  );

  function changeQty(item: MenuItemView, delta: number) {
    setState({ kind: "idle" });
    setCart((prev) => {
      const existing = prev[item.id];
      const qty = (existing?.qty ?? 0) + delta;
      if (qty <= 0) {
        const rest = { ...prev };
        delete rest[item.id];
        return rest;
      }
      return {
        ...prev,
        [item.id]: { item, qty: Math.min(qty, 50), notes: existing?.notes ?? "" },
      };
    });
  }

  function setLineNotes(itemId: string, notes: string) {
    setCart((prev) =>
      prev[itemId] ? { ...prev, [itemId]: { ...prev[itemId], notes } } : prev,
    );
  }

  async function placeOrder() {
    if (lines.length === 0) return;
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map((line) => ({
            menuItemId: line.item.id,
            qty: line.qty,
            notes: line.notes.trim() || undefined,
          })),
          notes: orderNotes.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        order?: { id: number };
        notification?: { status: "SENT" | "SKIPPED" | "FAILED" };
      };
      if (!res.ok || !data.order) {
        setState({ kind: "error", message: data.error ?? "Could not place the order." });
        return;
      }
      setCart({});
      setOrderNotes("");
      setState({
        kind: "done",
        orderId: data.order.id,
        whatsapp: data.notification?.status ?? "SKIPPED",
      });
      router.refresh();
    } catch {
      setState({ kind: "error", message: "Network problem. Try again." });
    }
  }

  const shown = categories.find((c) => c.id === activeCategory) ?? categories[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div>
        <div className="mb-4 flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setActiveCategory(category.id)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition",
                category.id === shown?.id
                  ? "bg-brand text-on-brand"
                  : "border border-border-subtle hover:bg-surface-muted",
              )}
            >
              {category.name}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {shown?.items.map((item) => {
            const qty = cart[item.id]?.qty ?? 0;
            return (
              <Card
                key={item.id}
                className={cn(
                  "flex flex-col p-4",
                  !item.available && "opacity-60",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    {item.description ? (
                      <p className="mt-0.5 text-sm text-muted">{item.description}</p>
                    ) : null}
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums">
                    {formatMoney(item.price, currency)}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  {item.available ? (
                    qty === 0 ? (
                      <button
                        type="button"
                        className={buttonSecondary}
                        onClick={() => changeQty(item, 1)}
                      >
                        Add
                      </button>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          aria-label={`Remove one ${item.name}`}
                          className="h-8 w-8 rounded-lg border border-border-subtle text-lg leading-none hover:bg-surface-muted"
                          onClick={() => changeQty(item, -1)}
                        >
                          −
                        </button>
                        <span className="w-6 text-center font-semibold tabular-nums">
                          {qty}
                        </span>
                        <button
                          type="button"
                          aria-label={`Add one ${item.name}`}
                          className="h-8 w-8 rounded-lg border border-border-subtle text-lg leading-none hover:bg-surface-muted"
                          onClick={() => changeQty(item, 1)}
                        >
                          +
                        </button>
                      </div>
                    )
                  ) : (
                    <span className="text-sm font-medium text-danger">
                      Not available today
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Card className="p-4">
          <h2 className="font-semibold">
            Your order{" "}
            {itemCount > 0 ? (
              <span className="text-muted">· {itemCount} item{itemCount === 1 ? "" : "s"}</span>
            ) : null}
          </h2>

          {lines.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              Nothing added yet. Tap “Add” on anything you fancy.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {lines.map((line) => (
                <li key={line.item.id} className="border-b border-border-subtle pb-3 last:border-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">
                      {line.qty} × {line.item.name}
                    </span>
                    <span className="text-sm tabular-nums">
                      {formatMoney(line.item.price * line.qty, currency)}
                    </span>
                  </div>
                  <input
                    className={`${inputClass} mt-2 py-1 text-xs`}
                    placeholder="Extra sugar, no ice…"
                    value={line.notes}
                    maxLength={200}
                    onChange={(e) => setLineNotes(line.item.id, e.target.value)}
                    aria-label={`Note for ${line.item.name}`}
                  />
                </li>
              ))}
            </ul>
          )}

          {lines.length > 0 ? (
            <>
              <div className="mt-4">
                <label className="mb-1.5 block text-sm font-medium" htmlFor="order-notes">
                  Note for the counter
                </label>
                <textarea
                  id="order-notes"
                  rows={2}
                  className={inputClass}
                  placeholder="Deliver to 2nd floor meeting room"
                  maxLength={500}
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                />
              </div>

              <div className="mt-4 flex items-baseline justify-between border-t border-border-subtle pt-3">
                <span className="font-medium">Total</span>
                <span className="text-lg font-semibold tabular-nums">
                  {formatMoney(total, currency)}
                </span>
              </div>

              <button
                type="button"
                className={`${buttonPrimary} mt-4 w-full`}
                onClick={placeOrder}
                disabled={state.kind === "sending"}
              >
                {state.kind === "sending" ? "Sending…" : "Place order"}
              </button>
            </>
          ) : null}

          {state.kind === "error" ? (
            <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {state.message}
            </p>
          ) : null}

          {state.kind === "done" ? (
            <div className="mt-3 rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
              <p className="font-medium">Order #{state.orderId} is in.</p>
              <p className="mt-0.5">
                {state.whatsapp === "SENT"
                  ? "The counter has been notified on WhatsApp."
                  : "Saved — but the WhatsApp alert did not go out, so tell the counter if it is urgent."}
              </p>
            </div>
          ) : null}
        </Card>
      </aside>
    </div>
  );
}
