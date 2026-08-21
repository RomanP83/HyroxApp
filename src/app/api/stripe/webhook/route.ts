import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs"; // raw body needed for signature verification

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return NextResponse.json({ error: "not_configured" }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    return NextResponse.json({ error: `signature: ${(err as Error).message}` }, { status: 400 });
  }

  const admin = supabaseAdmin();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const planId = session.metadata?.plan_id ?? session.client_reference_id;
    if (planId) {
      // Unlock the plan (Section 4: webhook sets plans.status = active).
      await admin
        .from("plans")
        .update({ status: "active", stripe_payment_id: session.id })
        .eq("id", planId);
    }
    // C4: a subscription checkout also marks the PROFILE as subscribed, so
    // every future plan (multi-racer, off-season) unlocks without re-buying.
    if (session.mode === "subscription" && session.metadata?.user_id) {
      await admin
        .from("athlete_profiles")
        .update({
          stripe_customer_id: String(session.customer ?? ""),
          subscription_id: String(session.subscription ?? ""),
          subscription_status: "active",
        })
        .eq("user_id", session.metadata.user_id);
    }
  }

  // C4: keep subscription status in sync over its lifecycle.
  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const active = sub.status === "active" || sub.status === "trialing";
    await admin
      .from("athlete_profiles")
      .update({ subscription_status: active ? "active" : sub.status })
      .eq("subscription_id", sub.id);
  }

  return NextResponse.json({ received: true });
}
