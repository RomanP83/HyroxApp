import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

// One-time "Race Cycle" purchase (PP7). Matches the mental model "plan for MY
// race"; benchmark price 79.99 EUR. Free preview (week 1) is enforced in the UI;
// this unlocks the rest.
const Body = z.object({ planId: z.string().uuid() });

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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: process.env.STRIPE_RACE_CYCLE_PRICE_ID!, quantity: 1 }],
    success_url: `${appUrl}/plan?paid=1`,
    cancel_url: `${appUrl}/plan?canceled=1`,
    client_reference_id: parsed.data.planId,
    metadata: { plan_id: parsed.data.planId, user_id: user.id },
  });

  return NextResponse.json({ url: session.url });
}
