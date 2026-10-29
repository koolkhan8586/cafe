"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toDecimalString } from "@/lib/money";
import {
  Card,
  buttonPrimary,
  buttonSecondary,
  cn,
  inputClass,
  labelClass,
} from "@/components/ui";

export function LedgerPaymentForm({
  staffId,
  staffName,
  balance,
  currency,
}: {
  staffId: string;
  staffName: string;
  balance: number;
  currency: string;
}) {
  const router = useRouter();
  const [type, setType] = useState<"PAYMENT" | "ADJUSTMENT">("PAYMENT");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(
    null,
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, type, amount, note }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage({ tone: "bad", text: data.error ?? "Could not record that." });
        return;
      }
      setAmount("");
      setNote("");
      setMessage({
        tone: "ok",
        text: type === "PAYMENT" ? "Payment recorded." : "Adjustment recorded.",
      });
      router.refresh();
    } catch {
      setMessage({ tone: "bad", text: "Network problem. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <h2 className="font-semibold">Record a payment</h2>
      <p className="mt-1 text-sm text-muted">
        {balance > 0
          ? `${staffName} owes ${currency} ${toDecimalString(balance)}.`
          : balance < 0
            ? `${staffName} is in credit.`
            : `${staffName}'s account is settled.`}
      </p>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <div className="flex gap-2">
          {(["PAYMENT", "ADJUSTMENT"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={type === option}
              onClick={() => setType(option)}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition",
                type === option
                  ? "border-brand bg-brand-soft text-brand-strong"
                  : "border-border-subtle hover:bg-surface-muted",
              )}
            >
              {option === "PAYMENT" ? "Payment" : "Adjustment"}
            </button>
          ))}
        </div>

        <div>
          <label className={labelClass} htmlFor="ledger-amount">
            Amount ({currency})
          </label>
          <input
            id="ledger-amount"
            type="number"
            step="0.01"
            className={inputClass}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={balance > 0 ? toDecimalString(balance) : "0.00"}
            required
          />
          <p className="mt-1 text-xs text-muted">
            {type === "PAYMENT"
              ? "What they handed over. This reduces the balance."
              : "Positive adds to what they owe; negative writes an amount off."}
          </p>
        </div>

        {balance > 0 && type === "PAYMENT" ? (
          <button
            type="button"
            className={`${buttonSecondary} w-full`}
            onClick={() => setAmount(toDecimalString(balance))}
          >
            Settle the full {currency} {toDecimalString(balance)}
          </button>
        ) : null}

        <div>
          <label className={labelClass} htmlFor="ledger-note">
            Note
          </label>
          <input
            id="ledger-note"
            className={inputClass}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={type === "PAYMENT" ? "Cash, deducted from salary…" : "Reason"}
            maxLength={300}
          />
        </div>

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

        <button type="submit" className={`${buttonPrimary} w-full`} disabled={busy}>
          {busy ? "Saving…" : "Record"}
        </button>
      </form>
    </Card>
  );
}
