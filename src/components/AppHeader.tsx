"use client";

// ============================================================================
// One header for every page of the app.
//
// /plan and /season each grew their own nav — different shapes, different
// weights, neither saying which page you are on. Navigation is not scaffolding
// around the product; it IS the product's sense of place, so there is one of
// it, and the current page is always visible in it.
// ============================================================================
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/plan", label: "This week" },
  { href: "/season", label: "Season" },
  { href: "/strength", label: "Strength" },
  { href: "/progress", label: "Progress" },
  { href: "/benchmarks", label: "Benchmarks" },
];

interface Props {
  /**
   * The date everything on this page counts down to. Rendered as days left,
   * not as a date: this plan exists because of one day, and "63d" is the fact
   * an athlete actually acts on.
   */
  countdown?: { label: string; days: number | null } | null;
  /** A page-level action — unlocking, rebuilding. At most one. */
  action?: React.ReactNode;
}

export function AppHeader({ countdown, action }: Props) {
  const pathname = usePathname();

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-edge pb-4">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <Link href="/plan" className="text-h3 font-bold tracking-tight">
          Hyrox<span className="text-flame">·</span>Hub
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-control px-2.5 py-1.5 text-base font-medium transition-colors duration-150 ease-out ${
                  active ? "bg-rack text-chalk" : "text-ash hover:bg-rack/60 hover:text-bone"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        {/* Setup is a utility, not a sixth thing to read — it sits in the
            right-hand corner with the other page-level controls. */}
        <Link
          href="/settings"
          aria-current={pathname === "/settings" ? "page" : undefined}
          aria-label="Setup and tools"
          title="Setup &amp; tools"
          className={`rounded-control px-2.5 py-1.5 text-base font-medium transition-colors duration-150 ease-out ${
            pathname === "/settings" ? "bg-rack text-chalk" : "text-ash hover:bg-rack/60 hover:text-bone"
          }`}
        >
          Setup
        </Link>
        {countdown && (
          <div className="text-right leading-none">
            <div className="text-micro font-semibold uppercase tracking-widest text-ash">
              {countdown.label}
            </div>
            <div className="mt-1 font-mono text-lead font-bold tabular-nums text-chalk">
              {countdown.days == null ? "—" : `${countdown.days}d`}
            </div>
          </div>
        )}
        {action}
      </div>
    </header>
  );
}
