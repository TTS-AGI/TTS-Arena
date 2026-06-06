"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { ApiUser } from "@ttsa/shared";

/**
 * Admin sidebar shell: fixed left nav + scrollable content. Uses the app's
 * design tokens (card/ink/accent/line). Active link is derived from the path.
 */

const NAV = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/models", label: "Models" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/votes", label: "Votes" },
  { href: "/admin/security", label: "Security" },
  { href: "/admin/analytics", label: "Analytics" },
];

export function AdminShell({
  user,
  children,
}: {
  user: ApiUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) =>
    exact
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 sm:px-6">
        {/* Sidebar */}
        <aside className="sticky top-6 hidden h-[calc(100dvh-3rem)] w-56 shrink-0 flex-col sm:flex">
          <div className="mb-5 px-2">
            <Link
              href="/admin"
              className="text-[0.95rem] font-semibold tracking-tight"
            >
              TTS&nbsp;Arena
            </Link>
            <p className="tag mt-0.5">Admin</p>
          </div>

          <nav className="flex flex-col gap-0.5">
            {NAV.map((item) => {
              const on = isActive(item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={on ? "page" : undefined}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    on
                      ? "bg-fill text-ink"
                      : "text-ink-3 hover:bg-fill/60 hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto flex flex-col gap-2 border-t border-line pt-4">
            <div className="flex items-center gap-2 px-2">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="h-7 w-7 rounded-full object-cover"
                />
              ) : (
                <span className="h-7 w-7 rounded-full bg-fill" />
              )}
              <span className="truncate text-sm font-medium">
                {user.username}
              </span>
            </div>
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-ink-3 transition-colors hover:bg-fill/60 hover:text-ink"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back to arena
            </Link>
          </div>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1">
          {/* Mobile top nav */}
          <div className="mb-4 flex items-center gap-1 overflow-x-auto sm:hidden">
            {NAV.map((item) => {
              const on = isActive(item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    on ? "bg-fill text-ink" : "text-ink-3"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

/* ── Small shared layout primitives reused across admin pages ─────────── */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-3">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function StatCard({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="card p-4">
      <p className="tag">{label}</p>
      <p className="nums mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
