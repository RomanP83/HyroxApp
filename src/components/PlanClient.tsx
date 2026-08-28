"use client";

import { useEffect, useMemo, useState } from "react";
import { readApi } from "@/lib/apiResult";
import { dayDateOf } from "@/lib/planWeek";
import { weekItemsOf } from "@/lib/weekLayout";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { GeneratedSession, SessionFeedback } from "@/lib/engine";
import { AppHeader } from "./AppHeader";
import { SessionCard, type LogAction, type StrengthExerciseInput, type StrengthSetInput } from "./SessionCard";
import { FeedbackCard } from "./FeedbackCard";
import {
  DEMAND_COLORS,
  DEMAND_LABELS,
  fmtClock,
  fmtDayDate,
  WEEKDAY_LABELS,
  fmtPace,
  PHASE_COLORS,
  titleCase,
} from "@/lib/format";
import { PHASE_NUTRITION } from "@/lib/nutrition";
import type {
  EquipmentAccess,
  FrequencyAdvice,
  GoalCheck,
  PhaseType,
  Station,
  StationAlternative,
  VolumeAssessment,
  WeeklyRunSummary,
} from "@/lib/engine";
import { alternativesFor, resolveSubstitutions, STATION_LABELS } from "@/lib/engine";
import { haptic } from "@/lib/haptics";
import {
  LeafIcon,
  LockIcon,
  MedicalIcon,
  SparkIcon,
  SpinnerIcon,
} from "./icons";

export interface ClientSession {
  id: string;
  session: GeneratedSession;
  status: "planned" | "done" | "skipped" | "moved";
  /** The athlete's own strength day, when this session is one. */
  strength?: { templateName: string; exercises: StrengthExerciseInput[] } | null;
}

interface WeekMeta {
  id: string;
  week_number: number;
  is_deload: boolean;
  is_benchmark_week: boolean;
  weekly_goal: string;
  status: string;
}

interface PhaseMeta {
  phase_type: string;
  start_week: number;
  end_week: number;
}

interface Props {
  planId: string;
  profileId: string;
  paid: boolean;
  planStatus: string;
  raceDate: string;
  phases: PhaseMeta[];
  weeks: WeekMeta[];
  currentWeek: WeekMeta;
  /** The plan week today actually falls in — not necessarily the one shown. */
  thisWeekNumber: number;
  /**
   * A transition block has no race in it: race_date holds the block's own end.
   * Counting down to "Race day" on that date would be a plain untruth.
   */
  planKind: "race" | "transition";
  sessions: ClientSession[];
  state: any;
  adjustments: string[];
  locked: boolean;
  /** What this week's running adds up to — volume and 80/20 distribution. */
  runSummary: WeeklyRunSummary | null;
  /** Whether the subscription tier is configured (C4). */
  subscriptionAvailable: boolean;
  /** Goal against prediction — null until the athlete has set a goal. */
  goalCheck: GoalCheck | null;
  /** The Monday of the week on screen — the dates on the cards come off it. */
  weekStart: string;
  /** Weekdays the athlete pinned as rest days, 1 = Monday. */
  restDays: number[];
  /** The week's sessions could not be read. Not the same thing as a rest week. */
  sessionsFailed: boolean;
  /** What the athlete swaps each station for, and what their gym has. */
  substitutions: Record<string, string>;
  equipment: EquipmentAccess;
}

const ACTION_RPE: Record<Exclude<LogAction, "skip">, number> = { planned: 0, harder: 2, easier: -2 };

