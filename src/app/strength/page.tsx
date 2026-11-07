import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUserId, supabaseServer } from "@/lib/supabase/server";
import { StrengthClient, type StrengthTemplate } from "@/components/StrengthClient";

export const dynamic = "force-dynamic";

export default async function StrengthPage() {
  const supabase = await supabaseServer();
  const userId = await currentUserId(supabase);
  if (!userId) redirect("/onboarding");

  // Profile and templates in one round: the templates are reached through
  // the profile's owner, so they need not wait for the profile id.
  const [{ data: profile }, { data: templates }] = await Promise.all([
    supabase.from("athlete_profiles").select("id").eq("user_id", userId).single(),
    supabase
      .from("strength_templates")
      .select(
        "id, name, sort_order, strength_exercises(id, position, name, sets, rep_min, rep_max, load_kg, superset_group, suggested_load_kg, suggested_reason), athlete_profiles!inner(user_id)",
      )
      .eq("athlete_profiles.user_id", userId)
      .order("sort_order", { ascending: true }),
  ]);
  if (!profile) {
    return (
      <main className="mx-auto max-w-md space-y-4 pt-20 text-center animate-fade-up">
        <div className="text-4xl">🏋️</div>
        <h1 className="text-2xl font-bold">First the profile</h1>
        <p className="text-ash">
          Your strength days hang off your athlete profile — two minutes of onboarding and you can
          paste them in.
        </p>
        <Link href="/onboarding" className="btn-primary">
          Set up my profile →
        </Link>
      </main>
    );
  }

  return <StrengthClient templates={
        (templates ?? []).map(({ athlete_profiles: _owner, ...t }) => t) as unknown as StrengthTemplate[]
      } />;
}
