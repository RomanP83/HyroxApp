import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { USER_ID_HEADER } from "@/lib/supabase/userHeader";

// The middleware hands Server Components the verified user id on a request
// header. That header must only ever carry what the middleware verified:
// anything a browser sends under the same name is dropped.
const claims = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getClaims: claims } }),
}));

// The header Next forwards to the page: NextResponse.next({ request: { headers } })
// encodes each overridden request header as x-middleware-request-<name>.
const forwarded = (res: Response) => res.headers.get(`x-middleware-request-${USER_ID_HEADER}`);

function forged() {
  return new NextRequest("https://hub.test/plan", { headers: { [USER_ID_HEADER]: "someone-else" } });
}

describe("middleware user header", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  });
  afterEach(() => {
    process.env = { ...env };
    claims.mockReset();
  });

  it("replaces a forged id with the verified one", async () => {
    claims.mockResolvedValue({ data: { claims: { sub: "me" } }, error: null });
    const { middleware } = await import("@/middleware");
    expect(forwarded(await middleware(forged()))).toBe("me");
  });

  it("drops a forged id when nobody is signed in", async () => {
    claims.mockResolvedValue({ data: null, error: null });
    const { middleware } = await import("@/middleware");
    const res = await middleware(forged());
    expect(forwarded(res)).toBeNull();
    expect(res.headers.get("x-middleware-override-headers") ?? "").not.toContain(USER_ID_HEADER);
  });

  it("drops a forged id when Supabase is not configured", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const { middleware } = await import("@/middleware");
    expect(forwarded(await middleware(forged()))).toBeNull();
  });
});
