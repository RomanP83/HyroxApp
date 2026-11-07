// Server-side Supabase clients.
//   await supabaseServer()  — RLS-scoped to the signed-in user (cookies).
//   supabaseAdmin()   — service-role, bypasses RLS. Use ONLY in trusted server
//                       code (webhooks, engine writes to athlete_state /
//                       plan_adjustments). Never expose to the browser.
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { USER_ID_HEADER } from "./userHeader";

// Placeholder fallbacks keep build/prerender from throwing when env is absent;
// real values are injected at runtime.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(items: { name: string; value: string; options?: Record<string, unknown> }[]) {
        try {
          items.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options as never),
          );
        } catch {
          // called from a Server Component — safe to ignore, middleware refreshes
        }
      },
    },
  });
}

/**
 * The signed-in user's id for a Server Component, or null.
 *
 * Every page used to call `auth.getUser()` — a round trip to the Supabase Auth
 * server — right after the middleware had made the very same round trip for
 * the same request. The middleware now passes the id it verified on a request
 * header (stripped from whatever the browser sent, so it cannot be forged from
 * outside), and this reads it. Only when the middleware did not run does it
 * verify the session itself, via `getClaims()`: a local signature check with
 * asymmetric JWT keys, the same Auth round trip as before with a legacy secret.
 *
 * Data access does not rest on this id alone: every query still carries the
 * user's JWT and row-level security answers for it.
 */
export async function currentUserId(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
): Promise<string | null> {
  const fromMiddleware = (await headers()).get(USER_ID_HEADER);
  if (fromMiddleware) return fromMiddleware;
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return typeof sub === "string" && sub ? sub : null;
}

export function supabaseAdmin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
