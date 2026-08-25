"use client";

// ============================================================================
// Setup & tools, as a page of its own.
//
// These controls used to live in a disclosure in the week view's sidebar, next
// to the thing you actually open /plan for. Two of them rebuild the whole plan
// — they are not a footnote to today's session.
//
// Grouped by the decision being made, not by five equally sized boxes: what
// your training week looks like (both controls rebuild the remaining weeks),
// what the app is connected to, and what happens when something breaks.
// ============================================================================
import { useState } from "react";
import { readApi } from "@/lib/apiResult";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  assessWeekPreferences,
  frequencyAdvice,
  type ExperienceLevel,
  type VolumeAssessment,
} from "@/lib/engine";
import { AppHeader } from "./AppHeader";
import { haptic } from "@/lib/haptics";
import {
  CalendarIcon,
  CheckIcon,
  ExitIcon,
  MedicalIcon,
  RunIcon,
  SendIcon,
  SpinnerIcon,
} from "./icons";

const DAY_INITIALS = ["", "M", "T", "W", "T", "F", "S", "S"];
const DAY_FULL = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export interface SettingsProps {
  hasPlan: boolean;
  planStatus: string;
  experienceLevel: ExperienceLevel;
  weekShape: {
    training_days_per_week: number;
    doubles_per_week: number;
    long_run_day: number | null;
    strength_days: number[];
    rest_days: number[];
    double_days: number[];
  };
  volume: {
    weekly_km_peak: number | null;
    runs_per_week: number | null;
    assessment: VolumeAssessment | null;
  };
  connections: {
    strava: { connected: boolean; url: string | null };
    garmin: { connected: boolean; url: string | null };
    telegram: { connected: boolean; url: string | null };
  };
}

