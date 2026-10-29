"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/types";
import { cn } from "@/components/ui";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  roles: Role[];
  /// Set when this href is a prefix of another entry, e.g. "/manager" sits
  /// above "/manager/expenses" and must not light up on its children.
  exact?: boolean;
};

const SIDEBAR_WIDTH = "16rem";

/**
 * Left sidebar on desktop; a slide-in drawer behind a menu button on small
 * screens. The drawer lives here rather than in a layout so that the open
 * state can close itself on navigation.
 */
export function SideNav({
  cafeName,
  user,
  items,
  signOut,
  children,
}: {
  cafeName: string;
  user: { name: string; code: string; role: Role };
  items: NavItem[];
  signOut: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Tapping any link inside the drawer closes it. Done on the click rather
  // than in an effect on pathname, which would be setState during render.
  const close = () => setOpen(false);

  // Escape closes the drawer, and a locked body stops the page scrolling
  // underneath it on iOS.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const isActive = (item: NavItem) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

  const nav = (
    <nav className="flex-1 space-y-1 overflow-y-auto p-3">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={close}
          aria-current={isActive(item) ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
            isActive(item)
              ? "bg-brand-soft text-brand-strong"
              : "text-muted hover:bg-surface-muted hover:text-foreground",
          )}
        >
          <span aria-hidden className="w-5 shrink-0 text-center text-base">
            {item.icon}
          </span>
          <span className="truncate">{item.label}</span>
        </Link>
      ))}
    </nav>
  );

  const account = (
    <div className="border-t border-border-subtle p-3">
      <div className="mb-2 px-1 leading-tight">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted">
          {user.code} · {user.role.toLowerCase()}
        </p>
      </div>
      <form action={signOut}>
        <button
          type="submit"
          className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm font-medium hover:bg-surface-muted"
        >
          Sign out
        </button>
      </form>
    </div>
  );

  const brand = (
    <Link
      href="/"
      onClick={close}
      className="flex items-center gap-2 border-b border-border-subtle px-4 py-4 font-semibold"
    >
      <span aria-hidden className="text-xl">
        ☕
      </span>
      <span className="truncate">{cafeName}</span>
    </Link>
  );

  return (
    <div className="min-h-full lg:flex">
      {/* Desktop sidebar: always present, never animated. */}
      <aside
        className="hidden shrink-0 border-r border-border-subtle bg-surface lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col"
        style={{ width: SIDEBAR_WIDTH }}
      >
        {brand}
        {nav}
        {account}
      </aside>

      {/* Mobile drawer and its backdrop. */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={close}
        aria-hidden
      />
      <aside
        id="main-nav"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border-subtle bg-surface transition-transform duration-200 lg:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        style={{ width: SIDEBAR_WIDTH }}
        aria-hidden={!open}
      >
        {brand}
        {nav}
        {account}
      </aside>

      <div className="flex min-h-full min-w-0 flex-1 flex-col">
        {/* Mobile top bar. Hidden once the sidebar is permanent. */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border-subtle bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="main-nav"
            className="rounded-lg border border-border-subtle p-2 hover:bg-surface-muted"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M3 5h14M3 10h14M3 15h14" />
            </svg>
          </button>
          <span className="truncate font-semibold">{cafeName}</span>
          <span className="ml-auto truncate text-xs text-muted">{user.name}</span>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">
          {children}
        </main>

        <footer className="border-t border-border-subtle px-4 py-4 text-center text-xs text-muted">
          {cafeName} · orders go to the counter over WhatsApp
        </footer>
      </div>
    </div>
  );
}
