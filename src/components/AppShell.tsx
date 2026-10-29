import Link from "next/link";
import { redirect } from "next/navigation";
import { clearSession } from "@/lib/session";
import type { Role } from "@/lib/types";
import { NavLink } from "@/components/NavLink";

type NavItem = { href: string; label: string; roles: Role[]; exact?: boolean };

const NAV: NavItem[] = [
  { href: "/menu", label: "Menu", roles: ["EMPLOYEE", "ADMIN", "MANAGER"] },
  { href: "/orders", label: "My orders", roles: ["EMPLOYEE", "ADMIN", "MANAGER"] },
  { href: "/counter", label: "New order", roles: ["ADMIN", "MANAGER"] },
  { href: "/admin/orders", label: "Counter", roles: ["ADMIN"] },
  { href: "/admin/menu", label: "Manage menu", roles: ["ADMIN"] },
  { href: "/admin/staff", label: "Staff", roles: ["ADMIN"] },
  { href: "/admin/settings", label: "WhatsApp", roles: ["ADMIN"] },
  // "/manager" is a prefix of the ledger and expense routes, so it only
  // counts as active on an exact match.
  { href: "/manager", label: "Sales", roles: ["MANAGER"], exact: true },
  { href: "/manager/costs", label: "Costs & margin", roles: ["MANAGER"] },
  { href: "/manager/ledger", label: "Staff ledger", roles: ["ADMIN", "MANAGER"] },
  { href: "/manager/expenses", label: "Expenses", roles: ["ADMIN", "MANAGER"] },
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
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-border-subtle bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span aria-hidden className="text-xl">
              ☕
            </span>
            <span>{cafeName}</span>
          </Link>

          <nav className="flex flex-1 flex-wrap items-center gap-1">
            {items.map((item) => (
              <NavLink key={item.href} href={item.href} exact={item.exact}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted">
                {user.code} · {user.role.toLowerCase()}
              </p>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm font-medium hover:bg-surface-muted"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>

      <footer className="border-t border-border-subtle px-4 py-4 text-center text-xs text-muted">
        {cafeName} · orders go to the counter over WhatsApp
      </footer>
    </div>
  );
}
