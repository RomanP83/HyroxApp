"use client";

// ============================================================================
// A sheet that rises from the bottom edge on a phone and sits centred on a
// desktop. One component for every "decide one thing, then get back to the
// week" moment: the effort after a session, the session itself, a swap.
//
// Escape and a tap on the dimmed backdrop close it; the panel scrolls on its
// own when its content is taller than the screen.
// ============================================================================
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  onClose: () => void;
  /** Read out by screen readers when the sheet opens. */
  label: string;
  children: React.ReactNode;
  /** Full height on a phone — for a whole session rather than one question. */
  tall?: boolean;
}

export function Sheet({ onClose, label, children, tall }: Props) {
  // Rendered into <body>: a sheet opened from inside another sheet (the effort
  // question inside a session) must not be positioned by its animated parent.
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // The page under a sheet must not scroll along with it.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  if (!host) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`w-full max-w-lg overflow-y-auto rounded-t-panel border border-edge bg-lane px-4 pt-2.5 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg animate-fade-up sm:rounded-panel sm:pt-4 ${
          tall ? "h-[92vh] sm:h-auto sm:max-h-[90vh] sm:max-w-2xl" : "max-h-[90vh]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-edge sm:hidden" aria-hidden="true" />
        {children}
      </div>
    </div>,
    host,
  );
}
