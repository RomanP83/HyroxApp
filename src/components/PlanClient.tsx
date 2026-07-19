"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { GeneratedSession, SessionFeedback } from "@/lib/engine";
import { SessionCard, type LogAction } from "./SessionCard";
import { FeedbackCard } from "./FeedbackCard";
import { fmtClock, fmtPace, PHASE_COLORS, titleCase } from "@/lib/format";

export interface ClientSession {
  id: string;
  session: GeneratedSession;
  status: "planned" | "done" | "skipped" | "moved";
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
  /** Deep link to connect the Telegram bot; null when connected/unconfigured. */
  telegramLink: string | null;
}

const ACTION_RPE: Record<Exclude<LogAction, "skip">, number> = { planned: 0, harder: 2, easier: -2 };

export function PlanClient(props: Props) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SessionFeedback | null>(null);

  const phaseOf = (n: number) => props.phases.find((p) => n >= p.start_week && n <= p.end_week);
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

  async function log(sessionId: string, action: LogAction, target: number) {
    setBusy(sessionId);
    try {
      const body =
        action === "skip"
          ? { skip: true }
          : action === "planned"
            ? { completed_as_planned: true }
            : {
                completed_as_planned: false,
                rpe_actual: Math.max(1, Math.min(10, target + ACTION_RPE[action])),
              };
      const res = await fetch(`/api/sessions/${sessionId}/log`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const reason = data?.adaptation?.adjustments?.[0]?.reason;
      if (data?.feedback && action !== "skip") {
        setFeedback(data.feedback);
        if (reason) setToast(reason);
      } else {
        setToast(reason ?? (action === "skip" ? "Skipped — no make-up pile-up." : "Logged ✅"));
      }
      router.refresh();
    } catch {
      setToast("Something went wrong logging that.");
    } finally {
      setBusy(null);
    }
  }

  async function unlock() {
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: props.planId }),
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
          <Link href="/benchmarks" className="btn-ghost">
            Benchmarks
          </Link>
          <span className="pill">Race {new Date(props.raceDate).toLocaleDateString()}</span>
          {!props.paid && (
            <button className="btn-primary" onClick={unlock}>
              Unlock full plan
            </button>
          )}
        </div>
      </div>

      {props.planStatus === "rehab" && (
        <div className="card border-warn/50 bg-surface2 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            🩹 <b>Rehab mode.</b> Stick to mobility and low-impact work — no plan stop, no lost
            progress. When you&apos;re ready, the plan rebuilds from that day.
          </div>
          <button className="btn-primary" onClick={() => injury("recover")}>
            I&apos;m back — rebuild my plan
          </button>
        </div>
      )}

      {!props.paid && (
        <div className="card border-accent/40 bg-surface2 text-sm">
          🔓 <b>Free preview.</b> Week 1 is fully open. Unlock the race cycle to see every week’s
          sessions, weights and paces — one-time price, for your race.
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
          </div>

          {props.sessions.map((cs) => (
            <SessionCard
              key={cs.id}
              session={cs.session}
              status={cs.status}
              locked={props.locked}
              onLog={props.locked || busy ? undefined : (a) => log(cs.id, a, cs.session.intensity_rpe_target)}
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

          {props.telegramLink && (
            <div className="card">
              <div className="mb-1 text-sm font-semibold">📲 One-tap logging via Telegram</div>
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
                🩹 Flag an injury
              </button>
            </div>
          )}

          <div className="card">
            <div className="mb-2 text-sm font-semibold">Why your plan changed</div>
            {props.adjustments.length === 0 ? (
              <div className="text-xs text-muted">
                Log sessions and the engine will explain every adjustment here.
              </div>
            ) : (
              <ul className="space-y-2 text-xs">
                {props.adjustments.map((r, i) => (
                  <li key={i} className="rounded border border-line bg-surface2 p-2">
                    ⚙️ {r}
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
          <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 text-center text-sm font-semibold text-muted">
              Training feedback
            </div>
            <FeedbackCard feedback={feedback} onClose={() => setFeedback(null)} />
          </div>
        </div>
      )}

      {toast && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-lg border border-line bg-surface px-4 py-2 text-sm shadow-lg"
          onClick={() => setToast(null)}
        >
          ⚙️ {toast}
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
