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
import { Sheet } from "./Sheet";
import { PlanSwitch } from "./PlanSwitch";
import { FeedbackCard } from "./FeedbackCard";
import { AiCoachCard } from "./AiCoachCard";
import type { SuggestionRow } from "@/lib/aiCoach";
import {
  DEMAND_COLORS,
  DEMAND_LABELS,
  demandOf,
  PALETTE,
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
  CheckIcon,
  CloseIcon,
  LeafIcon,
  MedicalIcon,
  SkipIcon,
  SparkIcon,
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
  /**
   * Which screen this is. "today" is the gym screen: the day strip and the
   * day's session. "week" is the Plan tab: the whole week, one line a day.
   */
  view: "today" | "week";
  planId: string;
  profileId: string;
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
  /** What this week's running adds up to — volume and 80/20 distribution. */
  runSummary: WeeklyRunSummary | null;
  /** Whether GEMINI_API_KEY is set — the AI coach card works only then. */
  aiEnabled?: boolean;
  /** The latest AI coach review for this plan, if any. */
  aiSuggestion?: SuggestionRow | null;
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
  // The session the last toast was about — the toast offers to take it back.
  const [undoId, setUndoId] = useState<string | null>(null);
  // Today: the day picked in the strip. Week: the session opened from a row.
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
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

  // Week progress counts what the athlete can actually tick off — a rest day
  // is not a session you complete. Optimistic flips count straight away.
  const statusOf = (cs: ClientSession) => optimistic[cs.id] ?? cs.status;
  const trainable = props.sessions.filter((cs) => cs.session.session_type !== "rest");
  const doneCount = trainable.filter((cs) => statusOf(cs) === "done").length;
  const skippedCount = trainable.filter((cs) => statusOf(cs) === "skipped").length;
  const weekIndex = props.weeks.findIndex((w) => w.week_number === props.currentWeek.week_number);
  const prevWeek = weekIndex > 0 ? props.weeks[weekIndex - 1].week_number : null;
  const nextWeek =
    weekIndex >= 0 && weekIndex < props.weeks.length - 1
      ? props.weeks[weekIndex + 1].week_number
      : null;
  const thisWeek = props.weeks.find((w) => w.status === "current");
  const viewingThisWeek = !thisWeek || thisWeek.week_number === props.currentWeek.week_number;

  async function injury(action: "activate" | "recover") {
    // Both directions rebuild or restrict the plan; a stray tap must not.
    const question =
      action === "activate"
        ? "Switch to rehab mode? The plan goes low-impact until you come back."
        : "Rebuild the remaining plan from today?";
    if (typeof window !== "undefined" && !window.confirm(question)) return;
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
    /** The effort picked on the scale; without it harder/easier mean ±2. */
    rpePicked?: number,
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
                    rpe_actual: Math.max(
                      1,
                      Math.min(10, rpePicked ?? target + ACTION_RPE[action]),
                    ),
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
          `${suggestion.exercise}: ${suggestion.reason} Take it under Setup → Strength program whenever you want.`,
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
      setUndoId(sessionId);
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
  const isThisWeek = props.currentWeek.week_number === props.thisWeekNumber;
  // The day Today shows: today until another day in the strip is tapped.
  const dayShown = selectedDay ?? today?.weekday ?? 1;

  /** One session, wired to every action the page offers. */
  const card = (cs: ClientSession, opts: { focal?: boolean; defaultOpen?: boolean; onLogged?: () => void } = {}) => (
    <SessionCard
      key={cs.id}
      focal={opts.focal}
      defaultOpen={opts.defaultOpen}
      session={cs.session}
      status={statusOf(cs)}
      busyAction={busy?.sessionId === cs.id ? busy.action : null}
      onLog={(a, sets, rpe) => {
        opts.onLogged?.();
        void log(cs.id, a, cs.session.intensity_rpe_target, sets, rpe);
      }}
      strength={cs.strength ?? null}
      onReset={() => reset(cs.id)}
      resetting={resetting === cs.id}
      date={dayDateOf(props.weekStart, cs.session.day_hint)}
      substitutions={substitutions}
      onSwap={(station) => setSwapStation(station)}
      showSlot={doubleDays.has(cs.session.day_hint)}
      onMove={(day, slot) => {
        opts.onLogged?.();
        void move(cs.id, day, slot);
      }}
      moving={movingId === cs.id}
      occupied={occupied}
    />
  );

  const rehabBanner = props.planStatus === "rehab" && (
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
  );

  const failedBanner = props.sessionsFailed && (
    <div className="card border-stop/40 flex items-start gap-3 text-base">
      <MedicalIcon size={18} className="mt-0.5 shrink-0 text-stop" />
      <span>
        <b>This week could not be loaded.</b> Nothing is wrong with your plan — the sessions just
        did not come back. Reload the page; if it keeps happening, the adaptations and logs you
        have made are all still saved.
      </span>
    </div>
  );

  /** One segment per session that asks something of you. */
  const progress = trainable.length > 0 && (
    <div data-testid="week-progress">
      <div className="flex gap-1">
        {trainable.map((cs) => {
          const st = statusOf(cs);
          return (
            <span
              key={cs.id}
              title={`${cs.session.title} · ${st}`}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                st === "done" ? "bg-go" : st === "skipped" ? "bg-smoke" : "bg-well"
              }`}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-3 text-meta">
        <span className="text-bone">
          <span className="font-mono font-semibold tabular-nums text-chalk">{doneCount}</span> of{" "}
          <span className="font-mono tabular-nums">{trainable.length}</span> sessions done
          {skippedCount > 0 && <span className="text-smoke"> · {skippedCount} skipped</span>}
          {props.runSummary && props.runSummary.runs > 0 && (
            <span className="text-ash"> · {props.runSummary.total_km} km running</span>
          )}
        </span>
        {props.view === "week" && !viewingThisWeek && thisWeek && (
          <Link
            href={`/plan?week=${thisWeek.week_number}`}
            className="font-semibold text-flame hover:underline"
          >
            Go to this week →
          </Link>
        )}
      </div>
    </div>
  );

  /** The week's reason, said by the coach. Two lines until asked for more. */
  const coachNote = (
    <div className="flex items-start gap-3 rounded-panel border border-edge bg-lane p-3.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber/15 text-amber">
        <SparkIcon size={15} />
      </span>
      <div className="min-w-0">
        <div className="text-meta font-bold text-bone">Why this week</div>
        <p
          className={`mt-0.5 max-w-[62ch] text-base leading-relaxed text-bone ${
            noteOpen ? "" : "line-clamp-2"
          }`}
        >
          {props.currentWeek.weekly_goal}
        </p>
        {props.currentWeek.weekly_goal && props.currentWeek.weekly_goal.length > 110 && (
          <button
            type="button"
            className="mt-1 text-meta font-semibold text-run hover:underline"
            onClick={() => setNoteOpen((v) => !v)}
            aria-expanded={noteOpen}
          >
            {noteOpen ? "Less" : "More"}
          </button>
        )}
      </div>
    </div>
  );

  const runBlock = props.runSummary && props.runSummary.runs > 0 && (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-meta font-bold text-bone">Running</span>
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
          props.runSummary.volume === "on_target" && props.runSummary.polarisation === "on_target"
            ? "text-ash"
            : "text-amber"
        }`}
      >
        {props.runSummary.note.replace(/^[\d.]+ runs · [\d.]+ km · \d+% aerobic\. /, "")}
      </p>
    </div>
  );

  const restCard = (day: number) => (
    <RestCard
      key={`rest-${day}`}
      day={day}
      date={dayDateOf(props.weekStart, day)}
      // A pin is a setting as it stands today. Claiming it about a week that
      // was built before the pin existed would put words in the athlete's past
      // mouth, so past weeks get the neutral line.
      pinned={props.restDays.includes(day) && props.currentWeek.week_number >= props.thisWeekNumber}
      today={isThisWeek && today?.weekday === day}
    />
  );

  const openCs = openSession ? props.sessions.find((cs) => cs.id === openSession) ?? null : null;

  return (
    <main className="space-y-6">
      <AppHeader
        countdown={{
          label: props.planKind === "transition" ? "Block ends" : "Race day",
          days: daysToRace,
        }}
      />

      {rehabBanner}

      {props.view === "today" ? (
        // ── Today: the screen you open in the gym. ────────────────────────
        <div className="mx-auto max-w-2xl space-y-5">
          <div>
            <span
              className="font-mono text-micro font-bold uppercase tracking-widest"
              style={{ color: PHASE_COLORS[currentPhase?.phase_type ?? "base"] }}
            >
              {titleCase(currentPhase?.phase_type ?? "")} · Week {props.currentWeek.week_number} of{" "}
              {props.weeks.length}
            </span>
            <h1 className="text-h1 font-bold tracking-tight">
              {dayShown === today?.weekday ? "Today" : WEEKDAY_LABELS[dayShown]}
              <span className="ml-2 text-lead font-medium text-smoke">
                {fmtDayDate(dayDateOf(props.weekStart, dayShown))}
              </span>
            </h1>
          </div>

          <DayStrip
            weekStart={props.weekStart}
            selected={dayShown}
            today={isThisWeek ? today?.weekday ?? null : null}
            sessions={props.sessions.map((cs) => ({ cs, status: statusOf(cs) }))}
            onSelect={(day) => {
              haptic("tap");
              setSelectedDay(day);
            }}
          />

          {failedBanner}

          {!props.sessionsFailed && (
            <div className="space-y-3">
              {(() => {
                const onDay = props.sessions.filter((cs) => cs.session.day_hint === dayShown);
                if (!onDay.length) return restCard(dayShown);
                return onDay.map((cs) =>
                  card(cs, {
                    focal: isThisWeek && today?.weekday === dayShown && statusOf(cs) === "planned",
                  }),
                );
              })()}
            </div>
          )}

          <div className="card space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-meta font-bold text-bone">This week</span>
              <Link href="/plan" className="text-meta font-semibold text-run hover:underline">
                Whole week →
              </Link>
            </div>
            {progress}
          </div>

          {coachNote}

          <AiCoachCard
            enabled={Boolean(props.aiEnabled)}
            suggestion={props.aiSuggestion ?? null}
            onToast={setToast}
            onChanged={() => router.refresh()}
          />

          <div className="card">
            <div className="mb-2.5 flex items-center gap-2">
              <SparkIcon size={15} className="text-amber" />
              <span className="text-meta font-bold text-bone">Why your plan changed</span>
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
        </div>
      ) : (
        // ── Plan → Week: the whole week, one line a day. ─────────────────
        <div className="mx-auto max-w-2xl space-y-5">
          <PlanSwitch active="week" />

          {/* The cycle, as a strip: jump to any week. */}
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

          <div className="flex items-center justify-between gap-3">
            <WeekStep to={prevWeek} label="Previous week" glyph="‹" />
            <div className="min-w-0 flex-1 text-center">
              <span
                className="font-mono text-micro font-bold uppercase tracking-widest"
                style={{ color: PHASE_COLORS[currentPhase?.phase_type ?? "base"] }}
              >
                {titleCase(currentPhase?.phase_type ?? "")}
              </span>
              <h1 className="text-h2 font-bold tracking-tight">
                Week <span className="font-mono tabular-nums">{props.currentWeek.week_number}</span>
                <span className="text-lead font-medium text-smoke">
                  {" "}
                  of <span className="font-mono tabular-nums">{props.weeks.length}</span>
                </span>
              </h1>
              {(props.currentWeek.is_deload || props.currentWeek.is_benchmark_week) && (
                <div className="mt-1 flex justify-center gap-1.5">
                  {props.currentWeek.is_deload && <span className="pill text-amber">deload</span>}
                  {props.currentWeek.is_benchmark_week && (
                    <span className="pill text-amber">benchmark</span>
                  )}
                </div>
              )}
            </div>
            <WeekStep to={nextWeek} label="Next week" glyph="›" />
          </div>

          {progress}
          {coachNote}
          {runBlock}
          {failedBanner}

          {!props.sessionsFailed && (
            <ul className="space-y-1.5" aria-label={`Week ${props.currentWeek.week_number}`}>
              {weekItems.map((item) =>
                item.kind === "rest" ? (
                  <li key={`rest-${item.day}`}>
                    <DayRow
                      day={item.day}
                      date={dayDateOf(props.weekStart, item.day)}
                      today={isThisWeek && today?.weekday === item.day}
                    />
                  </li>
                ) : (
                  <li key={item.cs.id}>
                    <DayRow
                      day={item.cs.session.day_hint}
                      date={dayDateOf(props.weekStart, item.cs.session.day_hint)}
                      today={isThisWeek && today?.weekday === item.cs.session.day_hint}
                      session={item.cs.session}
                      slot={doubleDays.has(item.cs.session.day_hint) ? item.cs.session.day_slot ?? "am" : null}
                      status={statusOf(item.cs)}
                      onOpen={() => {
                        haptic("tap");
                        setOpenSession(item.cs.id);
                      }}
                    />
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      )}

      {openCs && (
        <Sheet tall label={openCs.session.title} onClose={() => setOpenSession(null)}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="font-mono text-micro font-bold uppercase tracking-widest text-ash">
              {WEEKDAY_LABELS[openCs.session.day_hint]} ·{" "}
              {fmtDayDate(dayDateOf(props.weekStart, openCs.session.day_hint))}
            </span>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-control text-ash hover:bg-rack hover:text-chalk"
              onClick={() => setOpenSession(null)}
              aria-label="Close"
            >
              <CloseIcon size={18} />
            </button>
          </div>
          {card(openCs, { defaultOpen: true, onLogged: () => setOpenSession(null) })}
        </Sheet>
      )}

      {feedback && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-12"
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
          role="status"
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-40 flex w-[min(32rem,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded-lg border border-edge bg-lane px-4 py-2.5 text-base shadow-lg animate-fade-up min-[901px]:bottom-4"
          onClick={() => {
            setToast(null);
            setUndoId(null);
          }}
        >
          <SparkIcon size={14} className="shrink-0 text-amber" />
          <span className="min-w-0 flex-1">{toast}</span>
          {undoId && (
            <button
              type="button"
              className="shrink-0 font-bold text-run hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                const id = undoId;
                setUndoId(null);
                setToast(null);
                void reset(id);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </main>
  );
}

/** Mon–Sun, a dot per session in its demand colour — green once it is done. */
function DayStrip({
  weekStart,
  selected,
  today,
  sessions,
  onSelect,
}: {
  weekStart: string;
  selected: number;
  today: number | null;
  sessions: { cs: ClientSession; status: ClientSession["status"] }[];
  onSelect: (day: number) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1" role="tablist" aria-label="Days of this week">
      {[1, 2, 3, 4, 5, 6, 7].map((day) => {
        const onDay = sessions.filter(({ cs }) => cs.session.day_hint === day);
        const active = day === selected;
        return (
          <button
            key={day}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={`${WEEKDAY_LABELS[day]}${day === today ? " (today)" : ""}: ${
              onDay.length ? onDay.map(({ cs }) => cs.session.title).join(", ") : "rest day"
            }`}
            onClick={() => onSelect(day)}
            className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-control border transition-colors duration-150 ease-out ${
              active
                ? "border-chalk bg-chalk text-lane"
                : day === today
                  ? "border-chalk bg-lane text-chalk"
                  : "border-transparent text-ash hover:bg-lane"
            }`}
          >
            <span className="text-micro font-bold uppercase">{WEEKDAY_LABELS[day].slice(0, 2)}</span>
            <span className="font-mono text-base font-bold tabular-nums leading-none">
              {Number(dayDateOf(weekStart, day).slice(8, 10))}
            </span>
            <span className="flex h-1.5 gap-0.5" aria-hidden="true">
              {onDay.map(({ cs, status }) => (
                <span
                  key={cs.id}
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background:
                      status === "done"
                        ? PALETTE.go
                        : status === "skipped"
                          ? PALETTE.smoke
                          : DEMAND_COLORS[demandOf(cs.session.session_type)],
                  }}
                />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** One day of the week as one line. A session line opens the session. */
function DayRow({
  day,
  date,
  today,
  session,
  slot,
  status,
  onOpen,
}: {
  day: number;
  date: string;
  today: boolean;
  session?: GeneratedSession;
  slot?: string | null;
  status?: ClientSession["status"];
  onOpen?: () => void;
}) {
  const label = (
    <span className="w-12 shrink-0 text-left">
      <span className="block font-mono text-micro font-bold uppercase tracking-widest text-ash">
        {WEEKDAY_LABELS[day].slice(0, 3)}
        {slot && <span className="ml-1 text-bone">{slot.toUpperCase()}</span>}
      </span>
      <span className="block font-mono text-meta text-smoke">{fmtDayDate(date)}</span>
    </span>
  );
  if (!session) {
    return (
      <div
        className={`flex items-center gap-3 rounded-panel border border-dashed px-3.5 py-2.5 ${
          today ? "border-edge-strong" : "border-edge"
        }`}
      >
        {label}
        <span className="text-base font-medium text-ash">Rest day</span>
      </div>
    );
  }
  const demand = demandOf(session.session_type);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-day-row={session.title}
      className={`flex w-full items-center gap-3 rounded-panel border bg-lane px-3.5 py-2.5 text-left transition-colors duration-150 ease-out hover:border-edge-strong ${
        today ? "border-[1.5px] border-chalk" : "border-edge"
      }`}
    >
      <span className="rail self-stretch" style={{ color: DEMAND_COLORS[demand] }} aria-hidden="true" />
      {label}
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-base font-bold ${
            status === "done" ? "text-ash line-through decoration-go decoration-2" : "text-chalk"
          }`}
        >
          {session.title}
        </span>
        <span className="block text-meta text-ash">
          <span style={{ color: DEMAND_COLORS[demand] }} className="font-semibold">
            {DEMAND_LABELS[demand]}
          </span>{" "}
          · <span className="font-mono">{session.planned_duration_min} min</span>
          {status === "skipped" && " · skipped"}
          {status === "moved" && " · moved"}
        </span>
      </span>
      <span
        aria-label={status}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px] ${
          status === "done" ? "border-go bg-go text-lane" : status === "skipped" ? "border-smoke" : "border-edge-strong"
        }`}
      >
        {status === "done" && <CheckIcon size={14} />}
        {status === "skipped" && <SkipIcon size={12} className="text-smoke" />}
      </span>
    </button>
  );
}



/** A step to the neighbouring week — a 40px target, inert at either end. */
function WeekStep({ to, label, glyph }: { to: number | null; label: string; glyph: string }) {
  const cls =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-edge bg-lane text-h3 leading-none";
  if (to == null)
    return (
      <span className={`${cls} text-smoke opacity-40`} aria-hidden="true">
        {glyph}
      </span>
    );
  return (
    <Link
      href={`/plan?week=${to}`}
      aria-label={`${label} (week ${to})`}
      className={`${cls} text-bone transition-colors duration-150 hover:border-edge-strong hover:text-chalk`}
    >
      {glyph}
    </Link>
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
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
                ? "border-chalk bg-rack ring-1 ring-chalk"
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
                  ? "border-chalk bg-rack ring-1 ring-chalk"
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
