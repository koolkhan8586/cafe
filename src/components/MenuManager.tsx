"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney, marginPercent, toDecimalString } from "@/lib/money";
import {
  Card,
  buttonDanger,
  buttonPrimary,
  buttonSecondary,
  cn,
  inputClass,
  labelClass,
} from "@/components/ui";

export type ManagedItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  costPrice: number;
  available: boolean;
  categoryId: string;
};

type CategoryRef = { id: string; name: string };

type Draft = {
  name: string;
  description: string;
  price: string;
  costPrice: string;
  categoryId: string;
  available: boolean;
};

function emptyDraft(categoryId: string): Draft {
  return {
    name: "",
    description: "",
    price: "",
    costPrice: "",
    categoryId,
    available: true,
  };
}

function draftFrom(item: ManagedItem): Draft {
  return {
    name: item.name,
    description: item.description ?? "",
    price: toDecimalString(item.price),
    costPrice: toDecimalString(item.costPrice),
    categoryId: item.categoryId,
    available: item.available,
  };
}

export function MenuManager({
  initialItems,
  initialCategories,
  currency,
}: {
  initialItems: ManagedItem[];
  initialCategories: CategoryRef[];
  currency: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [categories, setCategories] = useState(initialCategories);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft(initialCategories[0]?.id ?? ""));
  const [newCategory, setNewCategory] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const grouped = useMemo(() => {
    return categories.map((category) => ({
      category,
      items: items.filter((item) => item.categoryId === category.id),
    }));
  }, [categories, items]);

  function startCreate() {
    setEditingId(null);
    setDraft(emptyDraft(categories[0]?.id ?? ""));
    setMessage(null);
  }

  function startEdit(item: ManagedItem) {
    setEditingId(item.id);
    setDraft(draftFrom(item));
    setMessage(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(
        editingId ? `/api/menu/${editingId}` : "/api/menu",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const data = (await res.json()) as { error?: string; item?: ManagedItem };
      if (!res.ok || !data.item) {
        setMessage({ tone: "bad", text: data.error ?? "Could not save the item." });
        return;
      }
      const saved = data.item;
      setItems((prev) =>
        editingId
          ? prev.map((item) => (item.id === saved.id ? saved : item))
          : [...prev, saved],
      );
      setMessage({
        tone: "ok",
        text: editingId ? `Updated ${saved.name}.` : `Added ${saved.name}.`,
      });
      setEditingId(null);
      setDraft(emptyDraft(categories[0]?.id ?? ""));
      router.refresh();
    } catch {
      setMessage({ tone: "bad", text: "Network problem. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function toggleAvailable(item: ManagedItem) {
    const next = !item.available;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, available: next } : i)),
    );
    const res = await fetch(`/api/menu/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ available: next }),
    });
    if (!res.ok) {
      // Roll the optimistic flip back so the list matches the database.
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, available: !next } : i)),
      );
      setMessage({ tone: "bad", text: "Could not change availability." });
    }
    router.refresh();
  }

  async function remove(item: ManagedItem) {
    if (
      !confirm(
        `Remove "${item.name}" from the menu? If it has been ordered before it will be hidden rather than deleted, so past sales stay intact.`,
      )
    ) {
      return;
    }
    const res = await fetch(`/api/menu/${item.id}`, { method: "DELETE" });
    const data = (await res.json()) as {
      error?: string;
      archived?: boolean;
      message?: string;
    };
    if (!res.ok) {
      setMessage({ tone: "bad", text: data.error ?? "Could not remove the item." });
      return;
    }
    if (data.archived) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, available: false } : i)),
      );
      setMessage({ tone: "ok", text: data.message ?? "Item hidden from the menu." });
    } else {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setMessage({ tone: "ok", text: `Deleted ${item.name}.` });
    }
    router.refresh();
  }

  async function addCategory(event: React.FormEvent) {
    event.preventDefault();
    const name = newCategory.trim();
    if (!name) return;
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = (await res.json()) as { error?: string; category?: CategoryRef };
    if (!res.ok || !data.category) {
      setMessage({ tone: "bad", text: data.error ?? "Could not add the category." });
      return;
    }
    setCategories((prev) => [...prev, data.category!]);
    setNewCategory("");
    setMessage({ tone: "ok", text: `Added category ${data.category.name}.` });
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        {message ? (
          <p
            role="status"
            className={cn(
              "rounded-lg px-3 py-2 text-sm",
              message.tone === "ok"
                ? "bg-success-soft text-success"
                : "bg-danger-soft text-danger",
            )}
          >
            {message.text}
          </p>
        ) : null}

        {grouped.map(({ category, items: categoryItems }) => (
          <section key={category.id}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
              {category.name}
            </h2>
            {categoryItems.length === 0 ? (
              <p className="text-sm text-muted">Nothing in this category yet.</p>
            ) : (
              <Card className="divide-y divide-[color:var(--border)]">
                {categoryItems.map((item) => {
                  const margin = marginPercent(item.price, item.costPrice);
                  return (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center gap-3 p-3"
                    >
                      <div className="min-w-40 flex-1">
                        <p className="font-medium">
                          {item.name}
                          {!item.available ? (
                            <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted">
                              hidden
                            </span>
                          ) : null}
                        </p>
                        {item.description ? (
                          <p className="text-sm text-muted">{item.description}</p>
                        ) : null}
                      </div>

                      <div className="text-right text-sm tabular-nums">
                        <p className="font-semibold">
                          {formatMoney(item.price, currency)}
                        </p>
                        <p className="text-muted">
                          cost {formatMoney(item.costPrice, currency)}
                          {margin === null ? "" : ` · ${margin}%`}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          className={buttonSecondary}
                          onClick={() => toggleAvailable(item)}
                        >
                          {item.available ? "Hide" : "Show"}
                        </button>
                        <button
                          type="button"
                          className={buttonSecondary}
                          onClick={() => startEdit(item)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={buttonDanger}
                          onClick={() => remove(item)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </Card>
            )}
          </section>
        ))}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">
              {editingId ? "Edit item" : "Add an item"}
            </h2>
            {editingId ? (
              <button type="button" className="text-sm text-muted underline" onClick={startCreate}>
                Cancel
              </button>
            ) : null}
          </div>

          <form onSubmit={save} className="space-y-3">
            <div>
              <label className={labelClass} htmlFor="item-name">Name</label>
              <input
                id="item-name"
                className={inputClass}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                required
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="item-desc">Description</label>
              <input
                id="item-desc"
                className={inputClass}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="item-price">
                  Price ({currency})
                </label>
                <input
                  id="item-price"
                  type="number"
                  step="0.01"
                  min="0"
                  className={inputClass}
                  value={draft.price}
                  onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="item-cost">
                  Cost ({currency})
                </label>
                <input
                  id="item-cost"
                  type="number"
                  step="0.01"
                  min="0"
                  className={inputClass}
                  value={draft.costPrice}
                  onChange={(e) => setDraft({ ...draft, costPrice: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="item-category">Category</label>
              <select
                id="item-category"
                className={inputClass}
                value={draft.categoryId}
                onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
                required
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.available}
                onChange={(e) => setDraft({ ...draft, available: e.target.checked })}
              />
              Available on the menu
            </label>

            <button type="submit" className={`${buttonPrimary} w-full`} disabled={busy}>
              {busy ? "Saving…" : editingId ? "Save changes" : "Add item"}
            </button>
          </form>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 font-semibold">Add a category</h2>
          <form onSubmit={addCategory} className="flex gap-2">
            <input
              className={inputClass}
              placeholder="Breakfast"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              aria-label="New category name"
            />
            <button type="submit" className={buttonSecondary}>
              Add
            </button>
          </form>
        </Card>
      </aside>
    </div>
  );
}
