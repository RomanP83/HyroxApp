"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { GeneratedSession, SessionFeedback } from "@/lib/engine";
import { SessionCard, type LogAction, type StrengthExerciseInput, type StrengthSetInput } from "./SessionCard";
import { FeedbackCard } from "./FeedbackCard";
import { fmtClock, fmtPace, PHASE_COLORS, titleCase } from "@/lib/format";
import { PHASE_NUTRITION } from "@/lib/nutrition";
import type { PhaseType, WeeklyRunSummary } from "@/lib/engine";
import { haptic } from "@/lib/haptics";
import {
  CalendarIcon,
  ChartIcon,
  DumbbellIcon,
  LeafIcon,
  LockIcon,
  MedicalIcon,
  RunIcon,
  SendIcon,
  SparkIcon,
  TargetIcon,
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
  sessions: ClientSession[];
  state: any;
  adjustments: string[];
  locked: boolean;
  /** What this week's running adds up to — volume and 80/20 distribution. */
  runSummary: WeeklyRunSummary | null;
  /** Deep link to connect the Telegram bot; null when connected/unconfigured. */
  telegramLink: string | null;
  /** Strava OAuth entry point; null when connected/unconfigured (C2). */
  stravaConnectUrl: string | null;
  /** Garmin OAuth entry point; null when connected/unconfigured. */
  garminConnectUrl: string | null;
  /** Whether the subscription tier is configured (C4). */
  subscriptionAvailable: boolean;
}

const ACTION_RPE: Record<Exclude<LogAction, "skip">, number> = { planned: 0, harder: 2, easier: -2 };

