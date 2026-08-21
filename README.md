# 🏋️ Hyrox Periodization Hub

Adaptive 12-week Hyrox training plans, built backward from **your** race date — and
recalibrated after **every** session. running.COACH-style adaptation for the Hyrox
market, without a wearable requirement.

> This repository implements the product described in
> [`docs/implementation-plan.md`](docs/implementation-plan.md) (v1.1). Marketing
> language is “your plan to race day”; *periodization* is the mechanism, not the pitch.

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

`npm test` runs 142 tests covering:
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

`npm run build` type-checks and compiles all routes. A browser smoke test confirms the
demo generates sessions and adapts on logging.

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
- **B and C races** are planned as hard training days inside the block they fall in, not as peaks.

Your weaknesses are routed to the block where they belong: strength work into base, lactate tolerance
into build, race execution into the race-specific block. Details:
[`docs/season-periodisation.md`](docs/season-periodisation.md).

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
