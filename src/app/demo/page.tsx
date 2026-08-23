"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  computeSessionFeedback,
  generatePlan,
  weeklyRunSummary,
  initialAthleteState,
  microCalibrate,
  STATIONS,
  stationForWeek,
  type AthleteProfile,
  type AthleteState,
  type DaySlot,
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

const DEMO_DAY_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Everything a logged day touches — snapshotted so a single day can be undone. */
interface DemoWorld {
  state: AthleteState;
  loadHistory: LoadEntry[];
  lastDelta: Record<string, number>;
  statuses: Record<string, "done" | "skipped">;
  feed: string[];
}

interface DemoLogInput {
  key: string;
  weekNumber: number;
  session: GeneratedSession;
  action: LogAction;
}

type DemoLogEntry = DemoLogInput & { before: DemoWorld };

export default function DemoPage() {
  const [division, setDivision] = useState<Division>("open");
  const [level, setLevel] = useState<ExperienceLevel>("intermediate");
  const [days, setDays] = useState(4);
  const [doubles, setDoubles] = useState(0);
  const [kmPeak, setKmPeak] = useState(0); // 0 = let the engine decide
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
  // Every logged day plus the world as it was right before it — that snapshot
  // is what "Undo" restores, exactly like session_logs.state_before does
  // server-side (see lib/resetSession.ts).
  const history = useRef<DemoLogEntry[]>([]);

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
      doubles_per_week: doubles,
      weekly_km_peak: kmPeak || null,
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
    history.current = [];
  }

  /** Apply one quick-log tap to a world snapshot — pure, so undo can replay it. */
  function applyEntry(
    p: AthleteProfile,
    world: DemoWorld,
    entry: DemoLogInput,
  ): { world: DemoWorld; feedback: SessionFeedback | null } {
    const { weekNumber, session, action, key } = entry;
    const { session_type: sessionType, intensity_rpe_target: rpeTarget } = session;

    if (action === "skip") {
      return {
        world: {
          ...world,
          statuses: { ...world.statuses, [key]: "skipped" },
          feed: [
            "A missed session is not a broken plan — the lowest-priority slot just drops, no make-up pile-up.",
            ...world.feed,
          ],
        },
        feedback: null,
      };
    }

    const rpeActual = action === "planned" ? rpeTarget : action === "harder" ? rpeTarget + 2 : rpeTarget - 2;
    const clampedRpe = Math.max(1, Math.min(10, rpeActual));
    const duration = session.planned_duration_min;
    const nextLoad: LoadEntry[] = [{ at: new Date(), srpe: clampedRpe * duration }, ...world.loadHistory];

    const station = sessionType === "station_work" ? stationForWeek(weekNumber) : undefined;
    const res = microCalibrate({
      state: world.state,
      profile: p,
      sessionType: sessionType as SessionType,
      station,
      rpeTarget,
      rpeActual: clampedRpe,
      previousSameTypeDelta: world.lastDelta[sessionType],
      durationActualMin: duration,
      loadHistory: nextLoad,
    });

    return {
      world: {
        state: res.state,
        loadHistory: nextLoad,
        lastDelta: { ...world.lastDelta, [sessionType]: clampedRpe - rpeTarget },
        statuses: { ...world.statuses, [key]: "done" },
        feed: res.adjustments.length
          ? [...res.adjustments.map((a) => a.reason), ...world.feed]
          : ["Logged. No change needed — you're right in the target zone.", ...world.feed],
      },
      // Trainingsfeedback (deterministic — same engine module the API uses).
      feedback: computeSessionFeedback({
        sessionType: sessionType as SessionType,
        sessionTitle: session.title,
        rpeTarget,
        rpeActual: clampedRpe,
        plannedDurationMin: session.planned_duration_min,
        actualDurationMin: duration,
      }),
    };
  }

  /** Push a world snapshot into React state + regenerate the upcoming weeks. */
  function commit(p: AthleteProfile, world: DemoWorld) {
    setState(world.state);
    setStatuses(world.statuses);
    setFeed(world.feed);
    loadHistory.current = world.loadHistory;
    lastDelta.current = world.lastDelta;
    // Regenerate so *upcoming* weeks reflect the new tiers/paces — the core promise.
    setPlan(generatePlan({ profile: p, state: world.state, library: DEMO_LIBRARY, weeksToRace: weeks }));
  }

  function currentWorld(current: AthleteState): DemoWorld {
    return {
      state: current,
      loadHistory: loadHistory.current,
      lastDelta: lastDelta.current,
      statuses,
      feed,
    };
  }

  function onLog(weekNumber: number, session: GeneratedSession, action: LogAction) {
    if (!profile || !state) return;
    const entry: DemoLogInput = {
      key: `${weekNumber}:${session.sort_order}`,
      weekNumber,
      session,
      action,
    };
    const before = currentWorld(state);
    const { world, feedback: fb } = applyEntry(profile, before, entry);
    history.current = [...history.current, { ...entry, before }];
    if (fb) {
      haptic("milestone");
      setFeedback(fb);
    }
    commit(profile, world);
  }

  /**
   * Undo a single day (mis-tap on Harder/Easier/Skip): rewind to the snapshot
   * taken before it, then replay every day logged after it. Same contract as
   * the app's DELETE /api/sessions/[id]/log.
   */
  /**
   * Moving a session in the demo mirrors what the server does for a real plan
   * (migration 0022): the target half of the day is either free, or the two
   * sessions trade places. Nothing is dropped, and no day ends up with two
   * sessions in the same half.
   */
  function onMove(weekNumber: number, session: GeneratedSession, day: number, slot: DaySlot) {
    const from = { day: session.day_hint, slot: session.day_slot ?? "am" };
    if (from.day === day && from.slot === slot) return;

    // Who is already there decides whether this is a move or a swap. Read it
    // from the current plan, not from inside the state updater — that one can
    // run twice.
    const week = plan?.phases
      .flatMap((ph) => ph.weeks)
      .find((w) => w.week_number === weekNumber);
    const other =
      week?.sessions.find(
        (o) =>
          o.sort_order !== session.sort_order &&
          o.day_hint === day &&
          (o.day_slot ?? "am") === slot,
      ) ?? null;

    setPlan((prev) =>
      prev
        ? {
            ...prev,
            phases: prev.phases.map((ph) => ({
              ...ph,
              weeks: ph.weeks.map((w) => {
                if (w.week_number !== weekNumber) return w;
                return {
                  ...w,
                  sessions: w.sessions
                    .map((o) => {
                      if (o.sort_order === session.sort_order) {
                        return { ...o, day_hint: day, day_slot: slot };
                      }
                      if (other && o.sort_order === other.sort_order) {
                        return { ...o, day_hint: from.day, day_slot: from.slot };
                      }
                      return o;
                    })
                    .sort(
                      (a, b) =>
                        a.day_hint - b.day_hint ||
                        (a.day_slot === "am" ? 0 : 1) - (b.day_slot === "am" ? 0 : 1),
                    ),
                };
              }),
            })),
          }
        : prev,
    );

    haptic("confirm");
    setFeed((f) => [
      other
        ? `Swapped "${session.title}" with "${other.title}" — the week bends, the plan doesn't break.`
        : `Moved "${session.title}" to ${DEMO_DAY_LABELS[day]} — the week bends, the plan doesn't break.`,
      ...f,
    ]);
  }

  function onReset(weekNumber: number, session: GeneratedSession) {
    if (!profile) return;
    const key = `${weekNumber}:${session.sort_order}`;
    const idx = history.current.findIndex((e) => e.key === key);
    if (idx < 0) return;

    const replay = history.current.slice(idx + 1);
    let world: DemoWorld = history.current[idx].before;
    const replayed: DemoLogEntry[] = [];
    for (const e of replay) {
      const next = applyEntry(profile, world, e);
      replayed.push({ ...e, before: world });
      world = next.world;
    }
    history.current = [...history.current.slice(0, idx), ...replayed];

    haptic("tap");
    setFeedback(null);
    commit(profile, {
      ...world,
      feed: [`Reset — "${session.title}" is back on the plan, and every change it caused is undone.`, ...world.feed],
    });
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
        <b>Felt harder</b> or <b>Felt easier</b> — the station tiers, paces and finish-time estimate
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
          <label className="label">Double days</label>
          <select
            className="input"
            aria-label="Double days"
            value={doubles}
            onChange={(e) => setDoubles(Number(e.target.value))}
          >
            {[0, 1, 2, 3].map((d) => (
              <option key={d} value={d}>
                {d === 0 ? "none" : `${d} / week`}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Peak km / week</label>
          <select
            className="input"
            value={kmPeak}
            onChange={(e) => setKmPeak(Number(e.target.value))}
          >
            {[0, 30, 40, 50, 60, 70].map((km) => (
              <option key={km} value={km}>
                {km === 0 ? "auto" : `${km} km`}
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
                  <button
                    className="btn-ghost"
                    aria-label="Previous week"
                    disabled={weekIdx === 0}
                    onClick={() => setWeekIdx((i) => i - 1)}
                  >
                    ←
                  </button>
                  <button
                    className="btn-ghost"
                    aria-label="Next week"
                    disabled={weekIdx === allWeeks.length - 1}
                    onClick={() => setWeekIdx((i) => i + 1)}
                  >
                    →
                  </button>
                </div>
              </div>
              {/* Why this week — PP1 */}
              <p className="mt-3 text-sm text-muted">{week.weekly_goal}</p>
              {(() => {
                // Running is 50-60% of the race — show what the week adds up to.
                const summary = weeklyRunSummary(week.sessions, state.pace_zones, phase?.phase_type);
                if (!summary.runs) return null;
                const easyPct = Math.round(summary.easy_share * 100);
                return (
                  <div className="mt-3 border-t border-line pt-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                      <span className="font-semibold">Running this week</span>
                      <span className="text-muted">
                        {summary.total_km} km · {summary.runs} runs · {easyPct}% aerobic
                      </span>
                    </div>
                    <div className="mt-2 flex h-2 overflow-hidden rounded-full">
                      <div className="bg-ok" style={{ width: `${easyPct}%` }} />
                      <div className="bg-accent" style={{ width: `${100 - easyPct}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-muted">{summary.note}</p>
                  </div>
                );
              })()}
            </div>

            {week.sessions.map((s) => (
              <SessionCard
                key={s.sort_order}
                session={s}
                showSlot={
                  week.sessions.filter((o) => o.day_hint === s.day_hint).length > 1
                }
                status={statuses[`${week.week_number}:${s.sort_order}`] ?? "planned"}
                onLog={(action) => onLog(week.week_number, s, action)}
                onReset={() => onReset(week.week_number, s)}
                onMove={(day, slot) => onMove(week.week_number, s, day, slot)}
                occupied={
                  new Set(week.sessions.map((o) => `${o.day_hint}-${o.day_slot ?? "am"}`))
                }
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
                  All quiet so far — log a session as “Felt harder” or “Felt easier” (how it went, not
                  what you want next) and watch the engine respond. Every change is explained.
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
