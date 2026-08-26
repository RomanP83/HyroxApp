"use client";

// ============================================================================
// The morning after the race.
//
// A plan whose race day has passed used to keep showing its taper week for
// ever — the current week clamps to the last one — while the nightly job
// happily rebased it into a two-week taper aimed at a date in the past. It is
// a record now, and this is the page that says so and offers the two real ways
// forward: the next race, or a block with no race in it.
// ============================================================================
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { readApi } from "@/lib/apiResult";
import { haptic } from "@/lib/haptics";
import { CalendarIcon, LeafIcon, SpinnerIcon } from "./icons";
import { AppHeader } from "./AppHeader";

export function PlanFinished({ raceDate }: { raceDate: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startTransition() {
    setBusy(true);
    setError(null);
    haptic("confirm");
    const res = await fetch("/api/plans/transition", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const result = await readApi(res);
    setBusy(false);
    if (!result.ok) return setError(result.message);
    router.push("/plan");
    router.refresh();
  }

  return (
    // The header stays: this is a state an athlete sits in for days, and
    // progress, the season calendar and the strength page all still matter
    // from here. Only the week view has nothing left to show.
    <main className="mx-auto max-w-3xl space-y-6 pb-16 animate-fade-up">
      <AppHeader />
      <div className="mx-auto max-w-lg space-y-5 pt-6">
      <div className="text-center">
        <div className="text-4xl">🏁</div>
        <h1 className="mt-2 text-h2 font-bold text-chalk">That cycle is done</h1>
        <p className="mt-2 text-ash">
          Your race was on <span className="font-mono tabular-nums">{raceDate}</span>. The plan that
          led to it stays as a record — every logged week is still there under{" "}
          <Link href="/progress" className="text-flame hover:underline">
            progress
          </Link>
          .
        </p>
      </div>

      <div className="card space-y-3">
        <h2 className="text-lead font-semibold text-chalk">Pick your next race</h2>
        <p className="text-meta leading-relaxed text-ash">
          Put it in the calendar and build from it — the phases are counted backwards from the day,
          so the block is as long as the runway you actually have.
        </p>
        <Link href="/season" className="btn-primary">
          <CalendarIcon size={16} />
          Open the season calendar
        </Link>
      </div>

      <div className="card space-y-3">
        <h2 className="text-lead font-semibold text-chalk">Not yet — run the transition block</h2>
        <p className="text-meta leading-relaxed text-ash">
          Four modules that build on each other:{" "}
          <b className="text-bone">Reset</b> (three days of nothing, then movement without impact),{" "}
          <b className="text-bone">Re-Introduction</b> (short aerobic runs and light full-body
          strength), <b className="text-bone">Volume Reload</b> (capacity back, real lifts again),
          then <b className="text-bone">Off-Season</b> for as long as there is room — heavy
          compounds, high Zone-2 volume and the weaknesses the race exposed, in four-week cycles of
          three loading weeks and one deload.
        </p>
        <p className="text-meta leading-relaxed text-ash">
          No compromised running anywhere in it, and no simulation: race specificity is what the
          next cycle is for. If a race is already in your calendar the block runs exactly as long as
          the room before it leaves — the race block keeps its full runway.
        </p>
        <button className="btn-ghost" onClick={() => void startTransition()} disabled={busy}>
          {busy ? <SpinnerIcon size={16} /> : <LeafIcon size={16} />}
          Start a transition block
        </button>
        {error && <p className="text-meta text-stop">{error}</p>}
      </div>
      </div>
    </main>
  );
}
