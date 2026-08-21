// Server-side Supabase clients.
//   supabaseServer()  — RLS-scoped to the signed-in user (cookies).
//   supabaseAdmin()   — service-role, bypasses RLS. Use ONLY in trusted server
//                       code (webhooks, engine writes to athlete_state /
//                       plan_adjustments). Never expose to the browser.
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

// Placeholder fallbacks keep build/prerender from throwing when env is absent;
// real values are injected at runtime.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export function supabaseServer() {
  const cookieStore = cookies();
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

export function supabaseAdmin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
