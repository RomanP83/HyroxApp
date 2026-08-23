import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { rebasePlan } from "@/lib/rebasePlan";

// B4 (plan §5): the injury flag. "activate" switches the plan to rehab mode
// (low-impact instead of a plan stop); "recover" rebuilds the plan from today
// via the rebase path — the counterpart to running.COACH's praised rehab flow.
const Body = z.object({ action: z.enum(["activate", "recover"]) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // RLS scopes this to the caller's own plans — that is the ownership check.
  const { data: plan } = await supabase
    .from("plans")
    .select("id, status")
    .in("status", ["active", "paused", "rehab"])
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return NextResponse.json({ error: "no_plan" }, { status: 404 });

  const admin = supabaseAdmin();

  if (parsed.data.action === "activate") {
    if (plan.status === "rehab") return NextResponse.json({ ok: true, status: "rehab" });
    await supabase.from("plans").update({ status: "rehab" }).eq("id", plan.id);
    await admin.from("plan_adjustments").insert({
      plan_id: plan.id,
      layer: "macro",
      trigger: "injury_flag",
      action_taken: { type: "rehab_mode" },
      reason:
        "Injury flagged — the plan is paused into low-impact rehab mode instead of stopping. Stick to mobility and easy movement; when you reactivate, the plan rebuilds from that day.",
    });
    return NextResponse.json({ ok: true, status: "rehab" });
  }

  // recover: rebuild from today (rebase abandons the rehab plan atomically).
  let newPlanId: string | null = null;
  try {
    newPlanId = await rebasePlan(
      admin,
      plan.id,
      "Welcome back — the plan was rebuilt from today after your injury break, with an eased re-entry and phases re-timed to your race.",
    );
  } catch (e) {
    // A rebase touches the library and the persistence RPC, and both
    // throw. Letting that escape returns a 500 with no body, which the
    // browser can only report as a JSON parse error.
    return NextResponse.json(
      {
        error: "rebase_failed",
        detail: `Your settings were saved, but the plan could not be rebuilt: ${
          e instanceof Error ? e.message : "unknown error"
        }`,
      },
      { status: 500 },
    );
  }
  if (!newPlanId) return NextResponse.json({ error: "rebase_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, status: "active", planId: newPlanId });
}