export function PlanClient(props: Props) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ sessionId: string; action: LogAction } | null>(null);
  const [feedback, setFeedback] = useState<SessionFeedback | null>(null);
  // Perceived speed (#6): flip the card state the instant the tap lands;
  // the server round-trip only confirms (or reverts on error).
  const [optimistic, setOptimistic] = useState<Record<string, "done" | "skipped" | "planned">>({});
  const [resetting, setResetting] = useState<string | null>(null);

  const phaseOf = (n: number) => props.phases.find((p) => n >= p.start_week && n <= p.end_week);
  // Days that carry an AM *and* a PM session — only there does the marker help.
  const doubleDays = new Set(
    props.sessions
      .map((cs) => cs.session.day_hint)
      .filter((day, i, all) => all.indexOf(day) !== i),
  );
  const currentPhase = phaseOf(props.currentWeek.week_number);

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
    const data = await res.json();
    if (res.ok) {
      setToast(
        action === "activate"
          ? "Rehab mode on — low-impact until you reactivate."
          : "Plan rebuilt from today. Welcome back!",
      );
      router.refresh();
    } else {
      setToast(data.error ?? "Something went wrong.");
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
      if (!res.ok) throw new Error("log failed");
      const data = await res.json();
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
      if (!res.ok) throw new Error("reset failed");
      const data = await res.json();
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

  async function unlock(tier: "race_cycle" | "subscription" = "race_cycle") {
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: props.planId, tier }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else setToast(data.error ?? "Checkout unavailable — set STRIPE_* env vars.");
  }

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold">
          Hyrox<span className="text-accent">·</span>Hub
        </span>
        <div className="flex items-center gap-2 text-sm">
          <Link href="/season" className="btn-ghost">
            <CalendarIcon size={16} />
            Season
          </Link>
          <Link href="/strength" className="btn-ghost">
            <DumbbellIcon size={16} />
            Strength
          </Link>
          <Link href="/progress" className="btn-ghost">
            <ChartIcon size={16} />
            Progress
          </Link>
          <Link href="/benchmarks" className="btn-ghost">
            <TargetIcon size={16} />
            Benchmarks
          </Link>
          <span className="pill">Race {new Date(props.raceDate).toLocaleDateString()}</span>
          {!props.paid && (
            <button className="btn-primary" onClick={() => unlock()}>
              Unlock full plan
            </button>
          )}
        </div>
      </div>

      {props.planStatus === "rehab" && (
        <div className="card border-warn/50 bg-surface2 flex flex-wrap items-center justify-between gap-3 animate-fade-up">
          <div className="flex items-start gap-3 text-sm">
            <MedicalIcon size={18} className="mt-0.5 shrink-0 text-warn" />
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
        <div className="card border-accent/40 bg-surface2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex items-start gap-3">
            <LockIcon size={18} className="mt-0.5 shrink-0 text-accent" />
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

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {/* Phase bar */}
          <div className="flex gap-1">
            {props.weeks.map((w) => {
              const ph = phaseOf(w.week_number);
              const active = w.week_number === props.currentWeek.week_number;
              return (
                <Link
                  key={w.week_number}
                  href={`/plan?week=${w.week_number}`}
                  title={`Week ${w.week_number} · ${ph?.phase_type}`}
                  className={`h-8 flex-1 rounded ${active ? "ring-2 ring-white" : ""}`}
                  style={{
                    background: PHASE_COLORS[ph?.phase_type ?? "base"],
                    opacity: active ? 1 : 0.55,
                  }}
                />
              );
            })}
          </div>

          <div className="card">
            <div className="flex items-center gap-2">
              <span className="pill" style={{ color: PHASE_COLORS[currentPhase?.phase_type ?? "base"] }}>
                {titleCase(currentPhase?.phase_type ?? "")}
              </span>
              <span className="font-semibold">Week {props.currentWeek.week_number}</span>
              {props.currentWeek.is_deload && <span className="pill text-accent2">deload</span>}
              {props.currentWeek.is_benchmark_week && <span className="pill text-accent2">benchmark</span>}
            </div>
            <p className="mt-3 text-sm text-muted">{props.currentWeek.weekly_goal}</p>

            {props.runSummary && props.runSummary.runs > 0 && (
              <div className="mt-3 border-t border-line pt-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                  <span className="font-semibold">Running this week</span>
                  <span className="text-muted">
                    {props.runSummary.total_km} km · {props.runSummary.runs} runs
                  </span>
                </div>
                {/* Aerobic vs. hard kilometres — the 80/20 rule, measured. */}
                <div className="mt-2 flex h-2 overflow-hidden rounded-full">
                  <div
                    className="bg-ok"
                    style={{ width: `${Math.round(props.runSummary.easy_share * 100)}%` }}
                    title={`${props.runSummary.easy_km} km aerobic`}
                  />
                  <div
                    className="bg-accent"
                    style={{ width: `${100 - Math.round(props.runSummary.easy_share * 100)}%` }}
                    title={`${props.runSummary.hard_km} km hard`}
                  />
                </div>
                <p
                  className={`mt-2 text-xs ${
                    props.runSummary.volume === "on_target" &&
                    props.runSummary.polarisation === "on_target"
                      ? "text-muted"
                      : "text-warn"
                  }`}
                >
                  {props.runSummary.note}
                </p>
              </div>
            )}
          </div>

          {props.sessions.map((cs) => (
            <SessionCard
              key={cs.id}
              session={cs.session}
              status={optimistic[cs.id] ?? cs.status}
              locked={props.locked}
              busyAction={busy?.sessionId === cs.id ? busy.action : null}
              onLog={
                props.locked
                  ? undefined
                  : (a, sets) => log(cs.id, a, cs.session.intensity_rpe_target, sets)
              }
              strength={cs.strength ?? null}
              onReset={props.locked ? undefined : () => reset(cs.id)}
              resetting={resetting === cs.id}
              showSlot={doubleDays.has(cs.session.day_hint)}
            />
          ))}
        </div>

        <aside className="space-y-4">
          <div className="card">
            <div className="text-sm text-muted">Estimated finish</div>
            <div className="text-3xl font-bold">{fmtClock(props.state?.predicted_race_time_sec)}</div>
            <div className="text-xs text-muted">estimate · calibrates as you log</div>
          </div>

          {props.state && (
            <div className="card">
              <div className="mb-2 text-sm font-semibold">Pace zones · ACWR</div>
              <div className="space-y-1 text-xs">
                <Row k="Easy" v={fmtPace(props.state.pace_zones?.easy_sec_km)} />
                <Row k="Race" v={fmtPace(props.state.pace_zones?.race_sec_km)} />
                <Row k="ACWR" v={String(props.state.acwr ?? "—")} />
              </div>
            </div>
          )}

          {(() => {
            const phase = currentPhase?.phase_type as PhaseType | undefined;
            const tip = phase ? PHASE_NUTRITION[phase] : undefined;
            return tip ? (
              <div className="card">
                <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
                  <LeafIcon size={16} className="text-ok" /> {tip.headline}
                </div>
                <ul className="space-y-1 text-xs text-muted">
                  {tip.points.map((pt) => (
                    <li key={pt}>• {pt}</li>
                  ))}
                </ul>
              </div>
            ) : null;
          })()}

          {(props.stravaConnectUrl || props.garminConnectUrl) && (
            <div className="card">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
                <RunIcon size={16} className="text-accent2" /> Auto-log your runs
              </div>
              <p className="mb-3 text-xs text-muted">
                Run paces flow straight into the pace calibration — no manual entry.
              </p>
              <div className="space-y-2">
                {props.stravaConnectUrl && (
                  <a href={props.stravaConnectUrl} className="btn-primary w-full">
                    Connect Strava
                  </a>
                )}
                {props.garminConnectUrl && (
                  <a href={props.garminConnectUrl} className="btn-ghost w-full">
                    Connect Garmin
                  </a>
                )}
              </div>
            </div>
          )}

          {props.telegramLink && (
            <div className="card">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
                <SendIcon size={16} className="text-accent2" /> One-tap logging via Telegram
              </div>
              <p className="mb-3 text-xs text-muted">
                Get an evening check-in with 4 buttons — log the session without opening the app.
              </p>
              <a
                href={props.telegramLink}
                target="_blank"
                rel="noreferrer"
                className="btn-primary w-full"
              >
                Connect Telegram
              </a>
            </div>
          )}

          {props.planStatus !== "rehab" && (
            <div className="card">
              <div className="mb-1 text-sm font-semibold">Injured?</div>
              <p className="mb-3 text-xs text-muted">
                Switch to low-impact rehab mode — the plan pauses gracefully and rebuilds from the
                day you&apos;re back.
              </p>
              <button className="btn-ghost w-full" onClick={() => injury("activate")}>
                <MedicalIcon size={16} />
                Flag an injury
              </button>
            </div>
          )}

          <div className="card">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <SparkIcon size={16} className="text-accent2" /> Why your plan changed
            </div>
            {props.adjustments.length === 0 ? (
              <div className="text-xs text-muted">
                You&apos;re all caught up — nothing needed adjusting yet. Every change the engine
                makes will be explained here, in plain words.
              </div>
            ) : (
              <ul className="space-y-2 text-xs">
                {props.adjustments.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 rounded border border-line bg-surface2 p-2 animate-fade-up"
                  >
                    <SparkIcon size={14} className="mt-0.5 shrink-0 text-accent2" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

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

      {toast && (
        <div
          className="fixed bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm shadow-lg animate-fade-up"
          onClick={() => setToast(null)}
        >
          <SparkIcon size={14} className="shrink-0 text-accent2" />
          {toast}
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
