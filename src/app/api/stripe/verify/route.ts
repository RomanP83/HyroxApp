import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

// B6 (fixes S2): verify a checkout session directly with Stripe when the
// buyer returns, instead of hoping the webhook already landed. Idempotent
// with the webhook — both set the same field.
const Body = z.object({ checkout_session_id: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let session;
  try {
    session = await stripe().checkout.sessions.retrieve(parsed.data.checkout_session_id);
  } catch {
    return NextResponse.json({ error: "unknown_session" }, { status: 404 });
  }

  // The session must belong to this user and be paid.
  if (session.metadata?.user_id !== user.id) {
    return NextResponse.json({ error: "not_yours" }, { status: 403 });
  }
  if (session.payment_status !== "paid") {
    return NextResponse.json({ paid: false });
  }

  const planId = session.metadata?.plan_id ?? session.client_reference_id;
  if (planId) {
    await supabaseAdmin()
      .from("plans")
      .update({ stripe_payment_id: session.id })
      .eq("id", planId);
  }

  return NextResponse.json({ paid: true });
}
