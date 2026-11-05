import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

// Races and full simulations with their splits. Everything derived from them
// (target splits, gaps, readiness, post-BBJ pace loss) is computed on read by
// src/lib/engine/raceAnalysis.ts, so these routes only store what was timed.
const split = z.number().int().min(1).max(3600).nullable();

const Create = z.object({
  kind: z.enum(["race", "simulation"]),
  held_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string().trim().max(80).nullable().optional(),
  is_baseline: z.boolean().default(false),
  total_sec: z.number().int().min(600).max(21600).nullable().optional(),
  runs_sec: z.array(split).length(8).nullable().optional(),
  stations_sec: z.array(split).length(8).nullable().optional(),
  roxzone_sec: z.number().int().min(0).max(7200).nullable().optional(),
});

const Patch = z.object({ id: z.string().uuid(), is_baseline: z.literal(true) });

async function profileId() {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, id: null as string | null, status: 401 };
  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  return { supabase, id: (profile?.id as string | undefined) ?? null, status: profile ? 200 : 404 };
}

const allTimed = (xs: (number | null)[] | null | undefined): xs is number[] =>
  Array.isArray(xs) && xs.length === 8 && xs.every((x) => typeof x === "number");

export async function POST(req: Request) {
  const parsed = Create.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const body = parsed.data;

  const { supabase, id, status } = await profileId();
  if (!id) return NextResponse.json({ error: status === 401 ? "unauthorized" : "no_profile" }, { status });

  // A missing total is the sum of the splits — but only when every one was timed.
  let total = body.total_sec ?? null;
  if (total == null && allTimed(body.runs_sec) && allTimed(body.stations_sec) && body.roxzone_sec != null) {
    total =
      body.runs_sec.reduce((a, b) => a + b, 0) +
      body.stations_sec.reduce((a, b) => a + b, 0) +
      body.roxzone_sec;
  }
  if (total == null) return NextResponse.json({ error: "total_required" }, { status: 400 });

  const emptyToNull = (xs: (number | null)[] | null | undefined) =>
    xs && xs.some((x) => x != null) ? xs : null;

  // One baseline per athlete: a new baseline demotes the old one first.
  if (body.is_baseline) {
    await supabase.from("race_results").update({ is_baseline: false }).eq("profile_id", id).eq("is_baseline", true);
  }

  const { data, error } = await supabase
    .from("race_results")
    .insert({
      profile_id: id,
      kind: body.kind,
      held_on: body.held_on,
      label: body.label || null,
      is_baseline: body.is_baseline,
      total_sec: total,
      runs_sec: emptyToNull(body.runs_sec),
      stations_sec: emptyToNull(body.stations_sec),
      roxzone_sec: body.roxzone_sec ?? null,
    })
    .select("id, total_sec")
    .single();
  if (error) return NextResponse.json({ error: "insert_failed", detail: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: data.id, total_sec: data.total_sec });
}

/** Make an existing result the baseline. */
export async function PATCH(req: Request) {
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const { supabase, id, status } = await profileId();
  if (!id) return NextResponse.json({ error: status === 401 ? "unauthorized" : "no_profile" }, { status });

  await supabase.from("race_results").update({ is_baseline: false }).eq("profile_id", id).eq("is_baseline", true);
  const { data, error } = await supabase
    .from("race_results")
    .update({ is_baseline: true })
    .eq("id", parsed.data.id)
    .eq("profile_id", id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const resultId = new URL(req.url).searchParams.get("id") ?? "";
  if (!z.string().uuid().safeParse(resultId).success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const { supabase, id, status } = await profileId();
  if (!id) return NextResponse.json({ error: status === 401 ? "unauthorized" : "no_profile" }, { status });

  const { data, error } = await supabase
    .from("race_results")
    .delete()
    .eq("id", resultId)
    .eq("profile_id", id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "delete_failed", detail: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
