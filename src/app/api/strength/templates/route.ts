import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { parseStrengthTemplate } from "@/lib/strength/parse";

export const runtime = "nodejs";

// Import is a paste, not an upload: copying a range out of Excel puts
// tab-separated text on the clipboard, and lib/strength/parse.ts reads it.
const CreateBody = z.object({
  text: z.string().min(5).max(20_000),
  name: z.string().max(120).optional(),
  /** true = parse and return, save nothing (the preview step). */
  preview: z.boolean().optional(),
});

const PatchBody = z.object({
  exercise_id: z.string().uuid(),
  action: z.enum(["set_load", "accept_suggestion", "dismiss_suggestion"]),
  load_kg: z.number().min(0).max(1000).nullable().optional(),
});

async function profileOf(supabase: ReturnType<typeof supabaseServer>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("athlete_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  return data?.id ?? null;
}

export async function GET() {
  const supabase = supabaseServer();
  const profileId = await profileOf(supabase);
  if (!profileId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("strength_templates")
    .select(
      "id, name, sort_order, notes, created_at, strength_exercises(id, position, name, sets, rep_min, rep_max, load_kg, superset_group, notes, suggested_load_kg, suggested_reason)",
    )
    .eq("profile_id", profileId)
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(req: Request) {
  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const supabase = supabaseServer();
  const profileId = await profileOf(supabase);
  if (!profileId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = parseStrengthTemplate(parsed.data.text);
  if (!result.exercises.length) {
    return NextResponse.json(
      { error: "nothing_parsed", warnings: result.warnings },
      { status: 400 },
    );
  }
  // Preview first: the athlete sees what the parser made of their sheet before
  // anything is stored.
  if (parsed.data.preview) {
    return NextResponse.json({ preview: true, ...result });
  }

  const { count } = await supabase
    .from("strength_templates")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId);

  const { data: template, error } = await supabase
    .from("strength_templates")
    .insert({
      profile_id: profileId,
      name: parsed.data.name?.trim() || result.name || `Strength day ${(count ?? 0) + 1}`,
      sort_order: count ?? 0,
    })
    .select("id, name")
    .single();
  if (error || !template) {
    return NextResponse.json({ error: "insert_failed", detail: error?.message }, { status: 500 });
  }

  const { error: exErr } = await supabase.from("strength_exercises").insert(
    result.exercises.map((e) => ({
      template_id: template.id,
      position: e.position,
      name: e.name,
      sets: e.sets,
      rep_min: e.rep_min,
      rep_max: e.rep_max,
      load_kg: e.load_kg,
      superset_group: e.superset_group,
    })),
  );
  if (exErr) {
    await supabase.from("strength_templates").delete().eq("id", template.id);
    return NextResponse.json({ error: "insert_failed", detail: exErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    template,
    exercises: result.exercises.length,
    warnings: result.warnings,
  });
}

/** Edit a weight, or answer an open progression suggestion. */
export async function PATCH(req: Request) {
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const { exercise_id, action, load_kg } = parsed.data;

  const supabase = supabaseServer();
  const profileId = await profileOf(supabase);
  if (!profileId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // RLS already scopes the row to its owner; read it to resolve the suggestion.
  const { data: exercise } = await supabase
    .from("strength_exercises")
    .select("id, load_kg, suggested_load_kg")
    .eq("id", exercise_id)
    .maybeSingle();
  if (!exercise) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const clearSuggestion = { suggested_load_kg: null, suggested_reason: null, suggested_at: null };
  const update =
    action === "accept_suggestion"
      ? exercise.suggested_load_kg == null
        ? null
        : { load_kg: exercise.suggested_load_kg, ...clearSuggestion }
      : action === "dismiss_suggestion"
        ? clearSuggestion
        : { load_kg: load_kg ?? null, ...clearSuggestion };
  if (!update) return NextResponse.json({ error: "no_suggestion" }, { status: 409 });

  const { error } = await supabase.from("strength_exercises").update(update).eq("id", exercise_id);
  if (error) return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...update });
}

export async function DELETE(req: Request) {
  const templateId = new URL(req.url).searchParams.get("template");
  if (!templateId) return NextResponse.json({ error: "template is required" }, { status: 400 });

  const supabase = supabaseServer();
  const profileId = await profileOf(supabase);
  if (!profileId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("strength_templates")
    .delete()
    .eq("id", templateId)
    .eq("profile_id", profileId);
  if (error) return NextResponse.json({ error: "delete_failed", detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
