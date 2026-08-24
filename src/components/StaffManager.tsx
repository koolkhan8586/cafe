"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROLES, type Role } from "@/lib/types";
import {
  Card,
  buttonDanger,
  buttonPrimary,
  buttonSecondary,
  cn,
  inputClass,
  labelClass,
} from "@/components/ui";

export type StaffRow = {
  id: string;
  code: string;
  name: string;
  department: string | null;
  whatsapp: string | null;
  role: string;
  active: boolean;
};

type Draft = {
  code: string;
  name: string;
  department: string;
  whatsapp: string;
  role: Role;
  secret: string;
};

const EMPTY: Draft = {
  code: "",
  name: "",
  department: "",
  whatsapp: "",
  role: "EMPLOYEE",
  secret: "",
};

const ROLE_HINT: Record<Role, string> = {
  EMPLOYEE: "Can browse the menu and order. PIN must be at least 4 digits.",
  ADMIN: "Runs the counter, the menu and the WhatsApp settings. Password: 8+ characters.",
  MANAGER: "Sees sales, costs and margins. Password: 8+ characters.",
};

export function StaffManager({ initialStaff }: { initialStaff: StaffRow[] }) {
  const router = useRouter();
  const [staff, setStaff] = useState(initialStaff);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resetFor, setResetFor] = useState<StaffRow | null>(null);
  const [resetValue, setResetValue] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  function startCreate() {
    setEditingId(null);
    setDraft(EMPTY);
    setMessage(null);
  }

  function startEdit(person: StaffRow) {
    setEditingId(person.id);
    setDraft({
      code: person.code,
      name: person.name,
      department: person.department ?? "",
      whatsapp: person.whatsapp ?? "",
      role: person.role as Role,
      secret: "",
    });
    setMessage(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      // code is the login / HR SSO handle; admins may change it on edit.
      // Past orders keep staffId, so history stays attached to the person.
      const payload = editingId
        ? {
            code: draft.code,
            name: draft.name,
            department: draft.department,
            whatsapp: draft.whatsapp,
            role: draft.role,
          }
        : draft;

      const res = await fetch(
        editingId ? `/api/staff/${editingId}` : "/api/staff",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json()) as { error?: string; staff?: StaffRow };
      if (!res.ok || !data.staff) {
        setMessage({ tone: "bad", text: data.error ?? "Could not save." });
        return;
      }
      const saved = data.staff;
      setStaff((prev) =>
        editingId
          ? prev.map((p) => (p.id === saved.id ? saved : p))
          : [...prev, saved],
      );
      setMessage({
        tone: "ok",
        text: editingId ? `Updated ${saved.name}.` : `Added ${saved.name} (${saved.code}).`,
      });
      setDraft(EMPTY);
      setEditingId(null);
      router.refresh();
    } catch {
      setMessage({ tone: "bad", text: "Network problem. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function setActive(person: StaffRow, active: boolean) {
    const res = await fetch(`/api/staff/${person.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    const data = (await res.json()) as { error?: string; staff?: StaffRow };
    if (!res.ok || !data.staff) {
      setMessage({ tone: "bad", text: data.error ?? "Could not update." });
      return;
    }
    setStaff((prev) => prev.map((p) => (p.id === person.id ? data.staff! : p)));
    router.refresh();
  }

  async function submitReset(event: React.FormEvent) {
    event.preventDefault();
    if (!resetFor) return;
    setBusy(true);
    const res = await fetch(`/api/staff/${resetFor.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: resetValue }),
    });
    const data = (await res.json()) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setMessage({ tone: "bad", text: data.error ?? "Could not reset." });
      return;
    }
    setMessage({
      tone: "ok",
      text: `New ${resetFor.role === "EMPLOYEE" ? "PIN" : "password"} set for ${resetFor.name}.`,
    });
    setResetFor(null);
    setResetValue("");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
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

        <Card className="overflow-x-auto">
          <table className="w-full min-w-[42rem] text-sm">
            <thead className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">Employee ID</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Department</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">WhatsApp</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border)]">
              {staff.map((person) => (
                <tr key={person.id} className={person.active ? "" : "opacity-55"}>
                  <td className="px-3 py-2 font-mono text-xs">{person.code}</td>
                  <td className="px-3 py-2 font-medium">
                    {person.name}
                    {!person.active ? (
                      <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs">
                        inactive
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-muted">{person.department ?? "—"}</td>
                  <td className="px-3 py-2">{person.role.toLowerCase()}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted">
                    {person.whatsapp ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className={buttonSecondary}
                        onClick={() => startEdit(person)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={buttonSecondary}
                        onClick={() => {
                          setResetFor(person);
                          setResetValue("");
                        }}
                      >
                        Reset PIN
                      </button>
                      {person.active ? (
                        <button
                          type="button"
                          className={buttonDanger}
                          onClick={() => setActive(person, false)}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={buttonSecondary}
                          onClick={() => setActive(person, true)}
                        >
                          Reactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">
              {editingId ? "Edit person" : "Add a person"}
            </h2>
            {editingId ? (
              <button type="button" className="text-sm text-muted underline" onClick={startCreate}>
                Cancel
              </button>
            ) : null}
          </div>

          <form onSubmit={save} className="space-y-3">
            <div>
              <label className={labelClass} htmlFor="staff-code">Employee ID</label>
              <input
                id="staff-code"
                className={inputClass}
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                placeholder="LSAF-006"
                autoCapitalize="characters"
                required
              />
              <p className="mt-1 text-xs text-muted">
                Login handle and HR SSO match (e.g. LSAF-001). Must be unique.
              </p>
            </div>

            <div>
              <label className={labelClass} htmlFor="staff-name">Name</label>
              <input
                id="staff-name"
                className={inputClass}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                required
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="staff-dept">Department</label>
              <input
                id="staff-dept"
                className={inputClass}
                value={draft.department}
                onChange={(e) => setDraft({ ...draft, department: e.target.value })}
                placeholder="Engineering"
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="staff-wa">WhatsApp number</label>
              <input
                id="staff-wa"
                className={inputClass}
                value={draft.whatsapp}
                onChange={(e) => setDraft({ ...draft, whatsapp: e.target.value })}
                placeholder="923001234567"
                inputMode="numeric"
              />
              <p className="mt-1 text-xs text-muted">
                International format, no “+”. Only used for order status updates.
              </p>
            </div>

            <div>
              <label className={labelClass} htmlFor="staff-role">Role</label>
              <select
                id="staff-role"
                className={inputClass}
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role.toLowerCase()}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">{ROLE_HINT[draft.role]}</p>
            </div>

            {editingId === null ? (
              <div>
                <label className={labelClass} htmlFor="staff-secret">
                  {draft.role === "EMPLOYEE" ? "PIN" : "Password"}
                </label>
                <input
                  id="staff-secret"
                  type="password"
                  className={inputClass}
                  value={draft.secret}
                  onChange={(e) => setDraft({ ...draft, secret: e.target.value })}
                  required
                />
              </div>
            ) : null}

            <button type="submit" className={`${buttonPrimary} w-full`} disabled={busy}>
              {busy ? "Saving…" : editingId ? "Save changes" : "Add person"}
            </button>
          </form>
        </Card>

        {resetFor ? (
          <Card className="p-4">
            <h2 className="mb-3 font-semibold">
              Reset {resetFor.role === "EMPLOYEE" ? "PIN" : "password"} — {resetFor.name}
            </h2>
            <form onSubmit={submitReset} className="space-y-3">
              <input
                type="password"
                className={inputClass}
                value={resetValue}
                onChange={(e) => setResetValue(e.target.value)}
                placeholder={resetFor.role === "EMPLOYEE" ? "4+ digits" : "8+ characters"}
                aria-label="New PIN or password"
                required
              />
              <div className="flex gap-2">
                <button type="submit" className={`${buttonPrimary} flex-1`} disabled={busy}>
                  Set
                </button>
                <button
                  type="button"
                  className={buttonSecondary}
                  onClick={() => setResetFor(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </Card>
        ) : null}
      </aside>
    </div>
  );
}
