// ============================================================================
// Weekly review (Phase C3, PP5 / HYFIT pattern): the 5-minute Sunday summary —
// what you logged, what the engine changed and why, and what next week brings.
// Built from data that already exists (sessions, plan_adjustments, weeks).
// Returned as plain text (Telegram-safe HTML subset) + email HTML.
// ============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { fmtClock } from "@/lib/format";

export interface WeeklyReview {
  text: string; // Telegram-flavored (bold via <b>)
  html: string; // email body
}

export async function buildWeeklyReview(
  admin: SupabaseClient,
  planId: string,
): Promise<WeeklyReview | null> {
  const { data: week } = await admin
    .from("plan_weeks")
    .select("id, week_number, target_sessions")
    .eq("plan_id", planId)
    .eq("status", "current")
    .maybeSingle();
  if (!week) return null;

  const [{ data: sessions }, { data: nextWeek }, { data: adjustments }, { data: plan }] =
    await Promise.all([
      admin.from("sessions").select("id, title, status").eq("week_id", week.id),
      admin
        .from("plan_weeks")
        .select("week_number, is_deload, is_benchmark_week, weekly_goal, target_sessions")
        .eq("plan_id", planId)
        .eq("status", "upcoming")
        .order("week_number", { ascending: true })
        .limit(1)
        .maybeSingle(),
      admin
        .from("plan_adjustments")
        .select("reason, created_at")
        .eq("plan_id", planId)
        .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
        .order("created_at", { ascending: false })
        .limit(3),
      admin
        .from("plans")
        .select("profile_id, athlete_state:profile_id(predicted_race_time_sec)")
        .eq("id", planId)
        .maybeSingle(),
    ]);

  const done = (sessions ?? []).filter((s) => s.status === "done").length;
  const skipped = (sessions ?? []).filter((s) => s.status === "skipped").length;
  const target = week.target_sessions;
  const reasons = (adjustments ?? []).map((a) => a.reason).filter(Boolean) as string[];

  // predicted time via separate query (join above may not resolve on views)
  let predicted: number | null = null;
  if (plan?.profile_id) {
    const { data: state } = await admin
      .from("athlete_state")
      .select("predicted_race_time_sec")
      .eq("profile_id", plan.profile_id)
      .maybeSingle();
    predicted = state?.predicted_race_time_sec ?? null;
  }

  const lines: string[] = [];
  lines.push(`<b>Week ${week.week_number} review</b>`);
  lines.push(
    `You logged ${done}/${target} sessions${skipped ? ` (${skipped} skipped — no make-up pile-up)` : ""}.`,
  );
  if (reasons.length) {
    lines.push(`\n<b>What the engine changed:</b>`);
    for (const r of reasons) lines.push(`• ${r}`);
  } else {
    lines.push(`\nNo adjustments needed this week — you're right on plan.`);
  }
  if (predicted != null) lines.push(`\nEstimated finish: <b>${fmtClock(predicted)}</b>`);
  if (nextWeek) {
    lines.push(
      `\n<b>Next up — week ${nextWeek.week_number}${nextWeek.is_deload ? " (deload)" : ""}${nextWeek.is_benchmark_week ? " (benchmark)" : ""}:</b>`,
    );
    if (nextWeek.weekly_goal) lines.push(nextWeek.weekly_goal);
  }

  const text = lines.join("\n");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a">
    ${lines
      .map((l) =>
        l.startsWith("•")
          ? `<p style="margin:2px 0 2px 12px;color:#444">${l}</p>`
          : `<p style="margin:8px 0">${l}</p>`,
      )
      .join("")}
    <a href="${appUrl}/progress"
       style="display:inline-block;margin-top:12px;background:#ff5a1f;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600">
      See your progress charts
    </a>
  </div>`;

  return { text, html };
}
