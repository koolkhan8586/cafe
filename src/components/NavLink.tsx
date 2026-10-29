"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

export function NavLink({
  href,
  children,
  exact = false,
}: {
  href: string;
  children: React.ReactNode;
  /// Set when this href is a prefix of another nav entry, e.g. "/manager"
  /// sits above "/manager/expenses" and must not light up on its children.
  exact?: boolean;
}) {
  const pathname = usePathname();
  // "/orders" must not light up while on "/admin/orders", so compare the
  // full segment rather than using a bare startsWith.
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={cn(
        "rounded-lg px-3 py-1.5 text-sm font-medium transition",
        active
          ? "bg-brand-soft text-brand-strong"
          : "text-muted hover:bg-surface-muted hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
