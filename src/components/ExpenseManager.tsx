"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import {
  Card,
  EmptyState,
  buttonDanger,
  buttonPrimary,
  buttonSecondary,
  cn,
  inputClass,
  labelClass,
} from "@/components/ui";

export type CategoryRow = {
  id: string;
  name: string;
  active: boolean;
};

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
  initialCategories,
  currency,
}: {
  initialExpenses: ExpenseRow[];
  initialCategories: CategoryRow[];
  currency: string;
}) {
  const router = useRouter();
  const [expenses, setExpenses] = useState(initialExpenses);
  const [categories, setCategories] = useState(initialCategories);
  const active = categories.filter((c) => c.active);
  const [category, setCategory] = useState<string>(active[0]?.name ?? "");
  const [newCategory, setNewCategory] = useState("");
  const [managingCategories, setManagingCategories] = useState(false);
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

  async function addCategory(event: React.FormEvent) {
    event.preventDefault();
    const name = newCategory.trim();
    if (!name) return;
    const res = await fetch("/api/expense-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = (await res.json()) as { error?: string; category?: CategoryRow };
    if (!res.ok || !data.category) {
      setMessage({ tone: "bad", text: data.error ?? "Could not add it." });
      return;
    }
    setCategories((prev) => [...prev, data.category!]);
    setCategory(data.category.name);
    setNewCategory("");
    setMessage({ tone: "ok", text: `Added ${data.category.name}.` });
    router.refresh();
  }

  async function setCategoryActive(row: CategoryRow, next: boolean) {
    const res = await fetch(`/api/expense-categories/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: next }),
    });
    const data = (await res.json()) as { error?: string; category?: CategoryRow };
    if (!res.ok || !data.category) {
      setMessage({ tone: "bad", text: data.error ?? "Could not update it." });
      return;
    }
    setCategories((prev) =>
      prev.map((c) => (c.id === row.id ? data.category! : c)),
    );
    // The form may have been sitting on a category that was just retired.
    if (!next && category === row.name) {
      const fallback = categories.find((c) => c.active && c.id !== row.id);
      if (fallback) setCategory(fallback.name);
    }
    router.refresh();
  }

  async function renameCategory(row: CategoryRow) {
    const name = prompt(`Rename "${row.name}" to:`, row.name)?.trim();
    if (!name || name === row.name) return;
    const res = await fetch(`/api/expense-categories/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = (await res.json()) as { error?: string; category?: CategoryRow };
    if (!res.ok || !data.category) {
      setMessage({ tone: "bad", text: data.error ?? "Could not rename it." });
      return;
    }
    setCategories((prev) =>
      prev.map((c) => (c.id === row.id ? data.category! : c)),
    );
    if (category === row.name) setCategory(data.category.name);
    setMessage({
      tone: "ok",
      text: `Renamed to ${data.category.name}. Past expenses keep the old name.`,
    });
    router.refresh();
  }

  async function removeCategory(row: CategoryRow) {
    if (!confirm(`Remove the "${row.name}" category?`)) return;
    const res = await fetch(`/api/expense-categories/${row.id}`, {
      method: "DELETE",
    });
    const data = (await res.json()) as {
      error?: string;
      retired?: boolean;
      message?: string;
      category?: CategoryRow;
    };
    if (!res.ok) {
      setMessage({ tone: "bad", text: data.error ?? "Could not remove it." });
      return;
    }
    if (data.retired && data.category) {
      setCategories((prev) =>
        prev.map((c) => (c.id === row.id ? data.category! : c)),
      );
      setMessage({ tone: "ok", text: data.message ?? "Category retired." });
    } else {
      setCategories((prev) => prev.filter((c) => c.id !== row.id));
      setMessage({ tone: "ok", text: `Deleted ${row.name}.` });
    }
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
                {active.map((option) => (
                  <option key={option.id} value={option.name}>
                    {option.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="mt-1 text-xs text-muted underline underline-offset-2"
                onClick={() => setManagingCategories((v) => !v)}
              >
                {managingCategories ? "Done editing categories" : "Edit categories"}
              </button>
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

        {managingCategories ? (
          <Card className="mt-4 p-4">
            <h2 className="font-semibold">Categories</h2>
            <p className="mt-1 text-xs text-muted">
              Renaming or retiring one never changes expenses already filed —
              they keep the name they were saved with.
            </p>

            <form onSubmit={addCategory} className="mt-3 flex gap-2">
              <input
                className={inputClass}
                placeholder="Transport"
                value={newCategory}
                maxLength={40}
                onChange={(e) => setNewCategory(e.target.value)}
                aria-label="New category name"
              />
              <button type="submit" className={buttonSecondary}>
                Add
              </button>
            </form>

            <ul className="mt-3 space-y-1">
              {categories.map((row) => (
                <li
                  key={row.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
                    row.active ? "" : "opacity-55",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {row.name}
                    {!row.active ? (
                      <span className="ml-1 text-xs text-muted">(retired)</span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-muted underline underline-offset-2 hover:text-foreground"
                    onClick={() => renameCategory(row)}
                  >
                    Rename
                  </button>
                  {row.active ? (
                    <button
                      type="button"
                      className="text-xs text-danger underline underline-offset-2"
                      onClick={() => removeCategory(row)}
                    >
                      Remove
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="text-xs text-success underline underline-offset-2"
                      onClick={() => setCategoryActive(row, true)}
                    >
                      Restore
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </aside>
    </div>
  );
}
