import { AppHeader } from "@/components/AppHeader";

// The gym screen's outline: day strip, the day's session, the week's progress.
export default function TodayLoading() {
  return (
    <main className="space-y-6">
      <AppHeader />
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="skeleton h-9 w-48" />
        <div className="grid grid-cols-7 gap-1">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton h-16 w-full" />
          ))}
        </div>
        <div className="skeleton h-40 w-full" />
        <div className="skeleton h-20 w-full" />
        <div className="skeleton h-24 w-full" />
      </div>
    </main>
  );
}
