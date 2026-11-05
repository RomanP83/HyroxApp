import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { rebasePlan } from "@/lib/rebasePlan";

export const runtime = "nodejs";

// Vacations: add or remove one, then rebuild the remaining weeks around it
// (src/lib/engine/vacation.ts decides what each vacation day becomes).
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Create = z.object({
  starts_on: DATE,
  ends_on: DATE,
  mode: z.enum(["maintain", "off"]),
  note: z.string().trim().max(80).nullable().optional(),
});

const DAY_MS = 86_400_000;
const fmt = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;

async function context() {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, profileId: null as string | null, status: 401 };
  const { data: profile } = await supabase.from("athlete_profiles").select("id").eq("user_id", user.id).maybeSingle();
  return { supabase, profileId: (profile?.id as string | undefined) ?? null, status: profile ? 200 : 404 };
}

async function rebuild(supabase: ReturnType<typeof supabaseServer>, profileId: string, reason: string) {
  const { data: plan } = await supabase
    .from("plans")
    .select("id")
    .eq("profile_id", profileId)
    .in("status", ["active", "paused"])
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return null;
  return rebasePlan(supabaseAdmin(), plan.id, reason);
}

export async function POST(req: Request) {
  const parsed = Create.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const v = parsed.data;
  const days = Math.round((Date.parse(v.ends_on) - Date.parse(v.starts_on)) / DAY_MS) + 1;
  if (!(days >= 1)) {
    return NextResponse.json({ error: "ends_before_start", detail: "The last day is before the first." }, { status: 400 });
  }
  if (days > 61) {
    return NextResponse.json(
      { error: "too_long", detail: "A vacation is at most two months. Longer than that is a new season, not a break." },
      { status: 400 },
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  if (v.ends_on < today) {
    return NextResponse.json({ error: "in_the_past", detail: "That vacation is already over." }, { status: 400 });
  }

  const { supabase, profileId, status } = await context();
  if (!profileId) return NextResponse.json({ error: status === 401 ? "unauthorized" : "no_profile" }, { status });

  const { data, error } = await supabase
    .from("vacations")
    .insert({ profile_id: profileId, starts_on: v.starts_on, ends_on: v.ends_on, mode: v.mode, note: v.note || null })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: "insert_failed", detail: error.message }, { status: 500 });

  const planId = await rebuild(
    supabase,
    profileId,
    v.mode === "off"
      ? `Vacation ${fmt(v.starts_on)}–${fmt(v.ends_on)}: nothing planned on those days — the remaining weeks were rebuilt around it.`
      : `Vacation ${fmt(v.starts_on)}–${fmt(v.ends_on)}: easy running and bodyweight only on those days — the remaining weeks were rebuilt around it.`,
  );
  return NextResponse.json({ ok: true, id: data.id, rebased: Boolean(planId) });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const { supabase, profileId, status } = await context();
  if (!profileId) return NextResponse.json({ error: status === 401 ? "unauthorized" : "no_profile" }, { status });

  const { data, error } = await supabase
    .from("vacations")
    .delete()
    .eq("id", id)
    .eq("profile_id", profileId)
    .select("starts_on, ends_on")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "delete_failed", detail: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const planId = await rebuild(
    supabase,
    profileId,
    `Vacation ${fmt(String(data.starts_on))}–${fmt(String(data.ends_on))} removed — those days are training days again.`,
  );
  return NextResponse.json({ ok: true, rebased: Boolean(planId) });
}
