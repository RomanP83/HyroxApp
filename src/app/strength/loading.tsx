import { AppHeader } from "@/components/AppHeader";

// Shown the moment a tab is tapped, while the server reads the page's data:
// the navigation stays where it is with the new tab already lit, and the page
// shows its outline instead of the old page sitting there looking unpressed.
export default function StrengthLoading() {
  return (
    <main className="space-y-6">
      <AppHeader />
      <div className="skeleton h-8 w-56" />
      <div className="skeleton h-5 w-72" />
      {[0, 1].map((i) => (
        <div key={i} className="skeleton h-64 w-full" />
      ))}
    </main>
  );
}
