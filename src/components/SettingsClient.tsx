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
import { weeksFromStartToRace, weekStartOf } from "@/lib/planWeek";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  assessWeekPreferences,
  frequencyAdvice,
  goalSecondsForLevel,
  type Division,
  type ExperienceLevel,
  type VolumeAssessment,
} from "@/lib/engine";
import { fmtClock, parseClock } from "@/lib/format";
import { AppHeader } from "./AppHeader";
import { haptic } from "@/lib/haptics";
import {
  CalendarIcon,
  CheckIcon,
  DownloadIcon,
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
  division: Division;
  /** The Monday week 1 begins on, and the race it runs to. */
  planStart: { starts_on: string; race_date: string; total_weeks: number } | null;
  planStatus: string;
  experienceLevel: ExperienceLevel;
  /** The finish time being trained for; null until the athlete has set one. */
  goalRaceTimeSec: number | null;
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
    // The offline cache holds rendered pages with this athlete's sessions in
    // them. Signing out has to take them off the device with it, or "sign out"
    // means "sign out, except for everything already on screen".
    navigator.serviceWorker?.controller?.postMessage("clear-cache");
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
  const [level, setLevel] = useState<ExperienceLevel>(props.experienceLevel);
  const [division, setDivision] = useState<Division>(props.division);
  const [goal, setGoal] = useState(
    fmtClock(props.goalRaceTimeSec ?? goalSecondsForLevel(props.experienceLevel)),
  );
  const goalSeconds = parseClock(goal);
  const [savingProfile, setSavingProfile] = useState(false);

  async function saveProfile() {
    setSavingProfile(true);
    haptic("confirm");
    const res = await fetch("/api/plans/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        experience_level: level,
        division,
        goal_race_time_sec: goalSeconds,
      }),
    });
    const result = await readApi<{ rebased?: boolean }>(res);
    setSavingProfile(false);
    setToast(
      result.ok
        ? result.data?.rebased
          ? "Saved — the remaining weeks were rebuilt around it."
          : "Saved. Your goal is what the plan is measured against, so no week changed."
        : result.message,
    );
    if (result.ok) router.refresh();
  }

  const [startsOn, setStartsOn] = useState(props.planStart?.starts_on ?? "");
  const [askRebuild, setAskRebuild] = useState(false);
  const [savingStart, setSavingStart] = useState(false);
  const [startWarnings, setStartWarnings] = useState<string[]>([]);
  const runway = props.planStart
    ? weeksFromStartToRace(startsOn || props.planStart.starts_on, props.planStart.race_date)
    : 0;

  async function moveStart(rebuild: boolean) {
    setSavingStart(true);
    haptic("confirm");
    const res = await fetch("/api/plans/start-date", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ starts_on: startsOn, rebuild }),
    });
    const result = await readApi<{ warnings?: string[] }>(res);
    setSavingStart(false);
    setAskRebuild(false);
    if (!result.ok) {
      setToast(result.message);
      return;
    }
    setStartWarnings(result.data.warnings ?? []);
    setToast(
      rebuild
        ? "Plan rebuilt from the new start date."
        : "Start date moved — the weeks kept their content.",
    );
    router.refresh();
  }

  // Both of these are pure engine functions, so the page can answer live
  // instead of only after a save: change a day and the cost changes with it.
  const maxRestDays = Math.max(0, 7 - trainingDays);
  // Turning doubles down strands the pins above the new count. Trim them here
  // rather than letting the athlete run into a rejected save.
  const pinnedDoubles = doubleDays.slice(0, doubles);
  const maxRuns = Math.max(2, trainingDays - 1);
  const frequency = frequencyAdvice(level, trainingDays, doubles);
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

        <div className="card space-y-3">
          <div>
            <h3 className="flex items-center gap-2 text-lead font-semibold text-chalk">
              <RunIcon size={18} className="text-flame" />
              What you are training for
            </h3>
            <p className="mt-1 max-w-[62ch] text-meta leading-relaxed text-ash">
              Two different things, kept apart on purpose. Your <b className="text-bone">level</b>{" "}
              is what you can carry today: it sets the split between running, strength, station work
              and compromised running, and every session catalogue picks by it. Your{" "}
              <b className="text-bone">goal time</b> is what you are chasing. Running 1:30 today and
              wanting sub 70 is a training plan, not a contradiction.
            </p>
          </div>

          <ChoiceRow
            label="Level — what you can carry now"
            options={[
              ["beginner", "New"],
              ["intermediate", "Trained"],
              ["advanced", "Competitive"],
              ["elite", "Elite"],
              ["world_class", "World class"],
            ]}
            value={level}
            onChange={setLevel}
          />

          <label className="block">
            <span className="mb-1 block text-micro font-semibold uppercase tracking-wider text-ash">
              Goal time — what you are chasing
            </span>
            <input
              className="input w-40 font-mono tabular-nums"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="1:20:00"
              aria-label="Goal finish time"
            />
            <span className="mt-1 block text-meta text-ash">
              {goalSeconds
                ? "This is what /plan and the pacing sheet measure you against."
                : "As h:mm:ss — for example 1:20:00."}
            </span>
          </label>
          <ChoiceRow
            label="Division"
            options={[
              ["open", "Open"],
              ["pro", "Pro"],
              ["doubles", "Doubles"],
              ["masters_open", "Masters"],
              ["masters_pro", "Masters Pro"],
            ]}
            value={division}
            onChange={setDivision}
          />

          <p className="max-w-[62ch] text-meta leading-relaxed text-ash">
            Changing the level or division rebuilds the remaining weeks; changing only the goal
            does not.{" "}
            <b className="text-bone">Nothing you have earned is reset</b> — your pace zones and
            station tiers come from what you have logged, not from the level, and they carry over
            untouched.
          </p>

          <SaveRow
            onSave={() => void saveProfile()}
            busy={savingProfile}
            hasPlan={props.hasPlan}
            icon={<RunIcon size={16} />}
          />
        </div>

        {props.planStart && (
          <div className="card space-y-3">
            <div>
              <h3 className="flex items-center gap-2 text-lead font-semibold text-chalk">
                <CalendarIcon size={18} className="text-flame" />
                When the plan starts
              </h3>
              <p className="mt-1 max-w-[62ch] text-meta leading-relaxed text-ash">
                Week 1 begins on this Monday, and everything — which week is
                &ldquo;now&rdquo;, the check-in, the weekly review — is counted from it. Build a
                plan on a Saturday and week 1 would otherwise be two days long.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-1 block text-micro font-semibold uppercase tracking-wider text-ash">
                  Week 1 Monday
                </span>
                <input
                  className="input"
                  type="date"
                  value={startsOn}
                  onChange={(e) => {
                    // Week 1 runs Monday to Sunday, so the date snaps.
                    setStartsOn(e.target.value ? weekStartOf(e.target.value, 1) : "");
                    setAskRebuild(e.target.value !== props.planStart!.starts_on);
                    setStartWarnings([]);
                  }}
                />
              </label>
              <p className="text-meta text-ash">
                {/* The runway the chosen date leaves, recomputed live — that is
                    the number the rebuild decision turns on, and it is not the
                    plan's stored length once the date moves. */}
                <span className={runway === props.planStart.total_weeks ? "" : "text-amber"}>
                  {runway} week{runway === 1 ? "" : "s"}
                </span>{" "}
                to {props.planStart.race_date}
                {runway === props.planStart.total_weeks
                  ? "."
                  : `, and the plan is ${props.planStart.total_weeks} weeks long.`}
              </p>
            </div>

            {askRebuild && (
              // Moving the start with a fixed race date changes how much
              // runway is left, so the two answers are not the same change.
              // Both consequences stand next to their button.
              <div className="rounded-control border border-edge-strong bg-well p-3">
                <p className="text-meta font-semibold text-chalk">
                  You moved the start. Rebuild the plan for the new runway?
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="btn-primary"
                    onClick={() => void moveStart(true)}
                    disabled={savingStart}
                  >
                    {savingStart ? <SpinnerIcon size={16} /> : <CalendarIcon size={16} />}
                    Rebuild for the new runway
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => void moveStart(false)}
                    disabled={savingStart}
                  >
                    Only move the calendar
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => {
                      setStartsOn(props.planStart!.starts_on);
                      setAskRebuild(false);
                    }}
                    disabled={savingStart}
                  >
                    Cancel
                  </button>
                </div>
                <p className="mt-2 max-w-[62ch] text-micro leading-relaxed text-ash">
                  <b className="text-bone">Rebuild</b> recalculates the phases for the weeks that
                  are actually left — past weeks stay as they were logged.{" "}
                  <b className="text-bone">Only move</b> keeps every week exactly as it is and
                  slides them along the calendar, which can leave the plan ending after race day.
                </p>
              </div>
            )}

            {startWarnings.map((w) => (
              <p key={w} className="text-meta leading-relaxed text-amber">
                {w}
              </p>
            ))}
          </div>
        )}

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

      {/* One athlete, one Supabase project — which makes that project the single
          point of failure for years of training. The export is the backup, so
          it sits in Setup as a plain link rather than behind an API call: a
          download is what the browser is already good at. */}
      <section className="space-y-3">
        <h2 className="text-micro font-semibold uppercase tracking-widest text-ash">Your data</h2>
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-[52ch] text-meta leading-relaxed text-ash">
            Download everything: profile, plans, every logged session, benchmarks, race results and
            your strength programmes, as one JSON file. The sessions carry their own blocks, so the
            file reads on its own. <b className="text-bone">This is your backup</b> — nothing else
            holds a second copy.
          </p>
          <a className="btn-ghost" href="/api/export" download>
            <DownloadIcon size={16} />
            Export my data
          </a>
        </div>
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

/**
 * The string cousin of ChipRow: a choice out of a named set, wrapping onto a
 * second line when the labels are long. Level labels carry their target time,
 * because the target IS the level — there is no separate goal field, and one
 * would only be a second source of truth next to the engine's own prognosis.
 */
function ChoiceRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-micro font-semibold uppercase tracking-wider text-ash">{label}</div>
      <div className="flex flex-wrap gap-1">
        {options.map(([key, text]) => (
          <button
            key={key}
            type="button"
            aria-pressed={value === key}
            aria-label={`${label}: ${text}`}
            onClick={() => onChange(key)}
            className={`h-9 flex-1 whitespace-nowrap rounded-control border px-3 text-meta font-semibold transition-colors duration-150 ease-out ${
              value === key
                ? "border-flame/70 bg-flame/10 text-chalk"
                : "border-edge bg-well text-ash hover:border-edge-strong hover:text-bone"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
