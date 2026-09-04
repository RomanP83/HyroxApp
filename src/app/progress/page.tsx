import { AppHeader } from "@/components/AppHeader";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { computeLoadState, type LoadEntry } from "@/lib/engine";
import { fmtClock } from "@/lib/format";
import { BarChart, LineChart, type Pt } from "@/components/charts";

export const dynamic = "force-dynamic";

// Phase C1: progress visualization. Every series here already existed in the
// DB (session_logs, plan_adjustments, benchmark_results, athlete_state) — the
// ACWR curve is recomputed day-by-day with the same pure engine function the
// adaptive layer uses, so chart and engine can never disagree.
export default async function ProgressPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/onboarding");

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!profile) redirect("/onboarding");

  const { data: plan } = await supabase
    .from("plans")
    .select("id, total_weeks")
    .eq("profile_id", profile.id)
    .in("status", ["active", "paused", "rehab"])
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [{ data: state }, { data: weeks }, { data: logs }, { data: prognosisRows }, { data: benchDefs }, { data: benchResults }] =
    await Promise.all([
      supabase.from("athlete_state").select("*").eq("profile_id", profile.id).maybeSingle(),
      plan
        ? supabase
            .from("plan_weeks")
            .select("id, week_number, target_sessions, status")
            .eq("plan_id", plan.id)
            .order("week_number")
        : Promise.resolve({ data: [] as any[] }),
      plan
        ? supabase
            .from("session_logs")
            .select("completed_at, rpe_actual, duration_actual_min, sessions!inner(plan_id, week_id, intensity_rpe_target, status)")
            .eq("sessions.plan_id", plan.id)
            .order("completed_at", { ascending: true })
        : Promise.resolve({ data: [] as any[] }),
      plan
        ? supabase
            .from("plan_adjustments")
            .select("created_at, action_taken")
            .eq("plan_id", plan.id)
            .filter("action_taken->>type", "eq", "prognosis")
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] as any[] }),
      supabase.from("benchmark_definitions").select("id, name, metric_type"),
      supabase
        .from("benchmark_results")
        .select("benchmark_id, value, recorded_at")
        .eq("profile_id", profile.id)
        .order("recorded_at", { ascending: true }),
    ]);

  const logList = (logs ?? []) as any[];
  const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  // ── Weekly compliance (logged sessions vs target per week) ────────────────
  const doneByWeek = new Map<string, number>();
  for (const l of logList) doneByWeek.set(l.sessions.week_id, (doneByWeek.get(l.sessions.week_id) ?? 0) + 1);
  const complianceBars: Pt[] = (weeks ?? [])
    .filter((w: any) => w.status !== "upcoming")
    .map((w: any) => ({
      label: `W${w.week_number}`,
      y: Math.min(100, Math.round((100 * (doneByWeek.get(w.id) ?? 0)) / Math.max(1, w.target_sessions))),
    }));

  // ── RPE trend: target vs actual per logged session (last 24) ──────────────
  const rpeLogs = logList.filter((l) => l.rpe_actual != null).slice(-24);
  const rpeTarget: Pt[] = rpeLogs.map((l) => ({ label: day(l.completed_at), y: l.sessions.intensity_rpe_target }));
  const rpeActual: Pt[] = rpeLogs.map((l) => ({ label: day(l.completed_at), y: l.rpe_actual }));

  // ── ACWR curve, recomputed daily from the sRPE history ────────────────────
  const history: LoadEntry[] = logList.map((l) => ({
    at: l.completed_at,
    srpe: (l.rpe_actual ?? 0) * (l.duration_actual_min ?? 0),
  }));
  const acwrSeries: Pt[] = [];
  if (history.length >= 2) {
    const start = new Date(history[0].at as string).getTime();
    const end = Date.now();
    const span = Math.max(1, Math.ceil((end - start) / 86_400_000));
    const step = Math.max(1, Math.ceil(span / 40));
    for (let d = 7; d <= span; d += step) {
      const at = new Date(start + d * 86_400_000);
      acwrSeries.push({ label: day(at.toISOString()), y: computeLoadState(history, at).acwr });
    }
  }

  // ── Prognosis trend ───────────────────────────────────────────────────────
  const prognosis: Pt[] = (prognosisRows ?? []).map((r: any) => ({
    label: day(r.created_at),
    y: Number(r.action_taken.to),
  }));
  if (state?.predicted_race_time_sec != null) {
    prognosis.push({ label: "now", y: state.predicted_race_time_sec });
  }

  // ── Benchmarks ────────────────────────────────────────────────────────────
  const benchCharts = (benchDefs ?? [])
    .map((d: any) => ({
      def: d,
      pts: (benchResults ?? [])
        .filter((r: any) => r.benchmark_id === d.id)
        .map((r: any) => ({ label: day(r.recorded_at), y: Number(r.value) })),
    }))
    .filter((b) => b.pts.length > 0);

  const totalLogged = logList.length;
  const overallCompliance = complianceBars.length
    ? Math.round(complianceBars.reduce((s, b) => s + b.y, 0) / complianceBars.length)
    : 0;

  return (
    <main className="space-y-6">
      <AppHeader />
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-h1 font-bold tracking-tight">Progress</h1>
        <span className="pill">every number from your logs</span>
      </div>

      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Tile label="Estimated finish" value={fmtClock(state?.predicted_race_time_sec)} />
        <Tile label="ACWR now" value={state ? String(Number(state.acwr).toFixed(2)) : "—"} />
        <Tile label="Avg. weekly compliance" value={`${overallCompliance}%`} />
        <Tile label="Sessions logged" value={String(totalLogged)} />
      </div>

      <Card title="Weekly compliance" sub="Logged sessions vs. the week's target">
        <BarChart bars={complianceBars} fmt={(v) => `${v}%`} domain={[0, 100]} />
      </Card>

      <Card title="Effort: planned vs. felt" sub="RPE target (line) against your logged RPE (dots)">
        <LineChart series={rpeTarget} secondary={rpeActual} legend={["RPE target", "RPE actual"]} domain={[1, 10]} fmt={(v) => v.toFixed(0)} />
      </Card>

      <Card title="Training load ratio (ACWR)" sub="Acute (7d) vs. chronic (28d) load — the engine's guardrail signal">
        <LineChart
          series={acwrSeries}
          fmt={(v) => v.toFixed(2)}
          refLines={[
            { y: 1.5, label: "auto-deload 1.5" },
            { y: 1.3, label: "trim 1.3" },
            { y: 0.8, label: "ramp-up 0.8" },
          ]}
        />
      </Card>

      <Card title="Finish-time estimate over time" sub="Every recalibration the engine logged">
        <LineChart series={prognosis} fmt={(v) => fmtClock(v)} />
      </Card>

      {benchCharts.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Benchmarks</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {benchCharts.map((b) => (
              <Card key={b.def.id} title={b.def.name} sub={b.def.metric_type === "time_sec" ? "lower is better" : "higher is better"}>
                <LineChart series={b.pts} fmt={(v) => (b.def.metric_type === "time_sec" ? fmtClock(v) : String(v))} />
              </Card>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="text-xs text-ash">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h2 className="font-semibold">{title}</h2>
      <p className="mb-3 text-xs text-ash">{sub}</p>
      {children}
    </div>
  );
}
