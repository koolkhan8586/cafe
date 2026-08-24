import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { Card, PageHeader, cn } from "@/components/ui";
import { WahaSettingsForm } from "@/components/WahaSettingsForm";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireRole(["ADMIN"], "/admin/settings");

  const [settings, logs] = await Promise.all([
    getSettings(),
    prisma.notificationLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  return (
    <>
      <PageHeader
        title="WhatsApp &amp; cafe settings"
        subtitle="Point the app at your WAHA instance and choose who gets the order alerts."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <WahaSettingsForm
          initial={{
            CAFE_NAME: settings.CAFE_NAME,
            CURRENCY_SYMBOL: settings.CURRENCY_SYMBOL,
            CAFE_PUBLIC_URL: settings.CAFE_PUBLIC_URL,
            WAHA_BASE_URL: settings.WAHA_BASE_URL,
            WAHA_SESSION: settings.WAHA_SESSION,
            ADMIN_WHATSAPP_CHAT_ID: settings.ADMIN_WHATSAPP_CHAT_ID,
            NOTIFY_EMPLOYEE_ON_STATUS: settings.NOTIFY_EMPLOYEE_ON_STATUS === "true",
          }}
          apiKeySet={settings.WAHA_API_KEY.length > 0}
        />

        <Card className="p-4">
          <h2 className="font-semibold">Recent notifications</h2>
          <p className="mt-1 text-sm text-muted">
            Every WhatsApp attempt, successful or not.
          </p>

          {logs.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              Nothing sent yet. Place a test order to see it here.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="rounded-lg border border-border-subtle p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        log.status === "SENT"
                          ? "bg-success-soft text-success"
                          : log.status === "SKIPPED"
                            ? "bg-surface-muted text-muted"
                            : "bg-danger-soft text-danger",
                      )}
                    >
                      {log.status.toLowerCase()}
                    </span>
                    <span className="text-xs text-muted">
                      {log.createdAt.toLocaleString("en-GB")}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted">{log.target}</p>
                  {log.error ? (
                    // A skipped send is a configuration note, not a failure,
                    // so it should not shout in red.
                    <p
                      className={cn(
                        "mt-1 text-xs",
                        log.status === "FAILED" ? "text-danger" : "text-muted",
                      )}
                    >
                      {log.error}
                    </p>
                  ) : null}
                  {log.orderId ? (
                    <p className="mt-1 text-xs text-muted">Order #{log.orderId}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
