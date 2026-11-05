"use client";

import { useState } from "react";
import type { StoredSuggestion, SuggestionRow } from "@/lib/aiCoach";
import { SparkIcon, SpinnerIcon } from "./icons";

const ACTION_LABEL: Record<StoredSuggestion["action"], string> = {
  move: "Move",
  easier: "Easier",
  harder: "Harder",
  skip: "Skip",
};

/** Why the engine refused a proposal, in words. */
export const RULE_LABEL: Record<string, string> = {
  unknown_action: "not an action the coach may take",
  not_an_upcoming_session: "not one of the upcoming sessions",
  duplicate_session: "second proposal for the same session",
  no_reason: "no reason given",
  race_day_untouchable: "race days are never touched",
  already_logged: "session already logged",
  fixed_content: "a test or recovery day keeps its content",
  taper_never_harder: "the taper is never made harder",
  deload_never_harder: "a deload week is never made harder",
  acwr_too_high: "load ratio (ACWR) too high for more",
  rpe_at_max: "already at the highest effort",
  rpe_at_min: "already at the lowest effort",
  in_the_past: "that day has already passed",
  invalid_day: "not a day of the week",
  no_change: "would change nothing",
  target_slot_locked: "the target slot holds a race or a logged session",
  over_limit: "more than three proposals",
};

/**
 * The AI coach on /plan: a review of the last weeks and up to three proposals
 * for the coming sessions. A proposal changes nothing until "Apply"; every
 * applied one can be undone.
 */
export function AiCoachCard({
  enabled,
  suggestion,
  onToast,
  onChanged,
}: {
  enabled: boolean;
  suggestion: SuggestionRow | null;
  onToast: (msg: string) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function review() {
    setBusy("review");
    try {
      const res = await fetch("/api/ai/suggestions", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "review failed");
      onToast(data.fresh ? "Review ready." : "You just had a review — here it is again.");
      onChanged();
    } catch (e) {
      const msg = (e as Error).message;
      onToast(
        msg === "not_configured"
          ? "The AI coach is off — GEMINI_API_KEY is not set."
          : "The coach couldn't answer right now. Try again in a minute.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function act(item: StoredSuggestion, op: "apply" | "dismiss" | "undo") {
    if (!suggestion) return;
    setBusy(`${item.id}-${op}`);
    try {
      const res = await fetch(`/api/ai/suggestions/${suggestion.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ item_id: item.id, op }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onToast(
          data.error === "session_no_longer_planned"
            ? "That session is already logged — nothing to change."
            : data.error === "session_changed_since"
              ? "That session changed since — undo it by hand."
              : "Couldn't do that. Give it another tap.",
        );
        return;
      }
      onToast(data.reason ?? "Done.");
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card space-y-3" data-testid="ai-coach-card">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <SparkIcon size={15} className="text-amber" />
          <span className="text-micro font-semibold uppercase tracking-widest text-ash">AI coach</span>
        </span>
        {enabled && (
          <button className="btn-ghost text-xs" disabled={busy === "review"} onClick={review}>
            {busy === "review" ? <SpinnerIcon size={14} /> : suggestion ? "Review again" : "Review my training"}
          </button>
        )}
      </div>

      {!enabled && (
        <p className="text-meta leading-relaxed text-ash">
          Off. With a Gemini API key set (GEMINI_API_KEY) the coach reviews your last weeks and
          proposes changes you can apply with one tap.
        </p>
      )}

      {enabled && !suggestion && (
        <p className="text-meta leading-relaxed text-ash">
          Reviews your last three weeks and proposes up to three changes to the coming sessions.
          Nothing changes until you tap Apply.
        </p>
      )}

      {suggestion && (
        <>
          <p className="text-meta leading-relaxed text-bone">{suggestion.review}</p>
          <p className="text-micro text-smoke">
            {new Date(suggestion.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} ·{" "}
            {suggestion.model}
          </p>

          {suggestion.items.length === 0 ? (
            <p className="text-meta text-ash">No changes proposed — the plan fits.</p>
          ) : (
            <ul className="space-y-2.5">
              {suggestion.items.map((it) => (
                <li key={it.id} className="rounded-lg border border-edge p-2.5" data-testid="ai-suggestion">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-meta font-semibold">
                      {ACTION_LABEL[it.action]} · {it.title}
                    </span>
                    {it.status !== "open" && (
                      <span className={`pill text-xs ${it.status === "applied" ? "text-go" : "text-smoke"}`}>
                        {it.status}
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-micro text-amber">{it.change}</div>
                  <p className="mt-1 text-meta leading-relaxed text-ash">{it.reason}</p>
                  <div className="mt-2 flex gap-2">
                    {it.status === "open" && (
                      <>
                        <button
                          className="btn-primary text-xs"
                          disabled={busy !== null}
                          onClick={() => act(it, "apply")}
                        >
                          {busy === `${it.id}-apply` ? "…" : "Apply"}
                        </button>
                        <button
                          className="btn-ghost text-xs"
                          disabled={busy !== null}
                          onClick={() => act(it, "dismiss")}
                        >
                          Dismiss
                        </button>
                      </>
                    )}
                    {it.status === "applied" && (
                      <button className="btn-ghost text-xs" disabled={busy !== null} onClick={() => act(it, "undo")}>
                        {busy === `${it.id}-undo` ? "…" : "Undo"}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {suggestion.rejected.length > 0 && (
            <details className="text-micro text-smoke">
              <summary className="cursor-pointer">
                {suggestion.rejected.length} proposal{suggestion.rejected.length === 1 ? "" : "s"} refused by the plan
                rules
              </summary>
              <ul className="mt-1 space-y-0.5">
                {suggestion.rejected.map((r, i) => (
                  <li key={i}>
                    {String(r.proposal.action ?? "?")}: {RULE_LABEL[r.rule] ?? r.rule}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
