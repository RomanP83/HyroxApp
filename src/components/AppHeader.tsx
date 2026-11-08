"use client";

// ============================================================================
// The frame of every page — the whiteboard's aluminium rail (docs/design.md).
//
// Desktop (above 900px): a 232px side column with the wordmark, the four tabs
// and Setup at the foot. Phone (900px and below): a sticky rail top bar with
// the wordmark, the countdown and Setup, and the four tabs in a bottom tab bar
// on panel white. The current page is always visible: it fills ink.
//
// Four tabs by what you are doing: training today, looking at the plan,
// checking where you stand, racing. Pages that hang off a tab (Season off
// Plan, Tests and Running off Progress, the strength program off Setup) light
// that tab.
//
// The countdown and the page action sit top right of the main column on
// desktop, in the rail top bar on phones.
// ============================================================================
import Link from "next/link";
import { usePathname } from "next/navigation";

type IconName = "today" | "week" | "progress" | "race" | "setup";

const NAV: { href: string; label: string; short: string; icon: IconName; also: string[] }[] = [
  { href: "/today", label: "Today", short: "Today", icon: "today", also: [] },
  { href: "/plan", label: "Plan", short: "Plan", icon: "week", also: ["/season"] },
  { href: "/progress", label: "Progress", short: "Progress", icon: "progress", also: ["/benchmarks", "/progress/running"] },
  { href: "/race", label: "Race", short: "Race", icon: "race", also: [] },
];

/** Setup, and the pages that hang off it. */
const SETUP_PATHS = ["/settings", "/strength"];

const isActive = (pathname: string, item: { href: string; also: string[] }) =>
  pathname === item.href || item.also.includes(pathname);

const PATHS: Record<IconName, string> = {
  today: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  week: "M4 6.5h16v13H4zM4 10.5h16M8.5 4v4M15.5 4v4",
  progress: "M4 19h16M5 15l4.5-4.5 3.5 3L19 7M15 7h4v4",
  race: "M12 21a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM12 9.5v4l2.5 1.5M10 3h4",
  setup:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5l1.6 1-2 3.4-1.8-.7a7 7 0 0 1-2 1.2l-.3 1.9h-4l-.3-1.9a7 7 0 0 1-2-1.2l-1.8.7-2-3.4 1.6-1a7 7 0 0 1 0-3l-1.6-1 2-3.4 1.8.7a7 7 0 0 1 2-1.2l.3-1.9h4l.3 1.9a7 7 0 0 1 2 1.2l1.8-.7 2 3.4-1.6 1a7 7 0 0 1 0 3z",
};

function Icon({ name, className = "h-[22px] w-[22px]" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

interface Props {
  /**
   * The date everything on this page counts down to. Rendered as days left,
   * not as a date: this plan exists because of one day, and "63 days" is the
   * fact an athlete actually acts on.
   */
  countdown?: { label: string; days: number | null } | null;
  /** A page-level action — unlocking, rebuilding. At most one. */
  action?: React.ReactNode;
}

function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/today"
      aria-label="HYROX / HUB — today"
      className={`font-display font-extrabold uppercase leading-none text-chalk ${className}`}
    >
      HYROX<span className="text-bone"> / HUB</span>
    </Link>
  );
}

function Countdown({ countdown }: { countdown: { label: string; days: number | null } }) {
  return (
    <div className="flex items-baseline gap-1.5 leading-none" title={countdown.label}>
      <strong className="font-display text-[1.75rem] font-extrabold tabular-nums text-chalk">
        {countdown.days == null ? "—" : countdown.days}
      </strong>
      <span className="text-meta font-bold text-bone">
        days<span className="hidden sm:inline"> · {countdown.label}</span>
      </span>
    </div>
  );
}

export function AppHeader({ countdown, action }: Props) {
  const pathname = usePathname();
  const onSetup = SETUP_PATHS.includes(pathname);

  return (
    <>
      {/* ── Desktop: the aluminium side column ─────────────────────────── */}
      <aside className="app-rail rail-frame-side fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col gap-7 border-r px-4 py-[26px] min-[901px]:flex">
        <div className="px-2">
          <Wordmark className="text-[1.75rem]" />
          <div className="mt-1.5 text-micro font-bold text-bone">Plan · Season · Race</div>
        </div>
        <nav aria-label="Main navigation" className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[44px] items-center gap-3 rounded-control px-3 text-base font-bold transition-colors duration-150 ease-out ${
                  active ? "bg-chalk text-lane" : "text-chalk hover:bg-white/45"
                }`}
              >
                <Icon name={item.icon} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-1">
          <Link
            href="/settings"
            aria-current={onSetup ? "page" : undefined}
            className={`flex min-h-[44px] items-center gap-3 rounded-control px-3 text-base font-bold transition-colors duration-150 ease-out ${
              onSetup ? "bg-chalk text-lane" : "text-chalk hover:bg-white/45"
            }`}
          >
            <Icon name="setup" />
            Setup
          </Link>
        </div>
      </aside>

      {/* ── Top line: the rail top bar on phones, a plain row on desktop ── */}
      <header className="rail-frame sticky top-0 z-20 -mx-4 !-mt-6 mb-5 flex min-h-[56px] items-center justify-between gap-3 border-b px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:-mx-6 sm:px-6 min-[901px]:static min-[901px]:mx-0 min-[901px]:!mt-0 min-[901px]:min-h-0 min-[901px]:border-0 min-[901px]:bg-none min-[901px]:p-0 min-[901px]:pt-0">
        <Wordmark className="text-[1.375rem] min-[901px]:hidden" />
        <div className="ml-auto flex items-center gap-3">
          {countdown && <Countdown countdown={countdown} />}
          {action}
          <Link
            href="/settings"
            aria-current={onSetup ? "page" : undefined}
            aria-label="Setup and tools"
            title="Setup & tools"
            className={`flex h-11 w-11 items-center justify-center rounded-control border-[1.5px] transition-colors duration-150 ease-out min-[901px]:hidden ${
              onSetup ? "border-chalk bg-chalk text-lane" : "border-rail-edge text-chalk hover:bg-white/45"
            }`}
          >
            <Icon name="setup" />
          </Link>
        </div>
      </header>

      {/* ── Phone: the bottom tab bar on panel white ───────────────────── */}
      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 gap-1 border-t border-edge bg-lane px-1.5 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] min-[901px]:hidden"
      >
        {NAV.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              className={`flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-control text-micro font-bold transition-colors duration-150 ease-out ${
                active ? "bg-chalk text-lane" : "text-bone hover:text-chalk"
              }`}
            >
              <Icon name={item.icon} />
              <span aria-hidden="true">{item.short}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
