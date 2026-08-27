"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { readApi } from "@/lib/apiResult";
import { nextMonday, weekStartOf } from "@/lib/planWeek";
import {
  frequencyAdvice,
  goalSecondsForLevel,
  initialAthleteState,
  splitPhases,
  type AthleteProfile,
} from "@/lib/engine";
import { fmtClock, PHASE_COLORS, titleCase } from "@/lib/format";
import { CheckIcon, SpinnerIcon } from "@/components/icons";
import { haptic } from "@/lib/haptics";

type Division = "open" | "pro" | "doubles" | "masters_open";
type Level = "beginner" | "intermediate" | "advanced" | "elite" | "world_class";
type Equipment = "full_gym" | "home_minimal" | "hybrid";

export const dynamic = "force-dynamic";

// Onboarding per the design cheatsheet: guide clearly, show value quickly,
// friendly language, no friction. Chips instead of dropdowns; a live plan
// preview (the engine runs in-browser) is the "show value" moment before
// anyone commits to anything.
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
  // The goal starts where the level suggests and stops following it the moment
  // the athlete picks one — ability proposes, ambition decides.
  const [goalSeconds, setGoalSeconds] = useState(goalSecondsForLevel("intermediate"));
  const [goalTouched, setGoalTouched] = useState(false);
  const [days, setDays] = useState(4);
  const [doubles, setDoubles] = useState(0);
  const [kmPeak, setKmPeak] = useState("");
  const [equipment, setEquipment] = useState<Equipment>("full_gym");
  const [fiveKMin, setFiveKMin] = useState(22);
  const [fiveKSec, setFiveKSec] = useState(30);
  const [raceDate, setRaceDate] = useState("");
  const [startsOn, setStartsOn] = useState(() => nextMonday(new Date().toISOString().slice(0, 10)));
  const [raceId, setRaceId] = useState<string | null>(null);
  const [races, setRaces] = useState<
    { id: string; name: string; city: string | null; event_date: string }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!data.user) {
        setSignedIn(false);
        setReady(true);
        return;
      }
      setSignedIn(true);

      // Signing in on a second device lands here, because this is the only
      // page that sends a sign-in link. Someone who already has a plan came
      // to look at it, not to fill in this form again — and filling it in
      // would abandon the plan they came for. Send them to it instead.
      // ?new=1 is the way back in for a deliberate fresh start.
      if (!new URLSearchParams(window.location.search).has("new")) {
        const { data: profile } = await supabase
          .from("athlete_profiles")
          .select("id")
          .eq("user_id", data.user.id)
          .maybeSingle();
        const { data: plan } = profile
          ? await supabase
              .from("plans")
              .select("id")
              .eq("profile_id", profile.id)
              .in("status", ["active", "paused", "rehab"])
              .limit(1)
              .maybeSingle()
          : { data: null };
        // Stay unready through the redirect: the form must not flash up.
        if (plan && !cancelled) return router.replace("/plan");
      }
      if (!cancelled) setReady(true);
    })();
    // B5: real event calendar (races is public-read); empty table degrades to
    // the free date picker.
    supabase
      .from("races")
      .select("id, name, city, event_date")
      .gte("event_date", new Date().toISOString().slice(0, 10))
      .order("event_date", { ascending: true })
      .limit(60)
      .then(({ data }) => setRaces(data ?? []));

    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

  // Live preview: the same engine that builds the real plan, in the browser.
  const preview = useMemo(() => {
    if (!raceDate) return null;
    const ms = new Date(raceDate).getTime() - new Date(startsOn).getTime();
    if (Number.isNaN(ms) || ms <= 0) return null;
    const weeks = Math.max(4, Math.min(20, Math.ceil(ms / (7 * 86_400_000))));
    const profile: AthleteProfile = {
      id: "preview",
      division,
      experience_level: level,
      goal_race_time_sec: goalSeconds,
      five_k_seconds: fiveKMin * 60 + fiveKSec,
      station_estimates: {},
      training_days_per_week: days,
      doubles_per_week: doubles,
      weekly_km_peak: kmPeak ? Number(kmPeak) : null,
      equipment_access: equipment,
    };
    return {
      weeks,
      split: splitPhases(weeks),
      predicted: initialAthleteState(profile).predicted_race_time_sec,
    };
  }, [raceDate, startsOn, division, level, goalSeconds, days, doubles, kmPeak, equipment, fiveKMin, fiveKSec]);

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
    haptic("confirm");
    try {
      const res = await fetch("/api/plans/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          division,
          experience_level: level,
          goal_race_time_sec: goalSeconds,
          five_k_seconds: fiveKMin * 60 + fiveKSec,
          training_days_per_week: days,
          doubles_per_week: doubles,
          weekly_km_peak: kmPeak ? Number(kmPeak) : null,
          equipment_access: equipment,
          race_date: raceDate,
          starts_on: startsOn,
          race_id: raceId,
        }),
      });
      const result = await readApi(res);
      if (!result.ok) throw new Error(result.message);
      router.push("/plan");
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  if (!ready) {
    return (
      <main className="mx-auto max-w-xl space-y-4 pt-8">
        <div className="skeleton h-8 w-40" />
        <div className="skeleton h-32 w-full" />
        <div className="skeleton h-32 w-full" />
      </main>
    );
  }

  if (!signedIn) {
    return (
      <main className="mx-auto max-w-md space-y-4 pt-16 animate-fade-up">
        <Link href="/" className="text-sm text-ash hover:text-chalk">
          ← Home
        </Link>
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="text-ash">
          We&apos;ll email you a sign-in link — no password to remember, and it creates your
          account if you don&apos;t have one yet.
        </p>
        <p className="text-sm text-ash">
          Open the link <b className="text-bone">on this device</b> — it only works in the browser
          that asked for it. A link requested on your computer will not sign you in on your phone.
        </p>
        {sent ? (
          <div className="card flex items-center gap-3 text-go animate-pop-in">
            <CheckIcon size={20} />
            <div>
              <div className="font-semibold">Link is on its way!</div>
              <div className="text-sm text-ash">Check your inbox on this device and tap it to continue.</div>
            </div>
          </div>
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
        {error && <p className="text-stop text-sm">{error}</p>}
        <p className="pt-4 text-sm text-ash">
          Just exploring?{" "}
          <Link href="/demo" className="text-flame hover:underline">
            Try the no-signup demo →
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 pt-8">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-ash hover:text-chalk">
          ← Home
        </Link>
        <span className="pill">{step === 1 ? "Step 1 of 2 · About you" : "Step 2 of 2 · Your race"}</span>
      </div>
      {/* progress that moves — a small "something is happening" moment */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-rack">
        <div
          className="h-full rounded-full bg-flame transition-all duration-500"
          style={{ width: step === 1 ? "50%" : "100%" }}
        />
      </div>

      {step === 1 && (
        <div className="space-y-5 animate-fade-up" key="step1">
          <div>
            <h1 className="text-2xl font-bold">Tell us about you</h1>
            <p className="text-ash">
              Four quick taps and one honest 5K time — that&apos;s all the engine needs to make
              your plan measurably yours.
            </p>
          </div>

          <ChipGroup
            label="Your division"
            options={[
              ["open", "Open"],
              ["pro", "Pro"],
              ["doubles", "Doubles"],
              ["masters_open", "Masters"],
            ]}
            value={division}
            onChange={(v) => setDivision(v as Division)}
          />
          <ChipGroup
            label="How seasoned are you? (what you can carry today)"
            options={[
              ["beginner", "New"],
              ["intermediate", "Trained"],
              ["advanced", "Competitive"],
              ["elite", "Elite"],
              ["world_class", "World class"],
            ]}
            value={level}
            onChange={(v) => {
              setLevel(v as Level);
              if (!goalTouched) setGoalSeconds(goalSecondsForLevel(v as Level));
            }}
          />
          <ChipGroup
            label="Goal finish time (what you are chasing)"
            options={[
              [String(100 * 60), "1:40"],
              [String(90 * 60), "1:30"],
              [String(80 * 60), "1:20"],
              [String(70 * 60), "1:10"],
              [String(60 * 60), "1:00"],
            ]}
            value={String(goalSeconds)}
            onChange={(v) => {
              setGoalSeconds(Number(v));
              setGoalTouched(true);
            }}
          />
          <ChipGroup
            label="Training days per week"
            options={[
              ["3", "3 days"],
              ["4", "4 days"],
              ["5", "5 days"],
              ["6", "6 days"],
            ]}
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
          />
          <ChipGroup
            label="Double days (a second, lighter session)"
            options={[
              ["0", "None"],
              ["1", "1 / week"],
              ["2", "2 / week"],
              ["3", "3 / week"],
            ]}
            value={String(doubles)}
            onChange={(v) => setDoubles(Number(v))}
          />
          {(() => {
            // Level and frequency belong together — the app advises, it never
            // blocks: the athlete knows their own history.
            const advice = frequencyAdvice(level, days, doubles);
            return (
              <p className={`text-xs ${advice.verdict === "ok" ? "text-ash" : "text-amber"}`}>
                {advice.note}
              </p>
            );
          })()}
          <div>
            <label className="label">Peak running volume (km/week, optional)</label>
            <input
              className="input"
              type="number"
              min="15"
              max="150"
              value={kmPeak}
              placeholder="leave empty and the engine decides"
              onChange={(e) => setKmPeak(e.target.value)}
            />
            <p className="mt-1 text-xs text-ash">
              The hardest week of the cycle. Every other week is derived from it — you can change it
              any time on your plan.
            </p>
          </div>
          <ChipGroup
            label="Where do you train?"
            options={[
              ["full_gym", "Full gym"],
              ["hybrid", "Mix of both"],
              ["home_minimal", "Home / minimal"],
            ]}
            value={equipment}
            onChange={(v) => setEquipment(v as Equipment)}
          />

          <div>
            <label className="label">Your 5K time (best guess is totally fine)</label>
            <div className="flex items-center gap-2">
              <input
                className="input"
                type="number"
                value={fiveKMin}
                onChange={(e) => setFiveKMin(Number(e.target.value))}
              />
              <span className="text-ash">min</span>
              <input
                className="input"
                type="number"
                value={fiveKSec}
                onChange={(e) => setFiveKSec(Number(e.target.value))}
              />
              <span className="text-ash">sec</span>
            </div>
          </div>

          <button className="btn-primary" onClick={() => setStep(2)}>
            Next: pick your race →
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5 animate-fade-up" key="step2">
          <div>
            <h1 className="text-2xl font-bold">When&apos;s your race?</h1>
            <p className="text-ash">
              Everything is planned backward from this date — and the taper is never negotiable.
            </p>
          </div>

          {races.length > 0 && (
            <div>
              <label className="label">Pick your event</label>
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
                <option value="">— or set a custom date below —</option>
                {races.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.city ? ` · ${r.city}` : ""} · {new Date(r.event_date).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Race date</label>
              <input
                className="input"
                type="date"
                value={raceDate}
                onChange={(e) => {
                  setRaceDate(e.target.value);
                  setRaceId(null); // manual date overrides the event pick
                }}
              />
            </div>
            <div>
              <label className="label">Start the plan on</label>
              <input
                className="input"
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(weekStartOf(e.target.value, 1))}
              />
              {/* Week 1 runs Monday to Sunday. Starting mid-week would give it
                  two days, so the date snaps to the Monday of whatever is
                  picked, and defaults to the coming one. */}
              <p className="mt-1 text-micro text-ash">
                Week 1 begins on this Monday — the coming one unless you pick another.
              </p>
            </div>
          </div>

          {/* Show value quickly: the plan skeleton, generated live. */}
          {preview && (
            <div className="card animate-pop-in">
              <div className="mb-2 text-sm font-semibold">
                Here&apos;s the shape of your {preview.weeks}-week plan
              </div>
              <div className="mb-2 flex h-3 gap-0.5 overflow-hidden rounded-full">
                {preview.split.map((p) => (
                  <div
                    key={p.phase_type}
                    className="transition-all duration-500"
                    style={{
                      background: PHASE_COLORS[p.phase_type],
                      flexGrow: p.weeks,
                    }}
                    title={`${titleCase(p.phase_type)}: ${p.weeks} weeks`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-ash">
                {preview.split.map((p) => (
                  <span key={p.phase_type} className="flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: PHASE_COLORS[p.phase_type] }}
                    />
                    {titleCase(p.phase_type)} · {p.weeks}w
                  </span>
                ))}
              </div>
              {preview.predicted != null && (
                <p className="mt-3 text-sm text-ash">
                  First finish-time estimate:{" "}
                  <b className="text-chalk">{fmtClock(preview.predicted)}</b> — it sharpens with
                  every session you log.
                </p>
              )}
            </div>
          )}

          {error && <p className="text-stop text-sm">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setStep(1)} disabled={submitting}>
              ← Back
            </button>
            <button className="btn-primary" onClick={submit} disabled={!raceDate || submitting}>
              {submitting ? (
                <>
                  <SpinnerIcon size={16} /> Building your plan…
                </>
              ) : (
                "Looks right — build my plan"
              )}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function ChipGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            className={`chip ${value === v ? "chip-active" : ""}`}
            onClick={() => {
              haptic("tap");
              onChange(v);
            }}
          >
            {value === v && <CheckIcon size={14} className="mr-1.5" />}
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
