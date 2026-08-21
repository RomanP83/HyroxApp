import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

// One-time "Race Cycle" purchase (PP7) — matches the mental model "plan for MY
// race". Phase C4 adds an optional subscription tier for multi-racers /
// off-season athletes (§2 Should-Have), available when
// STRIPE_SUBSCRIPTION_PRICE_ID is configured.
const Body = z.object({
  planId: z.string().uuid(),
  tier: z.enum(["race_cycle", "subscription"]).default("race_cycle"),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Confirm the plan belongs to the user (RLS enforces this on select).
  const { data: plan } = await supabase
    .from("plans")
    .select("id")
    .eq("id", parsed.data.planId)
    .single();
  if (!plan) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const wantsSubscription =
    parsed.data.tier === "subscription" && Boolean(process.env.STRIPE_SUBSCRIPTION_PRICE_ID);
  const price = wantsSubscription
    ? process.env.STRIPE_SUBSCRIPTION_PRICE_ID!
    : process.env.STRIPE_RACE_CYCLE_PRICE_ID!;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const session = await stripe().checkout.sessions.create({
    mode: wantsSubscription ? "subscription" : "payment",
    line_items: [{ price, quantity: 1 }],
    // B6: the placeholder lets /plan verify the payment directly with Stripe
    // on return, independent of webhook timing.
    success_url: `${appUrl}/plan?checkout_session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/plan?canceled=1`,
    client_reference_id: parsed.data.planId,
    metadata: { plan_id: parsed.data.planId, user_id: user.id, tier: parsed.data.tier },
  });

  return NextResponse.json({ url: session.url });
}
