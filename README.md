# 🏋️ Hyrox Periodization Hub

Adaptive 12-week Hyrox training plans, built backward from **your** race date — and
recalibrated after **every** session. running.COACH-style adaptation for the Hyrox
market, without a wearable requirement.

> This repository implements the product described in
> [`docs/implementation-plan.md`](docs/implementation-plan.md) (v1.1). Marketing
> language is “your plan to race day”; *periodization* is the mechanism, not the pitch.

📖 **Looking for how the app is actually used?**
[`docs/anleitung.md`](docs/anleitung.md) is the user guide — every page, every button and what it
does, kept current with each new feature. (In German, like the app's first users.)

---

## Why this exists (the pain points it answers)

| Pain point | What we do |
|---|---|
| **PP1** “Random workouts, no progression” | Visible phase structure + a **“Why this week?”** explanation on every week. |
| **PP2** No individualisation | Onboarding (race date, division, level, 5K, days, equipment) → the plan is provably different on day 1. **Explicit weights/distances/reps per division** on every block. |
| **PP3** Rigid plans collapse in real life | **Adaptive engine** — a missed session is not a broken plan, and every logged session recalibrates the plan. |
| **PP4** Taper/peak uncertainty | Dedicated taper phase that is *never* negotiable. |
| **PP5** Adherence > perfect plan | **1-tap logging** + a Telegram 4-button quick-log — and a **1-tap undo** when the wrong button gets hit. |
| **PP6** Fragmented sources | One system: plan + tracking + adaptation + benchmarks. |
| **PP7** Price sensitivity | One-time price per race cycle. |

---

## Architecture

```
Next.js (App Router, Vercel)
  ├─ Marketing / SEO landing            src/app/page.tsx
  ├─ Onboarding wizard (magic-link)     src/app/onboarding/page.tsx
  ├─ Week view + 1-tap logging          src/app/plan/page.tsx + components/PlanClient.tsx
  ├─ Season view (the year plan)        src/app/season/page.tsx + components/SeasonClient.tsx
  ├─ Strength days (own programming)    src/app/strength/page.tsx + components/StrengthClient.tsx
  ├─ Live in-browser engine demo        src/app/demo/page.tsx   ← no backend needed
  ├─ Knowledge review (operator)        src/app/admin/knowledge/page.tsx
  └─ API routes                         src/app/api/**
        /plans/generate  · /sessions/[id]/log (POST log · DELETE undo) · /sessions/[id]/move
        /stripe/checkout · /stripe/webhook    · /telegram/webhook · /cron/macro
        /admin/knowledge/documents · /admin/knowledge/proposals · /seasons
        /strength/templates

Supabase (Postgres + Auth + RLS)        supabase/migrations + supabase/seed
  ├─ athlete_profiles · athlete_state (engine-owned "living" fitness state)
  ├─ seasons → season_races + season_blocks (the year above the plan)
  ├─ strength_templates → strength_exercises + strength_set_logs (own lifting)
  ├─ plans → plan_phases → plan_weeks → sessions → session_blocks
  ├─ workout_blocks (read-only library, own IP) · benchmark_*
  ├─ knowledge_documents → knowledge_proposals (PDF ingestion, operator-only)
  └─ plan_adjustments (audit log of every adaptive action)

The Engine (deterministic TypeScript)   src/lib/engine/**
  ├─ running.ts   the run architecture: 4 core sessions, zones, polarised 80/20
  ├─ season.ts    annual periodisation: macrocycles per race, mesocycles inside
  ├─ macro.ts     phase split (lookup + interpolation for crooked timelines)
  ├─ micro.ts     slot distribution per phase & training days, AM/PM doubles
  ├─ fill.ts      block selection + load rendering from LIVE athlete_state
  ├─ generate.ts  orchestrator (deload/benchmark placement, weekly goals)
  ├─ prognosis.ts goal-time estimate
  └─ adaptive.ts  Layer 1 micro-calibration + Layer 2 macro-guardrails
```

**Key decision:** the engine is *pure, deterministic TypeScript* with **no LLM in the
plan core** — “lazy AI” is the literal complaint against competitors. Every adaptation
is rule-based, audited in `plan_adjustments`, and shown to the user with a one-line
reason. The same functions run in the API routes and, unchanged, in the in-browser demo.

---

## The adaptive engine (the v1.1 heart)

**Layer 1 — micro-calibration** fires on every `session_logs` insert:
- sRPE load → `acute_load_7d` / `chronic_load_28d` / ACWR
- RPE delta → **one step** up/down (needs 2 consecutive too-easy sessions to step up;
  steps down immediately when too hard). **Station-specific** — a wall-ball log only
  moves the wall-ball tier.
- Pace zones recalibrate from actual run paces, **capped ±3%/week** (no runaway).
- Finish-time estimate updates.

**Layer 2 — macro-guardrails** (nightly cron): ACWR watch (trim / auto-deload),
rebase after ≥7 inactive days, ramp-up re-entry, injury → rehab mode.

**Post-session training feedback:** after every logged session the athlete gets
a feedback card — a coach message, a **fulfillment index (0-100)** and an
actual-vs-planned comparison (load, duration, intensity, plus pace/distance
when logged) with per-metric verdicts. All numbers and verdicts are computed
deterministically in the engine (`src/lib/engine/feedback.ts`); when
`ANTHROPIC_API_KEY` is set, Claude rewrites only the coach message in a warmer
voice from those fixed facts (`src/lib/coachFeedback.ts`) — without a key the
deterministic text ships as-is.

Every knob (±1 step, ±3% cap, ACWR 0.8/1.3/1.5) is a starting value from training
literature, tuned in beta with real logs — which is why the audit log exists from day 1.

---

## Quick start

```bash
npm install
cp .env.example .env.local          # fill in Supabase (+ optional Stripe/Telegram)

# Run the deterministic engine test suite (no services required):
npm test

# See the engine work with zero backend — generate a plan, log sessions, watch it adapt:
npm run dev        # then open http://localhost:3000/demo
```

The **`/demo`** route runs the real engine entirely in the browser: pick a profile,
generate a plan, then log sessions as *Felt harder* / *Felt easier* and watch station tiers,
pace zones and the finish-time estimate recalibrate live — each change explained.
Tapped the wrong button? **Undo** on the card rolls that day back, including every
plan change it caused.

### Full stack (Supabase)

```bash
supabase start
supabase db reset        # applies supabase/migrations/** then seeds the library
```

Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` (the engine writes `athlete_state` / `plan_adjustments`
via the service role, bypassing RLS). Stripe, Telegram and the cron secret are
optional — see `.env.example`. The app degrades gracefully when they’re unset.

---

## Testing

`npm test` runs 232 tests covering:
- Phase split: exact tabulated splits, taper always preserved, crooked timelines
  (9/11/14 weeks), contiguous week ranges.
- Generation: 5 reference profiles (8/10/12/16 weeks × levels), determinism,
  explicit division on every block, deload placement rules.
- Adaptive engine: ACWR math, the step rules, station-specificity, the ±3% pace cap,
  tier clamping, and **10 synthetic athlete trajectories** (consistent / chaotic /
  overloaded / pause) asserting no oscillation and sane end states.
- Session reset: the replay ordering that makes an undo deterministic, and the
  pre-log state snapshot round-trip.
- Knowledge pipeline: proposal → `workout_blocks` row mapping, the calibration
  key allow-list with its bounds, the extraction fan-out, the ready-made-JSON
  validator, and a round-trip proving the brief we hand out is what we accept.
- Season periodisation: every week allocated exactly once at any cycle length,
  taper protected, deload rhythm, the multi-race bridge, weakness routing — plus
  a render test of the year view.
- Double days: at most two sessions per day and never two in the same half,
  never two hard sessions on one day, the PM session lighter and shorter than
  the morning it follows, and suppressed in taper/deload/benchmark weeks.
- Strength import: a real Excel sheet (rep ranges, supersets, a bodyweight row,
  a numbering column) parsed exactly, plus the double-progression rules and a
  render test of the fillable session card.
- Running architecture: the four core sessions' distances land inside their
  prescribed ranges, no compromised running before the build block, every phase
  hits its polarised window at 5 training days, and the compromised opening
  buffer reaches the card.
- Running volume: the phase curve and its ramp, scaling a week onto a km target
  without distorting the session mix, the run-frequency rule (lowest-priority
  run goes first, one non-run slot always survives), and the history check
  against the last four logged weeks.
- Run variants: a library block behind every one, phase and equipment gating,
  deterministic rotation, and the weakness bias that alternates instead of
  repeating one session.
- Station variants: three shapes per training block and two for the race week,
  overload work confined to the base, priming confined to the taper, and the
  division loads that come out of a "125% of race weight" prescription.
- Structure: the 4/4/3/1 split, at most two hard days in any week at any
  frequency, exactly one full simulation per cycle, strength in every phase,
  plyometrics and grip actually reaching a session, and one full rest day.

`npm run build` type-checks and compiles all routes. A browser smoke test confirms the
demo generates sessions and adapts on logging.

---

## The rules the structure holds itself to

The whole plan is checked against a handful of coaching rules, and the tests fail if it drifts:

| Rule | How it is held |
|---|---|
| **Two hard days a week, no more** | `capHardSessions()` runs last on every week — a benchmark, a simulation or an ambitious run frequency gives the slot back to the phase's next session |
| **One full race simulation per cycle** | placed three weeks out, not once per peak week: a complete run-through costs 2-3 days of recovery |
| **12 weeks = 4/4/3/1 · 16 weeks = 5/5/4/2** | `PHASE_SPLIT_TABLE` — a 16-week runway affords the reference's long peak (4w) and long taper (2w) |
| **Strength in every phase** | heavy compounds at 3 reps in base and build, maintenance in peak, a power primer in race week |
| **Plyometrics and grip, in a rested state** | finishers on the strength day, alternating week by week — they are the two must-dos that only work fresh |
| **At least one full rest day** | no week ever fills seven days, at any frequency |
| **The athlete owns the weekdays** | long run, strength and rest days are pinned plan-wide and honoured even against the rules above — `layoutWeek()` reports what a pin costs instead of overruling it |
| **Frequency fits the level** | Five levels, mapped to target times: beginner 3-4 sessions (1:40+), intermediate 4-5 (sub 1:30), advanced 5-6 (sub 1:20), elite 6-8 (sub 70, doubles sometimes), world class 7-9 (sub 60, AM/PM the norm). The app advises; it never blocks |
| **No two hard endurance days back to back** | the week scheduler always puts a Zone-2 day, a load day or a calendar gap between them |
| **Strength never the day after a hard day** | the strength session opens with plyometrics, and the CNS needs 24-48 h after a hard day before explosive work |
| **Doubles are ordered, not stacked** | on an AM/PM day the neurally demanding session comes first (strength/station AM), the PM is always easy — the split itself is the 2-6 h separation the interference effect demands |
| **20-40% of the easy volume can live on the erg** | SkiErg/Rower/BikeErg carry aerobic base without the Achilles cost — the weekly readout says so in base and build |

Deliberate exception: the one simulation week sits below its polarised window, and the taper's window
is wider because a taper cuts volume while keeping the sharp sessions — the hard share rises by
design there.

---

## Station sessions, phase by phase

The station work of a base block and the station work of a race week are not the same session with a
different weight on the sled. Eleven shapes, picked by the same rule as the run variants:

| Phase | Focus | Sessions |
|---|---|---|
| **Base** | overload, maximal strength, capacity | Overload Sled & Grip Builder (125% race weight) · Aerobic Ergometer Capacity (40 min Ski↔Row, Z2/low Z3) · Wall Ball & Lunge Volume |
| **Build** | strength endurance, cadence, lactate | Ergometer Threshold Intervals (5×1000 m at race pace −3-5 s) · Station Density EMOM (30 min) · Heavy Leg Push-Pull Circuit |
| **Specificity** | race pace, transitions, rhythm | The Engine & Core Gauntlet (all stations, no running) · Station Interval Simulation 3×3 · Wall Ball & Lunge Race Finish |
| **Taper** | reactivity, freshness, precision | Neural Activation & Pacing Calibration · Ergometer & Movement Primer |

Loads are written against the competition weights the library already uses, so "125% of race weight"
renders as 155 kg for Open and 220 kg for Pro. Every second week aims at your weakest station, just
like the runs.

**One trade-off worth knowing:** at five training days, a build week now spends a slot on station
work that used to go to the recovery run — a Hyrox build block without station work is not a Hyrox
plan. That costs aerobic kilometres, so the week's running readout flags it and names the lever: a
double day (its PM session is an easy run) puts the polarised share back in the window.

---

## How the running is built

Running is 50-60% of a Hyrox, so the plan treats it as an architecture rather than "some runs".
`src/lib/engine/running.ts` holds the four core sessions — one table, no scattered numbers:

| Session | Duration | Zone | Pace | Focus |
|---|---|---|---|---|
| **Long Run** | 80 → 60 min (shortens toward the race) | Z2 · 65-75% HRmax | 5k pace + 60-90 s | mitochondria, fat metabolism, tendons |
| **Recovery Run** | 30-40 min | Z1-2 · <70% HRmax | very easy | circulation, lactate clearance |
| **Threshold / VO₂max** | 40-55 min | Z4-5 · 88-95% HRmax | 3k-5k effort | lactate tolerance, VO₂max |
| **Compromised Running** | 45-60 min | Z3-4 · 80-90% HRmax | race pace out of the station | running on heavy legs |

- **Base has no compromised running at all** — running economy first, no sled and lunge load on the
  tendons yet. It starts in the build block (1×/week) and doubles in the peak.
- **Coming out of a station** the first 400 m carry +20 s/km on your flat split, and the first 200 m
  are for breathing, not for making up time. Both are on the session card before you tap it open.
- **Every week reports its own architecture**: total kilometres and the aerobic/hard split, measured
  by *distance in zone* (an interval session is not 100% hard — the warm-up and the jog between reps
  are aerobic). The window is phase-aware: a base block is meant to sit at 80-95% aerobic, a peak
  block at 60-80%. When your training days cannot carry the target, the week says so instead of
  quietly missing it.

### Compromised running is prescribed per level, not just per phase

What a sub-2:00 athlete and a sub-60 athlete do coming off a sled is not the same session at a
different pace. Sixty sessions — five levels × four phases × three shapes — live in
`src/lib/engine/compromisedSessions.ts` and render straight into the session card:

| Level | A build session looks like |
|---|---|
| **Beginner** | 3 rounds: 40 m light lunges → 800 m at race pace |
| **Intermediate** | 4 rounds: 30 m sled at race weight → 1000 m threshold |
| **Advanced** | 4 rounds: 50 m sled at competition weight → 1000 m held at 4:45-5:00 min/km |
| **Elite** | 4 rounds: 50 m sled at maximum pressure → 1000 m at 4:15-4:25, no transition |
| **World class** | 5 rounds: 50 m Pro-weight sled → transition under 5 s → 1000 m at 3:45-3:55 |

They carry their round count as data rather than as prose, so the running volume of a session is
knowable (`runningMetres()`), and they rotate by week with the same weakness bias as every other
catalogue. An athlete without an erg never gets an erg session — the picker falls back across
levels rather than dropping compromised running from the week.

### One session, several shapes

Each core session has variants, and the engine picks one per week — so a twelve-week plan does not
prescribe the same interval session twelve times:

| Core session | Variants |
|---|---|
| Long run | Flat Steady · Rolling Hills (pace dropped on the climbs to hold Z2) · Progression (Z2 → sub-threshold) |
| Recovery run | Shakeout + 80 m strides · Soft-surface · Cross-training combo (half on the erg) |
| Intervals | VO₂max 1k repeats · Threshold cruise 2k · Pyramid 400→1600→400 · 30/30 short reps |
| Compromised | Sled brick · Lactate flush (erg → run) · Heavy Legs Triple (lunges → 1200 m) · Micro-simulation |

Selection is deterministic in (session, phase, week), so the same athlete in the same week always
gets the same session — and explainable: the card names the variant and why it is this one. Variants
are gated by phase (30/30 short reps belong near the race, not in a base block) and by kit (no erg,
no erg session; the hills and trail variants carry a fallback instead).

**Adaptive:** every second week goes after your weakest station — read from the live station tiers or
from a weakness you named — and is marked *your weak spot* on the card. The weeks in between
deliberately exclude that variant, otherwise a "weakness focus" quietly becomes the same session
every week.

### Setting the volume yourself

Two numbers on the plan page: **peak km/week** and **runs/week**. You set the *peak* — the hardest
week of the cycle — and the phase curve derives every other week from it (base 85%, build 100%, peak
90%, taper 50%, deload ×0.7, plus a three-week ramp into the plan). A cycle *average* would hide the
single week that decides whether the build holds, which is why the peak is the input.

The run sessions are then stretched or shrunk onto that target, keeping their proportions — the long
run stays the long one, and no target turns a recovery run into an epic (every session has bounds).
Saving rebuilds the remaining weeks through the same rebase the injury-recovery flow uses.

**The corrective:** the app compares your target against the kilometres you have actually logged in
the last four weeks (measured distance from Strava/Garmin where available, otherwise minutes at the
session's pace zone). Ask for 70 km off the back of 20 km weeks and it says so, with the number the
ramp would support — it does not refuse the target, it makes it a decision.

---

## Your own strength programming

Most lifters already keep their strength work in a sheet. Paste it in at `/strength` — copying a
range out of Excel puts tab-separated text on the clipboard, and the parser reads it as it is:

```
1   Bankdrücken mit KH                     2   6 - 8    22   12   8
6   Hammer curls mit KH im Supersatz       2   10 - 12  16   10   10
7   Face Pulls (am Kabelzug) im Supersatz  2   12 - 15  27   12   12
    Dips                                                     15   15
```

The numbering column is skipped, `6 - 8` becomes a rep range, the two rows marked *im Supersatz* are
paired, and Dips — no sets, no weight — becomes a bodyweight exercise with two sets. You see the
parse **before** anything is saved.

From then on every strength session in the plan is *your* day (several days rotate week by week),
with your kilos rather than the library's per-division loads. The session card turns into a sheet:
reps and kilos per set, empty means "as programmed". One tap on the quick-log row files the session
and the sets together.

**Progression suggests, it never overwrites.** Clear the top of the rep range on every set and the
app offers the next weight (`Every set hit 8 reps at 22 kg — 24.5 kg is the next step.`); land under
the bottom twice in a row and it offers a step down. The number only changes when you take it. You
programmed the day; the app does the arithmetic.

---

## Double days (AM / PM)

A training day can carry a second session. Pick 0–3 double days in onboarding
(`athlete_profiles.doubles_per_week`) and the generator adds a **PM session that
complements the morning instead of competing with it**:

| Morning | Afternoon | Why |
|---|---|---|
| compromised run · intervals · simulation | mobility | recovery after the key session |
| strength · station work | easy run | aerobic flush, a different system |

The rules the engine holds to, all covered by tests: never two sessions in the same half of a day,
never two hard sessions on one day, the PM session is always shorter and easier than the morning it
follows, doubles go on the key mornings first and never on the week's easy day, at least one training
day stays single — and **taper, deload and benchmark weeks stay single-session**, because a second
session there works against what the week is for.

`sessions.day_slot` makes the day half explicit, a unique index on `(week, day, slot)` keeps it
honest, and the evening check-in and the Strava/Garmin auto-log both match on the slot — a morning
run no longer lands on the evening's session.

---

## Planning a whole year, not just one race

`/season` takes your race calendar and plans the year backwards from every **A** race:

```
Race cycle 1 — Hyrox Open, 16 Jan          Race cycle 2 — Hyrox Pro, 15 May
 base 4w │ build 4w │ specific 6w │ taper 2w   recovery 3w │ base 3w │ build 3w │ specific 6w │ taper 2w
   ▲ deload w4        ▲ w8    ▲ w12                            ▲ w22
```

- **Taper is never negotiable** — 1–2 weeks at −40% volume, protected first when a cycle is short.
- **Race specificity 6–8 weeks, build 6–10** — compromised running and pacing sims close to the race,
  VO2max and lactate tolerance before that, base and heavy strength when the runway allows.
- **2–3 weeks of recovery after every race**, then the next cycle starts.
- **Deload every 4th training week** at −35%, never on a block's opening week.
- **Multi-race logic**: a short gap between two A races becomes one re-build bridge focused on your
  weaknesses instead of a squeezed cycle — and the season tells you why.
Your weaknesses are routed to the block where they belong: strength work into base, lactate tolerance
into build, race execution into the race-specific block. Details:
[`docs/season-periodisation.md`](docs/season-periodisation.md).

### One main race, any number of side races

A race calendar is only useful if the training days actually change around it. Each race carries a
priority, and the priority is a promise about what the plan will do:

| | What it is | What the plan does |
|---|---|---|
| **A** | Your main race | Gets a macrocycle of its own: a full taper in front of it, 2–3 recovery weeks behind it. The weekly plan is built backwards from the next one. |
| **B** | A race that matters, but not *the* race | Rides inside the block it falls in: 3 easy days before, 2 after, the week at 80% volume. No cycle, no restructuring. |
| **C** | A tune-up | No taper at all — it *replaces* the week's hard session, then one easy day. |

Enter them on `/season`, either as rows or by clicking a day in the calendar. The engine then writes
a real **race day** session into the plan on that date, softens the run-in around it, and turns the
days after it into recovery — across week boundaries, so a Saturday race eases the Monday that
follows. A race counts against the two-hard-days ceiling like any other hard session: the session
that gives way is the one closest to the race.

The year view and the weekly plan share one calendar (`src/lib/seasonCalendar.ts`), so
**Build the training plan for the next main race** on `/season` produces exactly the cycle the
timeline above it promises — and a rebase keeps the calendar instead of silently dropping it.

---

## Feeding it your own research

Studies, review papers and training literature go in as **reviewed, structured changes** — never as
context at generation time. Three ways in at `/admin/knowledge`, one review queue:

- **PDF** — the model reads the file and cites the page behind every proposal
  (bulk-load a folder with `scripts/ingest_pdf.sh`).
- **AI summary / notes** — paste text that was already analysed elsewhere; the same extractor
  structures it, and treats second-hand claims with lower confidence.
- **Ready-made proposals** — paste JSON in the app's own contract and **no model runs at all**. Hit
  *Copy the brief for your AI* to get the exact contract (enums, tuning ranges, copyright rule,
  worked example) to hand to whichever AI you already use.

Whatever the source, it proposes three kinds of change, each with a verbatim quote and — where the
source has pages — a page number:

| Proposal | Lands in | Effect on the plan |
|---|---|---|
| library block | `workout_blocks` | the generator can pick it from the next plan on |
| calibration constant | `engine_config` | one of 14 tunable keys, inside a fixed sanity range |
| principle | nothing automatic | research note — a third-party programme never becomes a block (§7) |

You approve or reject every proposal. The engine itself stays deterministic and LLM-free; documents
you hold no rights to are marked `research_only` and can only ever yield principles and constants.
Details and operating notes: [`docs/knowledge-pipeline.md`](docs/knowledge-pipeline.md).

---

## Status vs. the plan

This implements the **Must-Have (MVP)** feature set from
[`docs/implementation-plan.md`](docs/implementation-plan.md) §2: onboarding, automatic
plan generation (Base→Build→Peak→Taper), compromised-running sessions, explicit
per-division loads, “why this week”, the two-layer adaptive engine, 1-tap logging,
goal-time prognosis, benchmark protocol, deload weeks, Telegram quick-log, Stripe
one-time purchase + free preview, manual session moves, a per-day undo of a
mis-tapped log, and optional AM/PM double days.

Should-/Nice-to-Have items (Strava sync, subscription tier, full scaling library,
nutrition content, coach dashboard, native app) are intentionally out of scope for the
MVP and tracked in the plan.
