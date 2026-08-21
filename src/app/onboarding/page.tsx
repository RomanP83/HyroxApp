"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { initialAthleteState, splitPhases, type AthleteProfile } from "@/lib/engine";
import { fmtClock, PHASE_COLORS, titleCase } from "@/lib/format";
import { CheckIcon, SpinnerIcon } from "@/components/icons";
import { haptic } from "@/lib/haptics";

type Division = "open" | "pro" | "doubles" | "masters_open";
type Level = "beginner" | "intermediate" | "advanced";
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
    // Surface a failed magic-link exchange instead of silently showing the
    // sign-in form again.
    const authError = new URLSearchParams(window.location.search).get("auth_error");
    if (authError) {
      setError(
        authError === "missing_code"
          ? "That sign-in link looks incomplete. Request a fresh one below."
          : `Sign-in link failed: ${authError}. Links expire — request a new one below.`,
      );
    }

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

  // Live preview: the same engine that builds the real plan, in the browser.
  const preview = useMemo(() => {
    if (!raceDate) return null;
    const ms = new Date(raceDate).getTime() - Date.now();
    if (Number.isNaN(ms) || ms <= 0) return null;
    const weeks = Math.max(4, Math.min(20, Math.ceil(ms / (7 * 86_400_000))));
    const profile: AthleteProfile = {
      id: "preview",
      division,
      experience_level: level,
      five_k_seconds: fiveKMin * 60 + fiveKSec,
      station_estimates: {},
      training_days_per_week: days,
      equipment_access: equipment,
    };
    return {
      weeks,
      split: splitPhases(weeks),
      predicted: initialAthleteState(profile).predicted_race_time_sec,
    };
  }, [raceDate, division, level, days, equipment, fiveKMin, fiveKSec]);

  async function sendMagicLink() {
    setError(null);
    // Land on the server route that trades the code for a session cookie.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
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
        <Link href="/" className="text-sm text-muted hover:text-ink">
          ← Home
        </Link>
        <h1 className="text-2xl font-bold">Create your account</h1>
        <p className="text-muted">
          We&apos;ll email you a sign-in link — no password to remember, nothing to forget.
        </p>
        {sent ? (
          <div className="card flex items-center gap-3 text-ok animate-pop-in">
            <CheckIcon size={20} />
            <div>
              <div className="font-semibold">Link is on its way!</div>
              <div className="text-sm text-muted">Check your inbox and tap it to continue.</div>
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
        <span className="pill">{step === 1 ? "Step 1 of 2 · About you" : "Step 2 of 2 · Your race"}</span>
      </div>
      {/* progress that moves — a small "something is happening" moment */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-surface2">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: step === 1 ? "50%" : "100%" }}
        />
      </div>

      {step === 1 && (
        <div className="space-y-5 animate-fade-up" key="step1">
          <div>
            <h1 className="text-2xl font-bold">Tell us about you</h1>
            <p className="text-muted">
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
            label="How seasoned are you?"
            options={[
              ["beginner", "New to this"],
              ["intermediate", "Trained before"],
              ["advanced", "Competitive"],
            ]}
            value={level}
            onChange={(v) => setLevel(v as Level)}
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
              <span className="text-muted">min</span>
              <input
                className="input"
                type="number"
                value={fiveKSec}
                onChange={(e) => setFiveKSec(Number(e.target.value))}
              />
              <span className="text-muted">sec</span>
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
            <p className="text-muted">
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
              <div className="flex flex-wrap gap-3 text-xs text-muted">
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
                <p className="mt-3 text-sm text-muted">
                  First finish-time estimate:{" "}
                  <b className="text-ink">{fmtClock(preview.predicted)}</b> — it sharpens with
                  every session you log.
                </p>
              )}
            </div>
          )}

          {error && <p className="text-danger text-sm">{error}</p>}
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
