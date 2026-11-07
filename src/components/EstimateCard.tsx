// ============================================================================
// The one number the whole system exists to move — the estimated finish — and
// the goal next to it. It used to sit beside the training week; it lives on
// Progress now, with every other number that says where you stand.
// ============================================================================
import type { GoalCheck } from "@/lib/engine";
import { STATION_LABELS } from "@/lib/engine";
import { fmtClock, fmtPace } from "@/lib/format";

interface Props {
  predictedSeconds: number | null | undefined;
  goalCheck: GoalCheck | null;
  easyPaceSecKm?: number | null;
  racePaceSecKm?: number | null;
}

export function EstimateCard({ predictedSeconds, goalCheck, easyPaceSecKm, racePaceSecKm }: Props) {
  return (
    <div className="card-focal" data-testid="estimate-card">
      <div className="text-meta font-bold text-bone">Estimated finish</div>
      <div className="mt-1.5 font-mono text-clock font-bold tabular-nums text-chalk">
        {fmtClock(predictedSeconds)}
      </div>
      {goalCheck && <GoalLine check={goalCheck} />}
      {(easyPaceSecKm != null || racePaceSecKm != null) && (
        <dl className="mt-4 space-y-1.5 border-t border-edge pt-3">
          <Row k="Easy pace" v={fmtPace(easyPaceSecKm ?? undefined)} />
          <Row k="Race pace" v={fmtPace(racePaceSecKm ?? undefined)} />
        </dl>
      )}
      <p className="mt-3 text-micro text-smoke">Recalibrates every time you log.</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-meta">
      <dt className="text-ash">{k}</dt>
      <dd className="font-mono tabular-nums text-bone">{v}</dd>
    </div>
  );
}

/**
 * The goal, and the honest distance to it.
 *
 * Both numbers existed long before this line did — the app knew what an athlete
 * would run and what they had asked for, and never said the two out loud
 * together. Splitting the shortfall into what the stations can still give and
 * what would have to come from the legs is what turns it from a verdict into
 * something you can train against.
 */
function GoalLine({ check }: { check: GoalCheck }) {
  const short = Math.abs(check.delta_seconds);
  return (
    <div className="mt-3 border-t border-edge pt-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-meta font-bold text-bone">Goal</span>
        <span className="font-mono text-base font-semibold tabular-nums text-bone">
          {fmtClock(check.goal_seconds)}
        </span>
      </div>

      {check.on_course ? (
        <p className="mt-1.5 text-meta leading-relaxed text-go">
          <b>{fmtClock(short)} inside it</b> on today&apos;s numbers.
        </p>
      ) : check.out_of_reach ? (
        <p className="mt-1.5 text-meta leading-relaxed text-amber">
          The stations alone take longer than this. Nothing in the legs can close it.
        </p>
      ) : (
        <>
          <p className="mt-1.5 text-meta leading-relaxed text-amber">
            <b>{fmtClock(short)} to find.</b>{" "}
            {check.station_gap_seconds > 0 && (
              <>
                {fmtClock(check.station_gap_seconds)} of it is sitting in the stations
                {check.worst[0] ? ` — ${STATION_LABELS[check.worst[0].station].toLowerCase()} first` : ""}.{" "}
              </>
            )}
            {check.running_gap_seconds > 0 && (
              <>The other {fmtClock(check.running_gap_seconds)} has to come from the legs.</>
            )}
          </p>
          {check.running_gap_seconds > 0 && (
            <p className="mt-1.5 text-micro leading-relaxed text-smoke">
              With every station perfect that is still{" "}
              <span className="font-mono tabular-nums">
                {fmtPace(check.required_pace_after_stations_sec_km)}
              </span>{" "}
              for all eight kilometres.
            </p>
          )}
        </>
      )}
    </div>
  );
}

