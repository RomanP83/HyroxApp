import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { USER_ID_HEADER } from "@/lib/supabase/userHeader";

// Refresh the Supabase auth session on navigation so Server Components see a
// current user, and hand them the verified user id so they do not have to ask
// the Auth server a second time for the same request. Skips static assets.
export async function middleware(request: NextRequest) {
  // Skip auth refresh entirely when Supabase isn't configured (keeps the app
  // servable without env, e.g. static preview of the marketing pages). The
  // header is still stripped: only this middleware may ever set it.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const headers = new Headers(request.headers);
    headers.delete(USER_ID_HEADER);
    return NextResponse.next({ request: { headers } });
  }

  const refreshed: { name: string; value: string; options?: Record<string, unknown> }[] = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(items: { name: string; value: string; options?: Record<string, unknown> }[]) {
          // Onto the request, so the page renders with the refreshed session…
          items.forEach(({ name, value }) => request.cookies.set(name, value));
          // …and remembered for the response, so the browser keeps it.
          refreshed.push(...items);
        },
      },
    },
  );

  // getClaims refreshes an expired session like getUser does, but verifies the
  // token locally when the project signs with asymmetric keys instead of
  // asking the Auth server on every navigation.
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;

  // Built after the refresh: request.cookies.set has rewritten the cookie
  // header by now. Whatever the browser sent under the user header is dropped.
  const headers = new Headers(request.headers);
  headers.delete(USER_ID_HEADER);
  if (userId) headers.set(USER_ID_HEADER, userId);

  const response = NextResponse.next({ request: { headers } });
  refreshed.forEach(({ name, value, options }) => response.cookies.set(name, value, options as never));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|offline\\.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
