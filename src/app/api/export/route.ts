// ============================================================================
// Everything you have ever logged, in one file.
//
// This app has one athlete and one Supabase project, which makes that project a
// single point of failure for years of training history. For a product with
// many users an export is a compliance chore; here it is the backup. The
// payload itself is built in lib/exportPayload.ts (shared with /api/hub/export).
// ============================================================================
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { buildExportPayload } from "@/lib/exportPayload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "no_profile" }, { status: 404 });

  try {
    const payload = await buildExportPayload(supabase, profile);
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="hyroxhub-${stamp}.json"`,
        // A backup is never served from a cache.
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "export_failed", detail: e instanceof Error ? e.message : "unknown error" },
      { status: 500 },
    );
  }
}
