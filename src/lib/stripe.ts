import Stripe from "stripe";

let cached: Stripe | null = null;

/** Lazily construct the Stripe client so a missing key never breaks the build. */
export function stripe(): Stripe {
  if (!cached) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY not set");
    cached = new Stripe(key, { apiVersion: "2024-06-20" });
  }
  return cached;
}
