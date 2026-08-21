# Season periodisation — the year above the week

**Status:** implemented — `src/lib/engine/season.ts`, `supabase/migrations/0012_season_periodisation.sql`,
`/api/seasons`, `/season`.

The existing engine answers *"how do I split the weeks to this one race"* (`macro.ts`, 4–20 weeks).
This layer answers *"how does a year with one or several races hang together"*: where the base blocks
sit, which race gets a real taper, what happens in the three weeks after a race, and what to do with
a six-week gap between two A races.

Same contract as the rest of the plan core: **pure, deterministic, no LLM**. Same calendar in → same
year plan out, which is what makes it explainable and testable.

## What comes out

```
season
 └── macrocycle            one per A race, plus an open tail
      └── block            the mesocycles: recovery → base → build → race specific → taper
           ├── weeks, dates, volume multiplier
           ├── focus + key sessions          (what the weeks are made of)
           ├── weakness_targets              (which of YOUR weaknesses belong here)
           └── deload_weeks                  (-35%, every 4th training week)
```

## The rules, and where they live

Every number is in `SEASON_TUNING` (`src/lib/engine/constants.ts`) — no magic numbers in the planner.

| Rule | Implementation |
|---|---|
| Backward planning from each A race | `allocateCycle()` fills taper → race-specific → build → base, in that order |
| Taper 1–2 weeks, volume −40% | 2 weeks only for an A race with a cycle ≥ 12 weeks, else 1; protected first when weeks are short (PP4) |
| Race specificity 6–8 weeks | 45% of what is left, capped at 8; a cycle with ≥ 12 free weeks always gets at least 6 |
| Build 6–10 weeks | 60% of the remainder, capped at 10 |
| Base | whatever is left — a long runway buys base, not more sharp work |
| Post-race recovery 2–3 weeks | 3 after an A race, 2 after a B/C race, at the *start* of the next cycle |
| Deload every 4th week, −35% | counted over training weeks only (recovery and taper never count), never on the opening week of a block, never on the sharpening week before the taper |
| Multi-race logic | a gap of ≤ 4 usable weeks between races becomes one **bridge** block: weakness correction + re-build, and the season notes say so |

**Priorities.** Only an `A` race anchors a macrocycle and gets a taper. `B`/`C` races are planned as
hard training days inside whatever block they fall in — the season notes name them and say what to
do ("three easy days before, no taper, back to the plan after"). If no A race is given, the last race
on the calendar is promoted and that decision is written into the notes.

**Weaknesses.** Each entry ("Sled Push", "Laktattoleranz", "Wall Balls") is classified by keyword and
routed to the block that is the right place for it: strength and technique into base, metabolic and
running into build, race execution into the race-specific block, everything into a bridge. A taper
never carries a weakness target.

**When the calendar runs out.** The season still spans a full year (52 weeks by default): after the
last race it plans recovery and then an *open base* block, with a note saying that adding the next
race re-plans from there.

## How it relates to the weekly plan

The season is the map, the existing generator is the terrain. `/plan` keeps building detailed
sessions for the current race cycle (4–20 weeks, `generatePlan`); the season decides which race that
cycle is for and what the surrounding year looks like. `nextAnchorRace(season, today)` names that
race, `currentSeasonBlock(season, today)` locates the athlete in the year.

The two layers deliberately keep their own deload numbers: the season block plans −35% across a
week, the weekly generator renders its own deload at −40% inside the plan it builds. If you want them
identical, change `SEASON_TUNING.deload_volume_multiplier` — one line, one place.

## Regenerating

`POST /api/seasons` with `{ races, weaknesses }` recomputes and replaces the whole season (cascade
deletes races and blocks). That is safe precisely because the planner is deterministic — nothing is
lost that was not derived from the calendar. Weaknesses live on `athlete_profiles.weaknesses`, so the
season and any later coach text share one list.
