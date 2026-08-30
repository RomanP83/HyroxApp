"use client";

// ============================================================================
// Registers the offline worker, and shows when the app is running on its
// memory rather than on the network.
//
// The banner matters as much as the caching: a page served from cache looks
// exactly like a fresh one, and a training week that silently shows yesterday's
// state is worse than no offline mode at all.
// ============================================================================
import { useEffect, useState } from "react";

export function ServiceWorker() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // A failed registration costs offline support and nothing else; the app
        // works exactly as before, so there is nothing to tell the athlete.
      });
    }
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 bg-amber/90 px-4 py-1.5 text-center text-micro font-semibold text-void"
    >
      Offline — this is the last version that loaded. Logging needs signal.
    </div>
  );
}
