import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { isRole } from "@/lib/types";
import { AppShell } from "@/components/AppShell";
import { redirect } from "next/navigation";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, settings] = await Promise.all([requireUser(), getSettings()]);
  if (!isRole(user.role)) redirect("/login");

  return (
    <AppShell
      cafeName={settings.CAFE_NAME}
      user={{ name: user.name, code: user.code, role: user.role }}
    >
      {children}
    </AppShell>
  );
}
