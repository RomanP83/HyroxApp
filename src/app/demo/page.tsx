"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  computeSessionFeedback,
  generatePlan,
  initialAthleteState,
  microCalibrate,
  STATIONS,
  stationForWeek,
  type AthleteProfile,
  type AthleteState,
  type Division,
  type ExperienceLevel,
  type GeneratedPlan,
  type GeneratedSession,
  type LoadEntry,
  type SessionFeedback,
  type SessionType,
  type Station,
} from "@/lib/engine";
import { DEMO_LIBRARY } from "@/lib/demoLibrary";
import { SessionCard, type LogAction } from "@/components/SessionCard";
import { FeedbackCard } from "@/components/FeedbackCard";
import { fmtClock, fmtPace, PHASE_COLORS, titleCase } from "@/lib/format";
import { SparkIcon } from "@/components/icons";
import { haptic } from "@/lib/haptics";

export default function DemoPage() {
  const [division, setDivision] = useState<Division>("open");
  const [level, setLevel] = useState<ExperienceLevel>("intermediate");
  const [days, setDays] = useState(4);
  const [weeks, setWeeks] = useState(12);
  const [fiveK, setFiveK] = useState(1350);

  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [state, setState] = useState<AthleteState | null>(null);
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [weekIdx, setWeekIdx] = useState(0);
  const [feed, setFeed] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<Record<string, "done" | "skipped">>({});
  const [feedback, setFeedback] = useState<SessionFeedback | null>(null);

  const loadHistory = useRef<LoadEntry[]>([]);
  const lastDelta = useRef<Record<string, number>>({});

  const allWeeks = useMemo(() => (plan ? plan.phases.flatMap((p) => p.weeks) : []), [plan]);
  const phaseOf = (weekNumber: number) =>
    plan?.phases.find((p) => weekNumber >= p.start_week && weekNumber <= p.end_week);

  function build() {
    const p: AthleteProfile = {
      id: "demo",
      division,
      experience_level: level,
      five_k_seconds: fiveK,
      station_estimates: {},
      training_days_per_week: days,
      equipment_access: "full_gym",
    };
    const s = initialAthleteState(p);
    loadHistory.current = [];
    lastDelta.current = {};
    setProfile(p);
    setState(s);
    setPlan(generatePlan({ profile: p, state: s, library: DEMO_LIBRARY, weeksToRace: weeks }));
    setWeekIdx(0);
    setFeed([]);
    setStatuses({});
  }

  function onLog(weekNumber: number, session: GeneratedSession, action: LogAction) {
    if (!profile || !state) return;
    const { sort_order: sortOrder, session_type: sessionType, intensity_rpe_target: rpeTarget } = session;
    const key = `${weekNumber}:${sortOrder}`;
    if (action === "skip") {
      setStatuses((m) => ({ ...m, [key]: "skipped" }));
      setFeed((f) => ["A missed session is not a broken plan — the lowest-priority slot just drops, no make-up pile-up.", ...f]);
      return;
    }
    const rpeActual = action === "planned" ? rpeTarget : action === "harder" ? rpeTarget + 2 : rpeTarget - 2;
    const clampedRpe = Math.max(1, Math.min(10, rpeActual));
    const duration = session.planned_duration_min;
    loadHistory.current = [{ at: new Date(), srpe: clampedRpe * duration }, ...loadHistory.current];

    const station = sessionType === "station_work" ? stationForWeek(weekNumber) : undefined;
    const res = microCalibrate({
      state,
      profile,
      sessionType: sessionType as SessionType,
      station,
      rpeTarget,
      rpeActual: clampedRpe,
      previousSameTypeDelta: lastDelta.current[sessionType],
      durationActualMin: duration,
      loadHistory: loadHistory.current,
    });
    lastDelta.current[sessionType] = clampedRpe - rpeTarget;

    // Trainingsfeedback (deterministic — same engine module the API uses).
    haptic("milestone");
    setFeedback(
      computeSessionFeedback({
        sessionType: sessionType as SessionType,
        sessionTitle: session.title,
        rpeTarget,
        rpeActual: clampedRpe,
        plannedDurationMin: session.planned_duration_min,
        actualDurationMin: duration,
      }),
    );

    setState(res.state);
    setStatuses((m) => ({ ...m, [key]: "done" }));
    // Regenerate so *upcoming* weeks reflect the new tiers/paces — the core promise.
    setPlan(generatePlan({ profile, state: res.state, library: DEMO_LIBRARY, weeksToRace: weeks }));
    if (res.adjustments.length) {
      setFeed((f) => [...res.adjustments.map((a) => a.reason), ...f]);
    } else {
      setFeed((f) => ["Logged. No change needed — you're right in the target zone.", ...f]);
    }
  }

  const week = allWeeks[weekIdx];
  const phase = week ? phaseOf(week.week_number) : undefined;

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-muted hover:text-ink">
          ← Home
        </Link>
        <span className="pill">Live engine · runs entirely in your browser</span>
      </div>

      <h1 className="text-2xl font-bold">Generate a real plan, then watch it adapt</h1>
      <p className="text-muted">
        This is the actual periodization engine. Set your profile, generate, then log sessions as{" "}
        <b>Harder</b> or <b>Easier</b> — the station tiers, paces and finish-time estimate
        recalibrate and future weeks re-render live.
      </p>

      {/* Profile form */}
      <div className="card grid gap-4 sm:grid-cols-5">
        <div>
          <label className="label">Division</label>
          <select className="input" value={division} onChange={(e) => setDivision(e.target.value as Division)}>
            <option value="open">Open</option>
            <option value="pro">Pro</option>
            <option value="doubles">Doubles</option>
            <option value="masters_open">Masters Open</option>
          </select>
        </div>
        <div>
          <label className="label">Level</label>
          <select className="input" value={level} onChange={(e) => setLevel(e.target.value as ExperienceLevel)}>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>
        <div>
          <label className="label">Training days</label>
          <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[3, 4, 5, 6].map((d) => (
              <option key={d} value={d}>
                {d} / week
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Weeks to race</label>
          <select className="input" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
            {[8, 9, 10, 11, 12, 14, 16].map((w) => (
              <option key={w} value={w}>
                {w} weeks
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">5K time (sec)</label>
          <input className="input" type="number" value={fiveK} onChange={(e) => setFiveK(Number(e.target.value))} />
        </div>
      </div>
      <button className="btn-primary" onClick={build}>
        {plan ? "Regenerate plan" : "Generate my plan →"}
      </button>

      {plan && state && week && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Week column */}
          <div className="space-y-4">
            {/* Phase bar */}
            <div className="flex gap-1">
              {allWeeks.map((w, i) => {
                const ph = phaseOf(w.week_number);
                return (
                  <button
                    key={w.week_number}
                    onClick={() => setWeekIdx(i)}
                    title={`Week ${w.week_number} · ${ph?.phase_type}`}
                    className={`h-8 flex-1 rounded ${i === weekIdx ? "ring-2 ring-white" : ""}`}
                    style={{ background: PHASE_COLORS[ph?.phase_type ?? "base"], opacity: i === weekIdx ? 1 : 0.55 }}
                  />
                );
              })}
            </div>

            <div className="card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="pill" style={{ color: PHASE_COLORS[phase?.phase_type ?? "base"] }}>
                    {titleCase(phase?.phase_type ?? "")}
                  </span>
                  <span className="font-semibold">Week {week.week_number}</span>
                  {week.is_deload && <span className="pill text-accent2">deload</span>}
                  {week.is_benchmark_week && <span className="pill text-accent2">benchmark</span>}
                </div>
                <div className="flex gap-2">
                  <button className="btn-ghost" disabled={weekIdx === 0} onClick={() => setWeekIdx((i) => i - 1)}>
                    ←
                  </button>
                  <button
                    className="btn-ghost"
                    disabled={weekIdx === allWeeks.length - 1}
                    onClick={() => setWeekIdx((i) => i + 1)}
                  >
                    →
                  </button>
                </div>
              </div>
              {/* Why this week — PP1 */}
              <p className="mt-3 text-sm text-muted">{week.weekly_goal}</p>
            </div>

            {week.sessions.map((s) => (
              <SessionCard
                key={s.sort_order}
                session={s}
                status={statuses[`${week.week_number}:${s.sort_order}`] ?? "planned"}
                onLog={(action) => onLog(week.week_number, s, action)}
              />
            ))}
          </div>

          {/* Live state column */}
          <aside className="space-y-4">
            <div className="card">
              <div className="text-sm text-muted">Estimated finish</div>
              <div className="text-3xl font-bold">{fmtClock(state.predicted_race_time_sec)}</div>
              <div className="text-xs text-muted">estimate · calibrates as you log</div>
            </div>

            <div className="card">
              <div className="mb-2 text-sm font-semibold">Station tiers</div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                {STATIONS.map((st) => (
                  <div key={st} className="flex justify-between">
                    <span className="text-muted">{titleCase(st)}</span>
                    <span className="font-mono text-accent2">T{state.station_tiers[st]}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="mb-2 text-sm font-semibold">Pace zones</div>
              <div className="space-y-1 text-xs">
                <Row k="Easy" v={fmtPace(state.pace_zones.easy_sec_km)} />
                <Row k="Tempo" v={fmtPace(state.pace_zones.tempo_sec_km)} />
                <Row k="Interval" v={fmtPace(state.pace_zones.interval_sec_km)} />
                <Row k="Race" v={fmtPace(state.pace_zones.race_sec_km)} />
                <Row k="ACWR" v={String(state.acwr)} />
              </div>
            </div>

            <div className="card">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <SparkIcon size={16} className="text-accent2" /> Adaptation log
              </div>
              {feed.length === 0 ? (
                <div className="text-xs text-muted">
                  All quiet so far — log a session as “Harder” or “Easier” and watch the engine respond. Every change is
                  explained.
                </div>
              ) : (
                <ul className="space-y-2 text-xs">
                  {feed.slice(0, 8).map((r, i) => (
                    <li key={i} className="flex items-start gap-2 rounded border border-line bg-surface2 p-2 animate-fade-up">
                      <SparkIcon size={14} className="mt-0.5 shrink-0 text-accent2" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}

      {feedback && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-12"
          onClick={() => setFeedback(null)}
        >
          <div className="w-full max-w-lg animate-pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 text-center text-sm font-semibold text-muted">
              Training feedback
            </div>
            <FeedbackCard feedback={feedback} onClose={() => setFeedback(null)} />
          </div>
        </div>
      )}
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{k}</span>
      <span className="font-mono">{v}</span>
    </div>
  );
}
