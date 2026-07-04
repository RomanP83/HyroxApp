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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const planId = session.metadata?.plan_id ?? session.client_reference_id;
    if (planId) {
      // Unlock the plan (Section 4: webhook sets plans.status = active).
      await supabaseAdmin()
        .from("plans")
        .update({ status: "active", stripe_payment_id: session.id })
        .eq("id", planId);
    }
  }

  return NextResponse.json({ received: true });
}
