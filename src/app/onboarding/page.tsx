"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";

type Division = "open" | "pro" | "doubles" | "masters_open";
type Level = "beginner" | "intermediate" | "advanced";
type Equipment = "full_gym" | "home_minimal" | "hybrid";

export const dynamic = "force-dynamic";

export default function Onboarding() {
  const router = useRouter();
  const [supabase] = useState(() => supabaseBrowser());
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [sent, setSent] = useState(false);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [division, setDivision] = useState<Division>("open");
  const [level, setLevel] = useState<Level>("intermediate");
  const [days, setDays] = useState(4);
  const [equipment, setEquipment] = useState<Equipment>("full_gym");
  const [fiveKMin, setFiveKMin] = useState(22);
  const [fiveKSec, setFiveKSec] = useState(30);
  const [raceDate, setRaceDate] = useState("");
  const [raceId, setRaceId] = useState<string | null>(null);
  const [races, setRaces] = useState<
    { id: string; name: string; city: string | null; event_date: string }[]
  >([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setSignedIn(!!data.user);
      setReady(true);
    });
    // B5: real event calendar (races is public-read); empty table degrades to
    // the free date picker.
    supabase
      .from("races")
      .select("id, name, city, event_date")
      .gte("event_date", new Date().toISOString().slice(0, 10))
      .order("event_date", { ascending: true })
      .limit(60)
      .then(({ data }) => setRaces(data ?? []));
  }, [supabase]);

  async function sendMagicLink() {
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/onboarding` },
    });
    if (error) setError(error.message);
    else setSent(true);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/plans/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          division,
          experience_level: level,
          five_k_seconds: fiveKMin * 60 + fiveKSec,
          training_days_per_week: days,
          equipment_access: equipment,
          race_date: raceDate,
          race_id: raceId,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "generation failed");
      router.push("/plan");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) return <main className="p-8 text-muted">Loading…</main>;

  if (!signedIn) {
    return (
      <main className="mx-auto max-w-md space-y-4 pt-16">
        <Link href="/" className="text-sm text-muted hover:text-ink">
          ← Home
        </Link>
        <h1 className="text-2xl font-bold">Create your account</h1>
        <p className="text-muted">We’ll email you a magic link — no password to remember.</p>
        {sent ? (
          <div className="card text-ok">✅ Check your inbox for the sign-in link.</div>
        ) : (
          <div className="space-y-3">
            <input
              className="input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn-primary w-full" onClick={sendMagicLink} disabled={!email}>
              Email me a link
            </button>
          </div>
        )}
        {error && <p className="text-danger text-sm">{error}</p>}
        <p className="pt-4 text-sm text-muted">
          Just exploring?{" "}
          <Link href="/demo" className="text-accent hover:underline">
            Try the no-signup demo →
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 pt-8">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-muted hover:text-ink">
          ← Home
        </Link>
        <span className="pill">Step {step} of 2</span>
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Tell us about you</h1>
          <p className="text-muted">
            This is the personalisation proof — your plan will be measurably different from your
            neighbour’s from day one.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Division">
              <select className="input" value={division} onChange={(e) => setDivision(e.target.value as Division)}>
                <option value="open">Open</option>
                <option value="pro">Pro</option>
                <option value="doubles">Doubles</option>
                <option value="masters_open">Masters Open</option>
              </select>
            </Field>
            <Field label="Experience level">
              <select className="input" value={level} onChange={(e) => setLevel(e.target.value as Level)}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </Field>
            <Field label="Training days / week">
              <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {[3, 4, 5, 6].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Equipment">
              <select className="input" value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
                <option value="full_gym">Full gym</option>
                <option value="hybrid">Hybrid</option>
                <option value="home_minimal">Home / minimal</option>
              </select>
            </Field>
            <Field label="5K time">
              <div className="flex items-center gap-2">
                <input className="input" type="number" value={fiveKMin} onChange={(e) => setFiveKMin(Number(e.target.value))} />
                <span className="text-muted">min</span>
                <input className="input" type="number" value={fiveKSec} onChange={(e) => setFiveKSec(Number(e.target.value))} />
                <span className="text-muted">sec</span>
              </div>
            </Field>
          </div>
          <button className="btn-primary" onClick={() => setStep(2)}>
            Next →
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">When’s your race?</h1>
          <p className="text-muted">The whole plan is built backward from this date. Taper is never negotiable.</p>
          {races.length > 0 && (
            <Field label="Pick your event">
              <select
                className="input"
                value={raceId ?? ""}
                onChange={(e) => {
                  const id = e.target.value || null;
                  setRaceId(id);
                  const race = races.find((r) => r.id === id);
                  if (race) setRaceDate(race.event_date);
                }}
              >
                <option value="">— custom date below —</option>
                {races.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.city ? ` · ${r.city}` : ""} · {new Date(r.event_date).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Race date">
            <input
              className="input"
              type="date"
              value={raceDate}
              onChange={(e) => {
                setRaceDate(e.target.value);
                setRaceId(null); // manual date overrides the event pick
              }}
            />
          </Field>
          {error && <p className="text-danger text-sm">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setStep(1)}>
              ← Back
            </button>
            <button className="btn-primary" onClick={submit} disabled={!raceDate || submitting}>
              {submitting ? "Building your plan…" : "Build my plan →"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