export function SettingsClient(props: SettingsProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    haptic("confirm");
    await supabaseBrowser().auth.signOut();
    // refresh() as well as push(): the session lives in a cookie the server
    // components read, so the router cache has to be dropped or the next
    // navigation still renders as the signed-in athlete.
    router.push("/");
    router.refresh();
  }

  const [toast, setToast] = useState<string | null>(null);
  const [savingShape, setSavingShape] = useState(false);
  const [savingVolume, setSavingVolume] = useState(false);
  const [trainingDays, setTrainingDays] = useState(props.weekShape.training_days_per_week);
  const [doubles, setDoubles] = useState(props.weekShape.doubles_per_week);
  const [longRunDay, setLongRunDay] = useState<number | null>(props.weekShape.long_run_day);
  const [strengthDays, setStrengthDays] = useState<number[]>(props.weekShape.strength_days);
  const [restDays, setRestDays] = useState<number[]>(props.weekShape.rest_days);
  const [doubleDays, setDoubleDays] = useState<number[]>(props.weekShape.double_days);
  const [kmPeak, setKmPeak] = useState(props.volume.weekly_km_peak?.toString() ?? "");
  const [runsPerWeek, setRunsPerWeek] = useState(props.volume.runs_per_week?.toString() ?? "");

  // Both of these are pure engine functions, so the page can answer live
  // instead of only after a save: change a day and the cost changes with it.
  const maxRestDays = Math.max(0, 7 - trainingDays);
  // Turning doubles down strands the pins above the new count. Trim them here
  // rather than letting the athlete run into a rejected save.
  const pinnedDoubles = doubleDays.slice(0, doubles);
  const maxRuns = Math.max(2, trainingDays - 1);
  const frequency = frequencyAdvice(props.experienceLevel, trainingDays, doubles);
  const warnings = assessWeekPreferences(
    { longRunDay, strengthDays, restDays, doubleDays: pinnedDoubles },
    { trainingDays, runsPerWeek: props.volume.runs_per_week, doublesPerWeek: doubles },
  );

  async function saveWeekShape() {
    setSavingShape(true);
    try {
      const res = await fetch("/api/plans/week-shape", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          training_days_per_week: trainingDays,
          doubles_per_week: doubles,
          preferred_long_run_day: longRunDay,
          preferred_strength_days: strengthDays,
          preferred_rest_days: restDays,
          preferred_double_days: pinnedDoubles,
        }),
      });
      const out = await readApi(res);
      if (!out.ok) throw new Error(out.message);
      const data = out.data as Record<string, any>;
      haptic("confirm");
      setToast(
        data.warnings?.length
          ? `Saved. ${data.warnings[0]}`
          : "Saved — the remaining weeks were rebuilt around your fixed days.",
      );
      router.refresh();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Could not save your week shape.");
    } finally {
      setSavingShape(false);
    }
  }

  async function saveVolume() {
    setSavingVolume(true);
    try {
      const res = await fetch("/api/plans/volume", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          weekly_km_peak: kmPeak.trim() === "" ? null : Number(kmPeak),
          runs_per_week: runsPerWeek.trim() === "" ? null : Number(runsPerWeek),
        }),
      });
      const out = await readApi(res);
      if (!out.ok) throw new Error(out.message);
      const data = out.data as Record<string, any>;
      haptic("confirm");
      setToast("Saved — the remaining weeks were rebuilt around the new volume.");
      router.refresh();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Could not save the volume.");
    } finally {
      setSavingVolume(false);
    }
  }

  async function injury(action: "activate" | "recover") {
    const res = await fetch("/api/plans/injury", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const out = await readApi(res);
    setToast(
      out.ok
        ? action === "activate"
          ? "Rehab mode on — low-impact until you reactivate."
          : "Plan rebuilt from today. Welcome back!"
        : (out.message || "That did not work."),
    );
    router.refresh();
  }

  return (
    <main className="space-y-8">
      <AppHeader />

      <div>
        <h1 className="text-h1 font-bold tracking-tight">Setup &amp; tools</h1>
        <p className="mt-2 max-w-[62ch] text-lead leading-relaxed text-bone">
          What your training week looks like, what the app is connected to, and what happens when
          something breaks.
        </p>
      </div>

      {/* ── The two controls that rebuild the plan ────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-micro font-semibold uppercase tracking-widest text-ash">
          Your training week
        </h2>

        <div className="card-focal space-y-4">
          <div className="flex items-center gap-2">
            <CalendarIcon size={16} className="text-amber" />
            <span className="text-lead font-semibold">The shape of your week</span>
          </div>
          <p className="max-w-[62ch] text-meta leading-relaxed text-ash">
            Fix the days that are fixed in real life. Everything else is arranged around them —
            these days win even against the recovery rules, and anything that costs is written
            below rather than silently fixed.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <ChipRow
              label="Training days"
              options={[3, 4, 5, 6]}
              value={trainingDays}
              onChange={(v) => {
                setTrainingDays(v);
                // Fewer days can strand pins that used to fit; trim rather than
                // let the athlete discover it at the save button.
                setRestDays((prev) => prev.slice(0, Math.max(0, 7 - v)));
                setStrengthDays((prev) => prev.slice(0, v));
              }}
              format={(v) => `${v}`}
            />
            <ChipRow
              label="Double days"
              options={[0, 1, 2, 3]}
              value={doubles}
              onChange={setDoubles}
              format={(v) => (v === 0 ? "None" : `${v}`)}
            />
          </div>

          <p
            className={`max-w-[62ch] text-meta leading-relaxed ${
              frequency.verdict === "ok" ? "text-ash" : "text-amber"
            }`}
          >
            {frequency.note}
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DayPicker
              label="Long run"
              selected={longRunDay == null ? [] : [longRunDay]}
              onToggle={(d) => setLongRunDay(longRunDay === d ? null : d)}
              accent="go"
            />
            <DayPicker
              label="Strength"
              selected={strengthDays}
              onToggle={(d) =>
                setStrengthDays((prev) =>
                  prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
                )
              }
              accent="amber"
            />
            <DayPicker
              label={`Rest (max ${maxRestDays})`}
              selected={restDays}
              onToggle={(d) =>
                setRestDays((prev) =>
                  prev.includes(d)
                    ? prev.filter((x) => x !== d)
                    : prev.length >= maxRestDays
                      ? prev
                      : [...prev, d].sort(),
                )
              }
              accent="smoke"
            />
            {/* Only when there are doubles to place. A picker capped at zero
                is a control that does nothing, which is worse than absent. */}
            {doubles > 0 && (
              <DayPicker
                // Capped by the doubles setting, not by the training days: you
                // cannot pin more second sessions than you asked for.
                label={`Double days (max ${doubles})`}
                selected={pinnedDoubles}
                onToggle={(d) =>
                  setDoubleDays((prev) =>
                    prev.includes(d)
                      ? prev.filter((x) => x !== d)
                      : prev.length >= doubles
                        ? prev
                        : [...prev, d].sort(),
                  )
                }
                accent="flame"
              />
            )}
          </div>

          {warnings.length > 0 && (
            <ul className="space-y-1.5">
              {warnings.map((w) => (
                <li
                  key={w}
                  className="border-l-2 border-amber/50 pl-3 text-meta leading-relaxed text-bone"
                >
                  {w}
                </li>
              ))}
            </ul>
          )}

          <SaveRow
            busy={savingShape}
            onSave={() => void saveWeekShape()}
            hasPlan={props.hasPlan}
            icon={<CalendarIcon size={16} />}
            primary
          />
        </div>

        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <RunIcon size={16} className="text-amber" />
            <span className="text-lead font-semibold">Running volume</span>
          </div>
          <p className="max-w-[62ch] text-meta leading-relaxed text-ash">
            Set the <b className="text-bone">peak week</b> of the cycle — every other week is
            derived from it. An average would hide the hardest week, which is the one that decides
            whether the build holds.
          </p>

          <div className="grid max-w-md gap-3 sm:grid-cols-2">
            <label>
              <span className="label">Peak km / week</span>
              <input
                className="input"
                type="number"
                min="15"
                max="150"
                step="1"
                value={kmPeak}
                placeholder="auto"
                onChange={(e) => setKmPeak(e.target.value)}
              />
            </label>
            <label>
              <span className="label">Runs / week</span>
              <input
                className="input"
                type="number"
                min="2"
                max={maxRuns}
                step="1"
                value={runsPerWeek}
                placeholder="auto"
                onChange={(e) => setRunsPerWeek(e.target.value)}
              />
            </label>
          </div>

          {props.volume.assessment && (
            <p
              className={`max-w-[62ch] text-meta leading-relaxed ${
                props.volume.assessment.verdict === "steep" ? "text-amber" : "text-ash"
              }`}
            >
              {props.volume.assessment.note}
            </p>
          )}

          <SaveRow
            busy={savingVolume}
            onSave={() => void saveVolume()}
            hasPlan={props.hasPlan}
            icon={<RunIcon size={16} />}
          />
          <p className="text-micro leading-relaxed text-ash">
            Up to {maxRuns} runs with {trainingDays} training days — one session a week stays
            strength or station work.
          </p>
        </div>
      </section>

      {/* ── Connections: a list of the same shape, so a list it is ─────────── */}
      <section className="space-y-3">
        <h2 className="text-micro font-semibold uppercase tracking-widest text-ash">Connections</h2>
        <div className="space-y-1.5">
          <Connection
            icon={<RunIcon size={16} />}
            name="Strava"
            what="Runs log themselves, and the pace you actually ran calibrates your zones."
            connected={props.connections.strava.connected}
            url={props.connections.strava.url}
          />
          <Connection
            icon={<RunIcon size={16} />}
            name="Garmin"
            what="Same as Strava, straight off the watch."
            connected={props.connections.garmin.connected}
            url={props.connections.garmin.url}
          />
          <Connection
            icon={<SendIcon size={16} />}
            name="Telegram"
            what="An evening check-in with the same four buttons — log without opening the app."
            connected={props.connections.telegram.connected}
            url={props.connections.telegram.url}
            external
          />
        </div>
      </section>

      {/* ── The one that is not a setting ─────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-micro font-semibold uppercase tracking-widest text-ash">
          When something breaks
        </h2>
        {props.planStatus === "rehab" ? (
          <div className="card flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-[52ch] text-meta leading-relaxed text-bone">
              <b>Rehab mode is on.</b> Mobility and low-impact work only — no plan stop, no lost
              progress. The plan rebuilds from the day you come back.
            </p>
            <button className="btn-primary" onClick={() => void injury("recover")}>
              <CheckIcon size={16} />
              I&apos;m back — rebuild my plan
            </button>
          </div>
        ) : (
          <div className="card flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-[52ch] text-meta leading-relaxed text-ash">
              Injured? Switch to low-impact rehab mode. The plan pauses gracefully and rebuilds from
              the day you are back — nothing is lost.
            </p>
            <button className="btn-ghost" onClick={() => void injury("activate")}>
              <MedicalIcon size={16} />
              Flag an injury
            </button>
          </div>
        )}
      </section>

      {/* Signing out is not a breakage, and it is not global: it ends the
          session in this browser only. Its own heading says so before the
          copy has to. */}
      <section className="space-y-3">
        <h2 className="text-micro font-semibold uppercase tracking-widest text-ash">This device</h2>
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-[52ch] text-meta leading-relaxed text-ash">
            Signing out ends the session in this browser. Your plan and everything you have logged
            stay where they are — sign back in with a link and it is all there, and your other
            devices stay signed in.
          </p>
          <button className="btn-ghost" onClick={() => void signOut()} disabled={signingOut}>
            {signingOut ? <SpinnerIcon size={16} /> : <ExitIcon size={16} />}
            Sign out
          </button>
        </div>
      </section>

      {toast && (
        <div
          className="animate-pop-in fixed bottom-4 left-1/2 flex max-w-md -translate-x-1/2 items-center gap-2 rounded-control border border-edge-strong bg-rack px-4 py-2.5 text-base"
          onClick={() => setToast(null)}
        >
          <CheckIcon size={14} className="shrink-0 text-go" />
          {toast}
        </div>
      )}
    </main>
  );
}

