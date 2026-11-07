import { AppHeader } from "@/components/AppHeader";

// Shown the moment a tab is tapped, while the server reads the page's data:
// the navigation stays where it is with the new tab already lit, and the page
// shows its outline instead of the old page sitting there looking unpressed.
export default function SettingsLoading() {
  return (
    <main className="space-y-8">
      <AppHeader />
      <div className="skeleton h-8 w-44" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skeleton h-40 w-full" />
      ))}
    </main>
  );
}
