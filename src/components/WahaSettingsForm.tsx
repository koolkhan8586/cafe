"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  buttonPrimary,
  buttonSecondary,
  cn,
  inputClass,
  labelClass,
} from "@/components/ui";

type Values = {
  CAFE_NAME: string;
  CURRENCY_SYMBOL: string;
  CAFE_PUBLIC_URL: string;
  WAHA_BASE_URL: string;
  WAHA_SESSION: string;
  ADMIN_WHATSAPP_CHAT_ID: string;
  NOTIFY_EMPLOYEE_ON_STATUS: boolean;
};

type TestOutcome = {
  session: { ok: boolean; detail: string };
  send?: { status: "SENT" | "SKIPPED" | "FAILED"; reason?: string; error?: string };
};

export function WahaSettingsForm({
  initial,
  apiKeySet,
}: {
  initial: Values;
  apiKeySet: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(
    null,
  );
  const [test, setTest] = useState<TestOutcome | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          NOTIFY_EMPLOYEE_ON_STATUS: values.NOTIFY_EMPLOYEE_ON_STATUS ? "true" : "false",
          WAHA_API_KEY: apiKey,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage({ tone: "bad", text: data.error ?? "Could not save settings." });
        return;
      }
      setApiKey("");
      setMessage({ tone: "ok", text: "Settings saved." });
      router.refresh();
    } catch {
      setMessage({ tone: "bad", text: "Network problem. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function runTest(send: boolean) {
    setTesting(true);
    setTest(null);
    try {
      const res = await fetch("/api/waha/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ send }),
      });
      const data = (await res.json()) as TestOutcome & { error?: string };
      if (!res.ok) {
        setTest({ session: { ok: false, detail: data.error ?? "Test failed." } });
        return;
      }
      setTest(data);
      router.refresh();
    } catch {
      setTest({ session: { ok: false, detail: "Network problem. Try again." } });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card className="p-4">
      <h2 className="font-semibold">Connection</h2>
      <p className="mt-1 text-sm text-muted">
        Anything left blank falls back to the matching environment variable.
      </p>

      <form onSubmit={save} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="cafe-name">Cafe name</label>
            <input
              id="cafe-name"
              className={inputClass}
              value={values.CAFE_NAME}
              onChange={(e) => setValues({ ...values, CAFE_NAME: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="currency">Currency symbol</label>
            <input
              id="currency"
              className={inputClass}
              value={values.CURRENCY_SYMBOL}
              onChange={(e) => setValues({ ...values, CURRENCY_SYMBOL: e.target.value })}
              placeholder="Rs"
            />
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="public-url">Public cafe URL</label>
          <input
            id="public-url"
            className={inputClass}
            value={values.CAFE_PUBLIC_URL}
            onChange={(e) => setValues({ ...values, CAFE_PUBLIC_URL: e.target.value })}
            placeholder="https://cafe.khanmusa.com"
          />
          <p className="mt-1 text-xs text-muted">
            Used as the Counter link on WhatsApp order alerts. Point WAHA&apos;s
            webhook at <code>{values.CAFE_PUBLIC_URL.replace(/\/+$/, "") || "https://cafe.khanmusa.com"}/api/waha/webhook</code>.
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="waha-url">WAHA base URL</label>
          <input
            id="waha-url"
            className={inputClass}
            value={values.WAHA_BASE_URL}
            onChange={(e) => setValues({ ...values, WAHA_BASE_URL: e.target.value })}
            placeholder="http://localhost:3001"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="waha-key">API key</label>
            <input
              id="waha-key"
              type="password"
              className={inputClass}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={apiKeySet ? "•••••••• (saved)" : "not set"}
            />
            <p className="mt-1 text-xs text-muted">
              Leave blank to keep the current key.
            </p>
          </div>
          <div>
            <label className={labelClass} htmlFor="waha-session">Session name</label>
            <input
              id="waha-session"
              className={inputClass}
              value={values.WAHA_SESSION}
              onChange={(e) => setValues({ ...values, WAHA_SESSION: e.target.value })}
              placeholder="default"
            />
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="admin-chat">
            Where order alerts go
          </label>
          <input
            id="admin-chat"
            className={inputClass}
            value={values.ADMIN_WHATSAPP_CHAT_ID}
            onChange={(e) =>
              setValues({ ...values, ADMIN_WHATSAPP_CHAT_ID: e.target.value })
            }
            placeholder="923001234567"
          />
          <p className="mt-1 text-xs text-muted">
            A phone number in international format without “+”, or a full chat id
            such as <code>923001234567@c.us</code> (group: <code>…@g.us</code>).
            People in that chat can reply <code>ACCEPT 12</code>,{" "}
            <code>REJECT 12</code>, or <code>COUNTER</code>.
          </p>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={values.NOTIFY_EMPLOYEE_ON_STATUS}
            onChange={(e) =>
              setValues({ ...values, NOTIFY_EMPLOYEE_ON_STATUS: e.target.checked })
            }
          />
          <span>
            Also message the employee when their order changes status. Needs a
            WhatsApp number on their staff record.
          </span>
        </label>

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

        <div className="flex flex-wrap gap-2">
          <button type="submit" className={buttonPrimary} disabled={busy}>
            {busy ? "Saving…" : "Save settings"}
          </button>
          <button
            type="button"
            className={buttonSecondary}
            onClick={() => runTest(false)}
            disabled={testing}
          >
            Test connection
          </button>
          <button
            type="button"
            className={buttonSecondary}
            onClick={() => runTest(true)}
            disabled={testing}
          >
            Send test message
          </button>
        </div>
      </form>

      {test ? (
        <div className="mt-4 space-y-2 text-sm">
          <p
            className={cn(
              "rounded-lg px-3 py-2",
              test.session.ok
                ? "bg-success-soft text-success"
                : "bg-danger-soft text-danger",
            )}
          >
            {test.session.detail}
          </p>
          {test.send ? (
            <p
              className={cn(
                "rounded-lg px-3 py-2",
                test.send.status === "SENT"
                  ? "bg-success-soft text-success"
                  : "bg-danger-soft text-danger",
              )}
            >
              {test.send.status === "SENT"
                ? "Test message sent — check WhatsApp."
                : (test.send.error ?? test.send.reason ?? "The test message did not go out.")}
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