/** Both plan-shaping controls rebuild every remaining week, so both say so. */
function SaveRow({
  busy,
  onSave,
  hasPlan,
  icon,
  primary,
}: {
  busy: boolean;
  onSave: () => void;
  hasPlan: boolean;
  icon: React.ReactNode;
  /** Only the focal card gets the filled button — one accent per page. */
  primary?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-edge pt-4">
      <button className={primary ? "btn-primary" : "btn-ghost"} disabled={busy} onClick={onSave}>
        {busy ? <SpinnerIcon size={16} /> : icon}
        {hasPlan ? "Save and rebuild the remaining weeks" : "Save"}
      </button>
      <span className="text-micro text-ash">
        {hasPlan ? "Past weeks stay as they were logged." : "It applies to your next plan."}
      </span>
    </div>
  );
}

function Connection({
  icon,
  name,
  what,
  connected,
  url,
  external,
}: {
  icon: React.ReactNode;
  name: string;
  what: string;
  connected: boolean;
  url: string | null;
  external?: boolean;
}) {
  // Nothing to offer and nothing connected means the integration is not
  // configured on this deployment — saying so beats an inert button.
  const state = connected ? "connected" : url ? "available" : "unconfigured";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-edge bg-lane/60 p-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className={connected ? "mt-0.5 text-go" : "mt-0.5 text-ash"}>{icon}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold">{name}</span>
            {connected && <span className="pill text-go">connected</span>}
          </div>
          <p className="mt-0.5 max-w-[52ch] text-meta leading-relaxed text-ash">{what}</p>
        </div>
      </div>
      {state === "available" && (
        <a
          href={url!}
          {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
          className="btn-ghost"
        >
          Connect
        </a>
      )}
      {state === "unconfigured" && <span className="text-micro text-smoke">not configured</span>}
    </div>
  );
}

