// The Plan tab holds two zoom levels of the same plan: this week, and the
// season around it. One switch, two addresses, so either can be bookmarked.
import Link from "next/link";

export function PlanSwitch({ active }: { active: "week" | "season" }) {
  const item = (key: "week" | "season", href: string, label: string) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={`flex min-h-[40px] items-center justify-center rounded-[6px] text-base font-bold transition-colors duration-150 ease-out ${
        active === key ? "bg-lane text-chalk shadow-sm" : "text-ash hover:text-chalk"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <nav
      aria-label="Plan view"
      className="mx-auto grid w-full max-w-xs grid-cols-2 gap-1 rounded-control border border-edge bg-rack p-1"
    >
      {item("week", "/plan", "Week")}
      {item("season", "/season", "Season")}
    </nav>
  );
}
