import { AppHeader } from "@/components/AppHeader";

// The Plan tab's outline: the switch, the week heading, one line a day.
export default function PlanLoading() {
  return (
    <main className="space-y-6">
      <AppHeader />
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="skeleton mx-auto h-10 w-full max-w-xs" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton mx-auto h-10 w-40" />
        <div className="skeleton h-14 w-full" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="skeleton h-14 w-full" />
        ))}
      </div>
    </main>
  );
}