function ChipRow({
  label,
  options,
  value,
  onChange,
  format,
}: {
  label: string;
  options: number[];
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div>
      <div className="mb-1 text-micro font-semibold uppercase tracking-wider text-ash">{label}</div>
      <div className="flex gap-1">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={value === o}
            aria-label={`${label}: ${format(o)}`}
            onClick={() => onChange(o)}
            className={`h-9 flex-1 rounded-control border text-meta font-semibold transition-colors duration-150 ease-out ${
              value === o
                ? "border-flame/70 bg-flame/10 text-chalk"
                : "border-edge bg-well text-ash hover:border-edge-strong hover:text-bone"
            }`}
          >
            {format(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Seven toggles, one per weekday. Monday first, like the plan's own grid. */
function DayPicker({
  label,
  selected,
  onToggle,
  accent,
}: {
  label: string;
  selected: number[];
  onToggle: (day: number) => void;
  accent: "go" | "amber" | "smoke" | "flame";
}) {
  const on = {
    go: "border-go/70 bg-go/15 text-chalk",
    amber: "border-amber/70 bg-amber/15 text-chalk",
    smoke: "border-edge-strong bg-rack text-bone",
    flame: "border-flame/70 bg-flame/15 text-chalk",
  }[accent];
  return (
    <div>
      <div className="mb-1 text-micro font-semibold uppercase tracking-wider text-ash">{label}</div>
      <div className="grid grid-cols-7 gap-1">
        {[1, 2, 3, 4, 5, 6, 7].map((d) => {
          const active = selected.includes(d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={active}
              aria-label={`${label}: ${DAY_FULL[d]}`}
              onClick={() => onToggle(d)}
              className={`flex h-9 items-center justify-center rounded-control border text-meta font-semibold transition-colors duration-150 ease-out ${
                active ? on : "border-edge bg-well text-ash hover:border-edge-strong hover:text-bone"
              }`}
            >
              {DAY_INITIALS[d]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
