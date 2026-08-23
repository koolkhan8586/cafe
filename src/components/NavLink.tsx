"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

export function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // "/orders" must not light up while on "/admin/orders", so compare the
  // full segment rather than using a bare startsWith.
  const active = pathname === href || pathname.startsWith(`${href}/`);

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
