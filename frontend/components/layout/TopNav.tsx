"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Logo } from "./Logo";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/runs/new", label: "New Run" },
  { href: "/runs", label: "History" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/runs/performance", label: "Performance" },
  { href: "/settings", label: "Settings" },
];

export function TopNav() {
  const path = usePathname();
  const { data: session } = useSession();
  const isActive = (href: string) => {
    if (path === href) return true;
    if (href === "/runs") return path.startsWith("/runs/") && !path.startsWith("/runs/performance") && path !== "/runs/new";
    return false;
  };

  return (
    <>
      <KeyboardShortcuts />
      <nav className="bg-surface border-b border-border px-4 py-2 flex items-center gap-4 sticky top-0 z-50 shrink-0">
        <Link href="/runs" className="mr-3 flex items-center" aria-label="AgentFloor home">
          <Logo height={28} />
        </Link>
        <span className="text-nav-divider text-lg">|</span>
        {NAV.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`text-xs px-1 pb-0.5 ${isActive(href) ? "text-blue-500 dark:text-blue-400 border-b border-blue-500 dark:border-blue-400" : "text-muted hover:text-fg-secondary"}`}
          >
            {label}
          </Link>
        ))}
        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          {(session?.user as { role?: string })?.role === "admin" && (
            <span className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-xs px-1.5 py-0.5 rounded">ADMIN</span>
          )}
          <span className="text-muted text-xs" title="Press ? for keyboard shortcuts">
            {session?.user?.email}
          </span>
          <button onClick={() => signOut()} className="text-subtle text-xs hover:text-muted">Sign out</button>
        </div>
      </nav>
    </>
  );
}
