import { AppHeader } from "@/components/AppHeader";

// Shown the moment a tab is tapped, while the server reads the page's data:
// the navigation stays where it is with the new tab already lit, and the page
// shows its outline instead of the old page sitting there looking unpressed.
export default function SeasonLoading() {
  return (
    <main className="space-y-6">
      <AppHeader />
      <div className="skeleton h-8 w-40" />
      <div className="skeleton h-24 w-full" />
      <div className="skeleton h-64 w-full" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton h-20 w-full" />
      ))}
    </main>
  );
}
