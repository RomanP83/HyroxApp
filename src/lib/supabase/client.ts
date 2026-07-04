"use client";

import { createBrowserClient } from "@supabase/ssr";

// Placeholder fallbacks keep prerender/build from throwing when env is absent;
// real values are injected at runtime.
const PLACEHOLDER_URL = "https://placeholder.supabase.co";
const PLACEHOLDER_KEY = "placeholder-anon-key";

export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || PLACEHOLDER_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PLACEHOLDER_KEY,
  );
}
