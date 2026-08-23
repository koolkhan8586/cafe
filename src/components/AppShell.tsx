import Link from "next/link";
import { redirect } from "next/navigation";
import { clearSession } from "@/lib/session";
import type { Role } from "@/lib/types";
import { NavLink } from "@/components/NavLink";

type NavItem = { href: string; label: string; roles: Role[] };

const NAV: NavItem[] = [
  { href: "/menu", label: "Menu", roles: ["EMPLOYEE", "ADMIN", "MANAGER"] },
  { href: "/orders", label: "My orders", roles: ["EMPLOYEE", "ADMIN", "MANAGER"] },
  { href: "/admin/orders", label: "Counter", roles: ["ADMIN"] },
  { href: "/admin/menu", label: "Manage menu", roles: ["ADMIN"] },
  { href: "/admin/staff", label: "Staff", roles: ["ADMIN"] },
  { href: "/admin/settings", label: "WhatsApp", roles: ["ADMIN"] },
  { href: "/manager", label: "Sales", roles: ["MANAGER"] },
  { href: "/manager/costs", label: "Costs & margin", roles: ["MANAGER"] },
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
              <NavLink key={item.href} href={item.href}>
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
