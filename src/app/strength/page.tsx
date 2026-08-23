import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { StrengthClient, type StrengthTemplate } from "@/components/StrengthClient";

export const dynamic = "force-dynamic";

export default async function StrengthPage() {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/onboarding");

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
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

  const { data: templates } = await supabase
    .from("strength_templates")
    .select(
      "id, name, sort_order, strength_exercises(id, position, name, sets, rep_min, rep_max, load_kg, superset_group, suggested_load_kg, suggested_reason)",
    )
    .eq("profile_id", profile.id)
    .order("sort_order", { ascending: true });

  return <StrengthClient templates={(templates ?? []) as unknown as StrengthTemplate[]} />;
}
