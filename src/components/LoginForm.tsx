"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  buttonPrimary,
  inputClass,
  labelClass,
} from "@/components/ui";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, secret }),
      });
      const data = (await res.json()) as { error?: string; redirectTo?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not sign in.");
        return;
      }
      // Server components cache per-route; refresh so the shell picks up the
      // new session instead of rendering the signed-out view.
      router.replace(next || data.redirectTo || "/");
      router.refresh();
    } catch {
      setError("Network problem. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="code">
            Employee ID
          </label>
          <input
            id="code"
            name="code"
            className={inputClass}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="LSAF-001"
            autoComplete="username"
            autoCapitalize="characters"
            required
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="secret">
            PIN / password
          </label>
          <input
            id="secret"
            name="secret"
            type="password"
            className={inputClass}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="••••"
            autoComplete="current-password"
            required
          />
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}

        <button type="submit" className={`${buttonPrimary} w-full`} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </Card>
  );
}
