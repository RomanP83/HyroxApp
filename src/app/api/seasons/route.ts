import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { ENGINE_VERSION, planSeason, type SeasonRaceInput } from "@/lib/engine";

export const runtime = "nodejs";

// The season is deterministic, so it is regenerated wholesale whenever the
// calendar changes: same (start_date, races, weaknesses) -> same season.
const Body = z.object({
  start_date: z.string().optional(),
  horizon_weeks: z.number().int().min(4).max(104).optional(),
  weaknesses: z.array(z.string().max(60)).max(10).optional(),
  races: z
    .array(
      z.object({
        date: z.string(),
        type: z.string().min(2).max(80),
        priority: z.enum(["A", "B", "C"]),
      }),
    )
    .max(12),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", detail: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("id, training_days_per_week, weaknesses")
    .eq("user_id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "no_profile" }, { status: 404 });

  // Weaknesses live on the profile so the season and the coach layer share one
  // list; the request may update them in the same call.
  const weaknesses = body.weaknesses ?? (profile.weaknesses as string[] | null) ?? [];
  if (body.weaknesses) {
    await supabase.from("athlete_profiles").update({ weaknesses }).eq("id", profile.id);
  }

  const startDate = (body.start_date ?? new Date().toISOString()).slice(0, 10);
  let season;
  try {
    season = planSeason({
      startDate,
      races: body.races as SeasonRaceInput[],
      trainingDaysPerWeek: profile.training_days_per_week,
      weaknesses,
      horizonWeeks: body.horizon_weeks,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "invalid_calendar", detail: e instanceof Error ? e.message : "unknown" },
      { status: 400 },
    );
  }

  // One season per athlete: replacing it is the regeneration (cascade clears
  // races and blocks with it).
  await supabase.from("seasons").delete().eq("profile_id", profile.id);

  const { data: seasonRow, error: seasonErr } = await supabase
    .from("seasons")
    .insert({
      profile_id: profile.id,
      start_date: season.start_date,
      end_date: season.end_date,
      total_weeks: season.total_weeks,
      horizon_weeks: body.horizon_weeks ?? 52,
      engine_version: ENGINE_VERSION,
      notes: season.notes,
    })
    .select("id")
    .single();
  if (seasonErr || !seasonRow) {
    return NextResponse.json({ error: "season_insert_failed", detail: seasonErr?.message }, { status: 500 });
  }

  if (season.races.length) {
    const { error } = await supabase.from("season_races").insert(
      season.races.map((r) => ({
        season_id: seasonRow.id,
        sort_order: r.index,
        race_date: r.date,
        race_type: r.type,
        priority: r.priority,
        week_number: r.week_number,
        is_anchor: r.is_anchor,
      })),
    );
    if (error) return NextResponse.json({ error: "races_insert_failed", detail: error.message }, { status: 500 });
  }

  const blockRows = season.macrocycles.flatMap((m) =>
    m.blocks.map((b) => ({
      season_id: seasonRow.id,
      macrocycle_sort: m.sort_order,
      macrocycle_label: m.label,
      target_race_index: m.target_race_index,
      sort_order: b.sort_order,
      kind: b.kind,
      start_week: b.start_week,
      end_week: b.end_week,
      weeks: b.weeks,
      start_date: b.start_date,
      end_date: b.end_date,
      volume_multiplier: b.volume_multiplier,
      focus: b.focus,
      key_sessions: b.key_sessions,
      weakness_targets: b.weakness_targets,
      deload_weeks: b.deload_weeks,
    })),
  );
  if (blockRows.length) {
    const { error } = await supabase.from("season_blocks").insert(blockRows);
    if (error) return NextResponse.json({ error: "blocks_insert_failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, seasonId: seasonRow.id, season });
}
