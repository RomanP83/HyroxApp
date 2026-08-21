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
  ├─ Live in-browser engine demo        src/app/demo/page.tsx   ← no backend needed
  └─ API routes                         src/app/api/**
        /plans/generate  · /sessions/[id]/log (POST log · DELETE undo) · /sessions/[id]/move
        /stripe/checkout · /stripe/webhook    · /telegram/webhook · /cron/macro

Supabase (Postgres + Auth + RLS)        supabase/migrations + supabase/seed
  ├─ athlete_profiles · athlete_state (engine-owned "living" fitness state)
  ├─ plans → plan_phases → plan_weeks → sessions → session_blocks
  ├─ workout_blocks (read-only library, own IP) · benchmark_*
  └─ plan_adjustments (audit log of every adaptive action)

The Engine (deterministic TypeScript)   src/lib/engine/**
  ├─ macro.ts     phase split (lookup + interpolation for crooked timelines)
  ├─ micro.ts     slot distribution per phase & training days
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
generate a plan, then log sessions as *Harder* / *Easier* and watch station tiers,
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

`npm test` runs 55 tests covering:
- Phase split: exact tabulated splits, taper always preserved, crooked timelines
  (9/11/14 weeks), contiguous week ranges.
- Generation: 5 reference profiles (8/10/12/16 weeks × levels), determinism,
  explicit division on every block, deload placement rules.
- Adaptive engine: ACWR math, the step rules, station-specificity, the ±3% pace cap,
  tier clamping, and **10 synthetic athlete trajectories** (consistent / chaotic /
  overloaded / pause) asserting no oscillation and sane end states.
- Session reset: the replay ordering that makes an undo deterministic, and the
  pre-log state snapshot round-trip.

`npm run build` type-checks and compiles all routes. A browser smoke test confirms the
demo generates sessions and adapts on logging.

---

## Status vs. the plan

This implements the **Must-Have (MVP)** feature set from
[`docs/implementation-plan.md`](docs/implementation-plan.md) §2: onboarding, automatic
plan generation (Base→Build→Peak→Taper), compromised-running sessions, explicit
per-division loads, “why this week”, the two-layer adaptive engine, 1-tap logging,
goal-time prognosis, benchmark protocol, deload weeks, Telegram quick-log, Stripe
one-time purchase + free preview, manual session moves, and a per-day undo of a
mis-tapped log.

Should-/Nice-to-Have items (Strava sync, subscription tier, full scaling library,
nutrition content, coach dashboard, native app) are intentionally out of scope for the
MVP and tracked in the plan.
