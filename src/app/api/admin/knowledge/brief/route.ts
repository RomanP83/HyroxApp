import { NextResponse } from "next/server";
import { operatorAuthed } from "@/lib/adminAuth";
import { knowledgeBrief } from "@/lib/knowledge/brief";

export const runtime = "nodejs";

// The contract an external AI needs so its JSON can be pasted into the
// "ready-made proposals" box unchanged. Generated from the same constants the
// validator uses, so it can never drift from what the app accepts.
// Pure text from the app's own constants — no database, so this stays usable
// on an instance where the service role is not configured.
export async function GET(req: Request) {
  if (!operatorAuthed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ brief: knowledgeBrief() });
}
