import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Phase D2 / §7 beta metric: share of logs with REAL RPE input (athletes who
// 1-tap everything get the macro-only experience), plus the Telegram connect
// rate (§7 open question 4 — the trigger for the email fallback).
// Guarded by the same operator secret as the crons.
function authed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = supabaseAdmin();

  const [{ data: kpis }, { count: profilesTotal }, { count: profilesConnected }] =
    await Promise.all([
      admin.from("beta_kpis").select("*").maybeSingle(),
      admin.from("athlete_profiles").select("id", { count: "exact", head: true }),
      admin
        .from("athlete_profiles")
        .select("id", { count: "exact", head: true })
        .not("telegram_chat_id", "is", null),
    ]);

  const total = profilesTotal ?? 0;
  const connected = profilesConnected ?? 0;

  return NextResponse.json({
    logs: kpis ?? { logs_total: 0, logs_with_real_rpe: 0, real_rpe_pct: 0, plans_with_logs: 0 },
    telegram: {
      profiles_total: total,
      profiles_connected: connected,
      connect_rate_pct: total ? Math.round((1000 * connected) / total) / 10 : 0,
      // §7: below 30% the email fallback carries the check-in load.
      email_fallback_recommended: total > 0 && connected / total < 0.3,
    },
  });
}
