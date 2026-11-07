import { AppHeader } from "@/components/AppHeader";

// Shown the moment a tab is tapped, while the server reads the page's data:
// the navigation stays where it is with the new tab already lit, and the page
// shows its outline instead of the old page sitting there looking unpressed.
export default function RaceLoading() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 pb-16">
      <AppHeader />
      <div className="skeleton h-8 w-40" />
      <div className="skeleton h-32 w-full" />
      <div className="skeleton h-72 w-full" />
      <div className="skeleton h-40 w-full" />
    </main>
  );
}