export function PlanClient(props: Props) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ sessionId: string; action: LogAction } | null>(null);
  // Which station's alternatives are open, and what is currently swapped.
  const [swapStation, setSwapStation] = useState<Station | null>(null);
  const [subs, setSubs] = useState<Record<string, string>>(props.substitutions);
  const substitutions = useMemo(() => resolveSubstitutions(subs), [subs]);

  async function swap(station: Station, slug: string | null) {
    haptic("confirm");
    // Optimistic: the athlete is standing at a busy sled, not waiting on us.
    setSubs((prev) => {
      const next = { ...prev };
      if (slug) next[station] = slug;
      else delete next[station];
      return next;
    });
    setSwapStation(null);
    const res = await fetch("/api/sessions/substitution", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ station, alternative_slug: slug }),
    });
    const result = await readApi(res);
    if (!result.ok) {
      setSubs(props.substitutions);
      setToast(result.message);
      return;
    }
    setToast(
      slug
        ? "Swapped. It stays swapped until you put it back — your gym, your call."
        : `${STATION_LABELS[station]} is back.`,
    );
  }
  const [feedback, setFeedback] = useState<SessionFeedback | null>(null);
  // Perceived speed (#6): flip the card state the instant the tap lands;
  // the server round-trip only confirms (or reverts on error).
  const [optimistic, setOptimistic] = useState<Record<string, "done" | "skipped" | "planned">>({});
  const [resetting, setResetting] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  // Today is a client fact: resolving it during render would make the server
  // and the browser disagree about which day to highlight.
  const [today, setToday] = useState<{ weekday: number; daysToRace: number } | null>(null);

  useEffect(() => {
    const now = new Date();
    const weekday = now.getDay() === 0 ? 7 : now.getDay(); // Monday = 1
    const race = new Date(`${props.raceDate.slice(0, 10)}T00:00:00Z`).getTime();
    const midnight = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    setToday({
      weekday,
      daysToRace: Math.max(0, Math.round((race - midnight) / 86_400_000)),
    });
  }, [props.raceDate]);

  const daysToRace = today?.daysToRace ?? null;

  const phaseOf = (n: number) => props.phases.find((p) => n >= p.start_week && n <= p.end_week);
  // Days that carry an AM *and* a PM session — only there does the marker help.
  const doubleDays = new Set(
    props.sessions
      .map((cs) => cs.session.day_hint)
      .filter((day, i, all) => all.indexOf(day) !== i),
  );
  const currentPhase = phaseOf(props.currentWeek.week_number);

  // Seven days, with the days off derived rather than stored — see weekLayout.
  const weekItems = useMemo(() => weekItemsOf(props.sessions), [props.sessions]);
  // Which halves of the week are already occupied. The card only sees itself,
  // so the page — which sees the whole week — hands it the map.
  const occupied = new Set(
    props.sessions.map((cs) => `${cs.session.day_hint}-${cs.session.day_slot ?? "am"}`),
  );

  // B6: returning from Stripe — verify the checkout session server-side
  // instead of trusting a query flag, then clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutSession = params.get("checkout_session");
    if (!checkoutSession) return;
    fetch("/api/stripe/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ checkout_session_id: checkoutSession }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.paid) setToast("Payment confirmed — your full race cycle is unlocked. 🎉");
        router.replace("/plan");
        router.refresh();
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function injury(action: "activate" | "recover") {
    const res = await fetch("/api/plans/injury", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const out = await readApi(res);
    if (out.ok) {
      setToast(
        action === "activate"
          ? "Rehab mode on — low-impact until you reactivate."
          : "Plan rebuilt from today. Welcome back!",
      );
      router.refresh();
    } else {
      setToast(out.message || "Something went wrong.");
    }
  }

  async function log(
    sessionId: string,
    action: LogAction,
    target: number,
    strengthSets?: StrengthSetInput[],
  ) {
    setBusy({ sessionId, action });
    // Instant feedback (#6): the card flips before the network answers.
    setOptimistic((m) => ({ ...m, [sessionId]: action === "skip" ? "skipped" : "done" }));
    try {
      const body =
        action === "skip"
          ? { skip: true }
          : {
              ...(action === "planned"
                ? { completed_as_planned: true }
                : {
                    completed_as_planned: false,
                    rpe_actual: Math.max(1, Math.min(10, target + ACTION_RPE[action])),
                  }),
              ...(strengthSets?.length ? { strength_sets: strengthSets } : {}),
            };
      const res = await fetch(`/api/sessions/${sessionId}/log`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const out = await readApi<Record<string, any>>(res);
      if (!out.ok) throw new Error(out.message);
      const data = out.data;
      const reason = data?.adaptation?.adjustments?.[0]?.reason;
      // A new weight to consider outranks the generic confirmation: it is the
      // one thing that needs the athlete's decision.
      const suggestion = data?.strength?.suggestions?.[0];
      if (suggestion) {
        setToast(
          `${suggestion.exercise}: ${suggestion.reason} Take it on the strength page whenever you want.`,
        );
      }
      if (data?.feedback && action !== "skip") {
        haptic("milestone");
        setFeedback(data.feedback);
        if (reason && !suggestion) setToast(reason);
      } else if (!suggestion) {
        setToast(
          reason ??
            (action === "skip"
              ? "Skipped — life happens. No make-up pile-up, the plan bends."
              : "Nice work — session logged."),
        );
      }
      router.refresh();
    } catch {
      // Revert the optimistic flip — honesty beats speed.
      setOptimistic((m) => {
        const { [sessionId]: _, ...rest } = m;
        return rest;
      });
      setToast("Hmm, that didn't save. Give it another tap.");
    } finally {
      setBusy(null);
    }
  }

  // Mis-tap insurance (PP3): give a single day back. The server drops the log,
  // restores the pre-log fitness state and replays every later log, so the
  // plan lands exactly where it would be had the day never been logged.
  async function reset(sessionId: string) {
    setResetting(sessionId);
    const previous = optimistic[sessionId];
    setOptimistic((m) => ({ ...m, [sessionId]: "planned" }));
    setFeedback(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/log`, { method: "DELETE" });
      const out = await readApi<Record<string, any>>(res);
      if (!out.ok) throw new Error(out.message);
      const data = out.data;
      haptic("confirm");
      setToast(data?.reset?.reason ?? "Day reset — log it again whenever you're ready.");
      router.refresh();
    } catch {
      setOptimistic((m) => {
        if (previous) return { ...m, [sessionId]: previous };
        const { [sessionId]: _, ...rest } = m;
        return rest;
      });
      setToast("Couldn't reset that day. Give it another tap.");
    } finally {
      setResetting(null);
    }
  }

  /**
   * Move a session to another day of the week. A target that already holds a
   * session is a swap, not an error — the server does both rows in one
   * transaction, so the week can never end up with two sessions in one half.
   */
  async function move(sessionId: string, dayHint: number, daySlot: "am" | "pm") {
    setMovingId(sessionId);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/move`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ day_hint: dayHint, day_slot: daySlot }),
      });
      const out = await readApi(res);
      if (!out.ok) throw new Error(out.message);
      const data = out.data as Record<string, any>;
      haptic("confirm");
      setToast(data.reason ?? "Moved.");
      router.refresh();
    } catch {
      setToast("Couldn't move that session. Give it another tap.");
    } finally {
      setMovingId(null);
    }
  }

  // Volume is a change to every remaining week, so saving it rebuilds the plan
  // from today (the same rebase the injury-recovery flow uses).
  async function unlock(tier: "race_cycle" | "subscription" = "race_cycle") {
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: props.planId, tier }),
    });
    const out = await readApi<{ url?: string }>(res);
    if (out.data.url) window.location.href = out.data.url;
    else setToast(out.message || "Checkout unavailable — set STRIPE_* env vars.");
  }

  return (
    <main className="space-y-6">
      <AppHeader
        countdown={{
          label: props.planKind === "transition" ? "Block ends" : "Race day",
          days: daysToRace,
        }}
        action={
          !props.paid ? (
            <button className="btn-primary" onClick={() => unlock()}>
              Unlock full plan
            </button>
          ) : null
        }
      />

      {props.planStatus === "rehab" && (
        <div className="card border-amber/50 bg-rack flex flex-wrap items-center justify-between gap-3 animate-fade-up">
          <div className="flex items-start gap-3 text-base">
            <MedicalIcon size={18} className="mt-0.5 shrink-0 text-amber" />
            <span>
              <b>Rehab mode.</b> Stick to mobility and low-impact work — no plan stop, no lost
              progress. When you&apos;re ready, the plan rebuilds from that day.
            </span>
          </div>
          <button className="btn-primary" onClick={() => injury("recover")}>
            I&apos;m back — rebuild my plan
          </button>
        </div>
      )}

      {!props.paid && (
        <div className="card border-flame/40 bg-rack flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-start gap-3">
            <LockIcon size={18} className="mt-0.5 shrink-0 text-flame" />
            <span>
              <b>Free preview.</b> Week 1 is fully open. Unlock the race cycle to see every
              week’s sessions, weights and paces — one-time price, for your race.
            </span>
          </span>
          {props.subscriptionAvailable && (
            <button className="btn-ghost" onClick={() => unlock("subscription")}>
              Multi-racer? Subscribe instead
            </button>
          )}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          {/* ── The cycle, demoted to a strip: context, not the task. ─────── */}
          <div>
            <div className="flex gap-[3px]">
              {props.weeks.map((w) => {
                const ph = phaseOf(w.week_number);
                const active = w.week_number === props.currentWeek.week_number;
                const marked = w.is_deload || w.is_benchmark_week;
                return (
                  <Link
                    key={w.week_number}
                    href={`/plan?week=${w.week_number}`}
                    aria-label={`Week ${w.week_number}`}
                    title={`Week ${w.week_number} · ${titleCase(ph?.phase_type ?? "")}${
                      w.is_deload ? " · deload" : ""
                    }${w.is_benchmark_week ? " · benchmark" : ""}`}
                    className="group relative flex-1 py-2"
                  >
                    <span
                      className={`block rounded-full transition-all duration-150 ease-out ${
                        active ? "h-2" : "h-1 group-hover:h-1.5"
                      }`}
                      style={{
                        background: PHASE_COLORS[ph?.phase_type ?? "base"],
                        opacity: active ? 1 : 0.35,
                      }}
                    />
                    {marked && (
                      <span className="absolute left-1/2 top-0.5 h-1 w-1 -translate-x-1/2 rounded-full bg-amber" />
                    )}
                  </Link>
                );
              })}
            </div>
            <div className="flex justify-between font-mono text-micro text-smoke">
              <span>W1</span>
              <span>RACE</span>
            </div>
          </div>

          {/* ── Why this week: the promise the product is built on, at size. ── */}
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className="font-mono text-micro font-bold uppercase tracking-widest"
                style={{ color: PHASE_COLORS[currentPhase?.phase_type ?? "base"] }}
              >
                {titleCase(currentPhase?.phase_type ?? "")}
              </span>
              <h1 className="text-h2 font-bold tracking-tight">
                Week <span className="font-mono tabular-nums">{props.currentWeek.week_number}</span>
              </h1>
              {props.currentWeek.is_deload && <span className="pill text-amber">deload</span>}
              {props.currentWeek.is_benchmark_week && (
                <span className="pill text-amber">benchmark</span>
              )}
            </div>
            <p className="mt-2 max-w-[62ch] text-lead leading-relaxed text-bone">
              {props.currentWeek.weekly_goal}
            </p>

            {props.runSummary && props.runSummary.runs > 0 && (
              <div className="mt-4 max-w-md">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-micro font-semibold uppercase tracking-widest text-ash">
                    Running
                  </span>
                  <span className="font-mono text-meta tabular-nums text-bone">
                    {props.runSummary.total_km} km · {props.runSummary.runs} runs ·{" "}
                    {Math.round(props.runSummary.easy_share * 100)}% aerobic
                  </span>
                </div>
                {/* Aerobic vs. hard kilometres — the 80/20 rule, measured. */}
                <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-well">
                  <div
                    className="bg-go"
                    style={{ width: `${Math.round(props.runSummary.easy_share * 100)}%` }}
                    title={`${props.runSummary.easy_km} km aerobic`}
                  />
                  <div
                    className="bg-flame"
                    style={{ width: `${100 - Math.round(props.runSummary.easy_share * 100)}%` }}
                    title={`${props.runSummary.hard_km} km hard`}
                  />
                </div>
                <p
                  className={`mt-2 text-meta ${
                    props.runSummary.volume === "on_target" &&
                    props.runSummary.polarisation === "on_target"
                      ? "text-ash"
                      : "text-amber"
                  }`}
                >
                  {props.runSummary.note.replace(/^[\d.]+ runs · [\d.]+ km · \d+% aerobic\. /, "")}
                </p>
              </div>
            )}
          </div>

          {/* ── The week. One card leads: the one you are standing in. ────── */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-baseline justify-between">
              <span className="text-micro font-semibold uppercase tracking-widest text-ash">
                {props.sessions.length} sessions
              </span>
              <span className="flex items-center gap-3 text-micro text-smoke">
                {(["hard", "aerobic", "load"] as const).map((d) => (
                  <span key={d} className="flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: DEMAND_COLORS[d] }}
                    />
                    {DEMAND_LABELS[d]}
                  </span>
                ))}
              </span>
            </div>
          </div>

          {props.sessionsFailed && (
            <div className="card border-stop/40 flex items-start gap-3 text-base">
              <MedicalIcon size={18} className="mt-0.5 shrink-0 text-stop" />
              <span>
                <b>This week could not be loaded.</b> Nothing is wrong with your plan — the
                sessions just did not come back. Reload the page; if it keeps happening, the
                adaptations and logs you have made are all still saved.
              </span>
            </div>
          )}

          {!props.sessionsFailed &&
            weekItems.map((item) =>
            item.kind === "rest" ? (
              <RestCard
                key={`rest-${item.day}`}
                day={item.day}
                date={dayDateOf(props.weekStart, item.day)}
                // A pin is a setting as it stands today. Claiming it about a
                // week that was built before the pin existed would put words in
                // the athlete's past mouth, so past weeks get the neutral line.
                pinned={
                  props.restDays.includes(item.day) &&
                  props.currentWeek.week_number >= props.thisWeekNumber
                }
                today={
                  props.currentWeek.week_number === props.thisWeekNumber &&
                  today?.weekday === item.day
                }
              />
            ) : (
            <SessionCard
              key={item.cs.id}
              // Today's session — and only while the week on screen is the
              // week today is in. Without that second half the same weekday
              // lit up in every week of the plan.
              focal={
                props.currentWeek.week_number === props.thisWeekNumber &&
                today?.weekday === item.cs.session.day_hint &&
                item.cs.status === "planned"
              }
              session={item.cs.session}
              status={optimistic[item.cs.id] ?? item.cs.status}
              locked={props.locked}
              busyAction={busy?.sessionId === item.cs.id ? busy.action : null}
              onLog={
                props.locked
                  ? undefined
                  : (a, sets) => log(item.cs.id, a, item.cs.session.intensity_rpe_target, sets)
              }
              strength={item.cs.strength ?? null}
              onReset={props.locked ? undefined : () => reset(item.cs.id)}
              resetting={resetting === item.cs.id}
              date={dayDateOf(props.weekStart, item.cs.session.day_hint)}
              substitutions={substitutions}
              onSwap={props.locked ? undefined : (station) => setSwapStation(station)}
              showSlot={doubleDays.has(item.cs.session.day_hint)}
              onMove={
                props.locked ? undefined : (day, slot) => void move(item.cs.id, day, slot)
              }
              moving={movingId === item.cs.id}
              occupied={occupied}
            />
            ),
          )}
        </div>

        <aside className="space-y-4">
          {/* The one number the whole system exists to move. It reads like the
              clock it will be measured against, not like a metric tile. */}
          <div className="card-focal">
            <div className="text-micro font-semibold uppercase tracking-widest text-ash">
              Estimated finish
            </div>
            <div className="mt-1.5 font-mono text-clock font-bold tabular-nums text-chalk">
              {fmtClock(props.state?.predicted_race_time_sec)}
            </div>
            {props.goalCheck && <GoalLine check={props.goalCheck} />}
            {props.state && (
              <dl className="mt-4 space-y-1.5 border-t border-edge pt-3">
                <Row k="Easy pace" v={fmtPace(props.state.pace_zones?.easy_sec_km)} />
                <Row k="Race pace" v={fmtPace(props.state.pace_zones?.race_sec_km)} />
                <Row k="ACWR" v={String(props.state.acwr ?? "—")} />
              </dl>
            )}
            <p className="mt-3 text-micro text-smoke">Recalibrates every time you log.</p>
          </div>

          <div className="card">
            <div className="mb-2.5 flex items-center gap-2">
              <SparkIcon size={15} className="text-amber" />
              <span className="text-micro font-semibold uppercase tracking-widest text-ash">
                Why your plan changed
              </span>
            </div>
            {props.adjustments.length === 0 ? (
              <p className="text-meta leading-relaxed text-ash">
                Nothing needed adjusting yet. Every change the engine makes gets explained here, in
                plain words.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {props.adjustments.map((r, i) => (
                  <li
                    key={i}
                    className="animate-fade-up border-l-2 border-amber/40 pl-3 text-meta leading-relaxed text-bone"
                  >
                    {r}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {(() => {
            const phase = currentPhase?.phase_type as PhaseType | undefined;
            const tip = phase ? PHASE_NUTRITION[phase] : undefined;
            return tip ? (
              <div className="card">
                <div className="mb-1 flex items-center gap-2 text-base font-semibold">
                  <LeafIcon size={16} className="text-go" /> {tip.headline}
                </div>
                <ul className="space-y-1 text-meta text-ash">
                  {tip.points.map((pt) => (
                    <li key={pt}>• {pt}</li>
                  ))}
                </ul>
              </div>
            ) : null;
          })()}

          {/* Setup lives on its own page: two of those controls rebuild the
              whole plan, which is not a footnote to today's session. */}
          <Link
            href="/settings"
            className="flex items-center justify-between gap-2 rounded-panel border border-edge bg-lane/60 px-4 py-3 text-micro font-semibold uppercase tracking-widest text-ash transition-colors duration-150 hover:border-edge-strong hover:text-bone"
          >
            Setup &amp; tools
            <span className="text-smoke">→</span>
          </Link>
        </aside>
      </div>

      {feedback && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-12"
          onClick={() => setFeedback(null)}
        >
          <div className="w-full max-w-lg animate-pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 text-center text-base font-semibold text-ash">
              Training feedback
            </div>
            <FeedbackCard feedback={feedback} onClose={() => setFeedback(null)} />
          </div>
        </div>
      )}

      {swapStation && (
        <SwapSheet
          station={swapStation}
          equipment={props.equipment}
          current={subs[swapStation] ?? null}
          onPick={(slug) => void swap(swapStation, slug)}
          onClose={() => setSwapStation(null)}
        />
      )}

      {toast && (
        <div
          className="fixed bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-edge bg-lane px-4 py-2 text-base shadow-lg animate-fade-up"
          onClick={() => setToast(null)}
        >
          <SparkIcon size={14} className="shrink-0 text-amber" />
          {toast}
        </div>
      )}
    </main>
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
        <span className="text-micro font-semibold uppercase tracking-widest text-ash">Goal</span>
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

/**
 * The alternatives for one station, as a sheet.
 *
 * The order is the honest one: the real station first — putting it back is a
 * tap, not a settings trip — then the substitutes best-first, each stating what
 * it keeps and what it costs. Nobody should have to guess whether swapping the
 * sled for a leg press changed what the session was for.
 */
function SwapSheet({
  station,
  equipment,
  current,
  onPick,
  onClose,
}: {
  station: Station;
  equipment: EquipmentAccess;
  current: string | null;
  onPick: (slug: string | null) => void;
  onClose: () => void;
}) {
  const options: StationAlternative[] = alternativesFor(station, equipment);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-void/70 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-panel border border-edge bg-lane p-5 shadow-lg animate-fade-up sm:rounded-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-lead font-semibold text-chalk">
            {STATION_LABELS[station]} not free?
          </h3>
          <button className="text-meta text-ash hover:text-bone" onClick={onClose}>
            close
          </button>
        </div>
        <p className="mt-1 max-w-[52ch] text-meta leading-relaxed text-ash">
          A session you skip because the corner was busy costs more than any substitute. This
          sticks until you put it back.
        </p>

        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={() => onPick(null)}
            className={`w-full rounded-control border p-3 text-left transition-colors duration-150 ease-out ${
              current === null
                ? "border-flame/70 bg-flame/10"
                : "border-edge bg-well hover:border-edge-strong"
            }`}
          >
            <div className="text-base font-semibold text-chalk">
              {STATION_LABELS[station]} <span className="text-ash">— as prescribed</span>
            </div>
          </button>

          {options.map((alt) => (
            <button
              key={alt.slug}
              type="button"
              onClick={() => onPick(alt.slug)}
              className={`w-full rounded-control border p-3 text-left transition-colors duration-150 ease-out ${
                current === alt.slug
                  ? "border-flame/70 bg-flame/10"
                  : "border-edge bg-well hover:border-edge-strong"
              }`}
            >
              <div className="text-base font-semibold text-chalk">{alt.name}</div>
              <p className="mt-0.5 text-meta leading-relaxed text-bone">{alt.prescription}</p>
              <p className="mt-1.5 text-micro leading-relaxed text-ash">
                <b className="text-go">Keeps:</b> {alt.keeps} <b className="text-amber">Costs:</b>{" "}
                {alt.costs}
              </p>
            </button>
          ))}

          {options.length === 0 && (
            <p className="text-meta leading-relaxed text-ash">
              Nothing here needs equipment you might not have — this one is yours to improvise.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * A day with nothing on it — shown, because it is part of the plan.
 *
 * The week used to render as a list of the days that carry work, which left an
 * athlete counting backwards from Thursday to work out whether Wednesday was a
 * rest day or a session they had already logged away. A day off is a decision
 * the plan made; it deserves to be visible as one.
 *
 * Deliberately inert: no chevron, no log buttons, nothing to tap. Adaptation
 * happens here, and there is nothing to report about it.
 */
function RestCard({
  day,
  date,
  pinned,
  today,
}: {
  day: number;
  date: string;
  /** The athlete fixed this day in Setup, rather than it just falling empty. */
  pinned: boolean;
  today: boolean;
}) {
  return (
    <div
      className={`flex gap-3.5 rounded-panel border border-dashed p-4 ${
        today ? "border-edge-strong bg-rack/40" : "border-edge bg-lane/25"
      }`}
    >
      {/* The rail takes its colour from the same table the session cards use.
          `text-edge-strong` looked right and generated nothing: edge lives
          under borderColor, never under colors, so the rail fell back to the
          body's near-white and made the quietest card the loudest thing in the
          week. */}
      <span
        className="rail self-stretch"
        style={{ color: DEMAND_COLORS.recovery }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="font-mono text-micro font-bold uppercase tracking-widest text-smoke">
            {WEEKDAY_LABELS[day]}
            <span className="ml-1.5 font-normal">{fmtDayDate(date)}</span>
          </span>
          <span className="text-lead font-semibold leading-tight text-ash">Rest day</span>
        </div>
        <p className="mt-0.5 text-meta leading-relaxed text-smoke">
          {pinned
            ? "One of your fixed rest days. Nothing is scheduled and nothing is missing."
            : "Nothing scheduled. This is where the last few days turn into fitness."}
        </p>
      </div>
    </div>
  );
}
