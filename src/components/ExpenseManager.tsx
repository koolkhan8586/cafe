"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import {
  Card,
  EmptyState,
  buttonDanger,
  buttonPrimary,
  cn,
  inputClass,
  labelClass,
} from "@/components/ui";

export type ExpenseRow = {
  id: string;
  category: string;
  amount: number;
  spentAt: string;
  note: string | null;
  createdByName: string | null;
};

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ExpenseManager({
  initialExpenses,
  currency,
}: {
  initialExpenses: ExpenseRow[];
  currency: string;
}) {
  const router = useRouter();
  const [expenses, setExpenses] = useState(initialExpenses);
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [spentAt, setSpentAt] = useState(today());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(
    null,
  );

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, amount, spentAt, note }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage({ tone: "bad", text: data.error ?? "Could not save." });
        return;
      }
      setAmount("");
      setNote("");
      setMessage({ tone: "ok", text: "Expense added." });
      // The list is date-filtered on the server, so refresh rather than
      // guessing whether the new entry belongs in the current range.
      router.refresh();
    } catch {
      setMessage({ tone: "bad", text: "Network problem. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function remove(expense: ExpenseRow) {
    if (
      !confirm(
        `Delete the ${formatMoney(expense.amount, currency)} ${expense.category.toLowerCase()} expense from ${expense.spentAt}?`,
      )
    ) {
      return;
    }
    const res = await fetch(`/api/expenses/${expense.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setMessage({ tone: "bad", text: data.error ?? "Could not delete." });
      return;
    }
    setExpenses((prev) => prev.filter((e) => e.id !== expense.id));
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div>
        {message ? (
          <p
            role="status"
            className={cn(
              "mb-4 rounded-lg px-3 py-2 text-sm",
              message.tone === "ok"
                ? "bg-success-soft text-success"
                : "bg-danger-soft text-danger",
            )}
          >
            {message.text}
          </p>
        ) : null}

        {expenses.length === 0 ? (
          <EmptyState
            title="No expenses in this range"
            hint="Add one on the right, or widen the dates."
            icon="🧾"
          />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Note</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--border)]">
                {expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td className="px-3 py-2 whitespace-nowrap text-muted">
                      {expense.spentAt}
                    </td>
                    <td className="px-3 py-2 font-medium">{expense.category}</td>
                    <td className="px-3 py-2 text-muted">
                      {expense.note ?? "—"}
                      {expense.createdByName ? (
                        <span className="block text-xs">
                          by {expense.createdByName}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatMoney(expense.amount, currency)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className={buttonDanger}
                        onClick={() => remove(expense)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Card className="p-4">
          <h2 className="mb-3 font-semibold">Add an expense</h2>
          <form onSubmit={add} className="space-y-3">
            <div>
              <label className={labelClass} htmlFor="expense-category">
                Category
              </label>
              <select
                id="expense-category"
                className={inputClass}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {EXPENSE_CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass} htmlFor="expense-amount">
                Amount ({currency})
              </label>
              <input
                id="expense-amount"
                type="number"
                step="0.01"
                min="0"
                className={inputClass}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="expense-date">
                Date spent
              </label>
              <input
                id="expense-date"
                type="date"
                className={inputClass}
                value={spentAt}
                onChange={(e) => setSpentAt(e.target.value)}
                required
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="expense-note">
                Note
              </label>
              <input
                id="expense-note"
                className={inputClass}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Milk and sugar from the market"
                maxLength={300}
              />
            </div>

            <button type="submit" className={`${buttonPrimary} w-full`} disabled={busy}>
              {busy ? "Saving…" : "Add expense"}
            </button>
          </form>
        </Card>
      </aside>
    </div>
  );
}
