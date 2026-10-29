import { redirect } from "next/navigation";
import { clearSession } from "@/lib/session";
import type { Role } from "@/lib/types";
import { SideNav, type NavItem } from "@/components/SideNav";

const NAV: NavItem[] = [
  { href: "/menu", label: "Menu", icon: "☕", roles: ["EMPLOYEE", "ADMIN", "MANAGER"] },
  { href: "/orders", label: "My orders", icon: "🧾", roles: ["EMPLOYEE", "ADMIN", "MANAGER"] },
  { href: "/counter", label: "New order", icon: "➕", roles: ["ADMIN", "MANAGER"] },
  { href: "/admin/orders", label: "Counter", icon: "🔔", roles: ["ADMIN"] },
  { href: "/admin/menu", label: "Manage menu", icon: "📋", roles: ["ADMIN"] },
  { href: "/admin/staff", label: "Staff", icon: "👥", roles: ["ADMIN"] },
  { href: "/admin/settings", label: "WhatsApp", icon: "💬", roles: ["ADMIN"] },
  // "/manager" is a prefix of the ledger and expense routes, so it only
  // counts as active on an exact match.
  { href: "/manager", label: "Sales", icon: "📊", roles: ["MANAGER"], exact: true },
  { href: "/manager/costs", label: "Costs & margin", icon: "⚖️", roles: ["MANAGER"] },
  { href: "/manager/ledger", label: "Staff ledger", icon: "📒", roles: ["ADMIN", "MANAGER"] },
  { href: "/manager/expenses", label: "Expenses", icon: "💸", roles: ["ADMIN", "MANAGER"] },
];

async function signOut() {
  "use server";
  await clearSession();
  redirect("/login");
}

export function AppShell({
  cafeName,
  user,
  children,
}: {
  cafeName: string;
  user: { name: string; code: string; role: Role };
  children: React.ReactNode;
}) {
  const items = NAV.filter((item) => item.roles.includes(user.role));

  return (
    <SideNav cafeName={cafeName} user={user} items={items} signOut={signOut}>
      {children}
    </SideNav>
  );
}
