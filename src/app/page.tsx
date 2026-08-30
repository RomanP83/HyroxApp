// ============================================================================
// The front door.
//
// This app has one athlete, so the root has nothing to sell: it goes straight
// to the week. /plan sends anyone without a session on to /onboarding, so this
// is the whole of the entry logic.
// ============================================================================
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/plan");
}
