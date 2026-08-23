# Interface system

Decisions already made. Hold to these instead of re-deciding per screen.

## Direction

The room this sport happens in: a matte black indoor arena, sled turf, chalk, and the amber LED of
a race clock. The interface should read as **equipment** — a workbench an athlete opens at 6am on a
phone — not as a brochure. Calm, dense, legible under bad light.

Every page answers one question first. On `/plan` it is *"what am I doing today, and is it hard?"*

## Tokens

Defined in `tailwind.config.ts`; the same values as literals in `src/lib/format.ts` (`PALETTE`) for
the places that need a colour as a value. Change one, change both.

| Token | Value | Role |
|---|---|---|
| `floor` | `#080c10` | the page ground |
| `lane` | `#0f1620` | a panel resting on it |
| `rack` | `#16202b` | raised: focal cards, nested emphasis |
| `well` | `#05080b` | **inset** — inputs are sunk in, never floated |
| `chalk` / `bone` / `ash` / `smoke` | `#e7edf2` / `#aebbc6` / `#7b8b98` / `#55636f` | four text levels — two is not a hierarchy |
| `edge` / `edge-strong` | `rgba(255,255,255,.075)` / `.15` | rgba so a border blends instead of drawing a line |
| `flame` | `#ff5a1f` | the **one** accent: actions, and hard effort |
| `amber` | `#e8a33a` | attention — deload, benchmark, the engine speaking |
| `go` | `#35b88a` | aerobic, done, on target |
| `stop` | `#e0646c` | error, injury |

One hue across every surface; only lightness moves. `amber` replaced the old `accent2` *and* `warn`,
which were the same hex — a signal colour and a decorative one being identical meant warnings did
not read as warnings.

## Depth

**Surface shifts + hairline rgba edges. No drop shadows.** On `#080c10` a shadow is invisible, so
lightness carries elevation. One strategy, held everywhere.

## Type

`Archivo` for UI, `JetBrains Mono` for every number — each split, pace, weight and time in this
sport is read off a clock or a plate, and monospaced figures keep a changing number from shifting
the layout under it.

Scale (14px base, ~1.25): `micro 11 · meta 12 · base 14 · lead 16 · h3 18 · h2 22 · h1 28 ·
clock 44`. Hierarchy uses three levers together — size, weight, and one of the four text levels —
never size alone.

## Spacing & radius

4px base. Card padding 16, row gaps 6, group gaps 20–32. Radius scale: `control 8` (buttons, inputs,
chips) · `panel 12` (cards) · `stage 16` (modals) — concentric, so a 12px card holding 16px of
padding gets ~8px children.

## Patterns

- **Effort rail** — every session card carries a 3px bar in `DEMAND_COLORS[demand]`. Read down the
  list and the week's shape is visible before a word: two flame bars is a hard week. The demand
  split (`hard` / `aerobic` / `load` / `recovery`) is the same one the engine reasons with, so the
  colour on screen and the rule in the engine cannot drift.
- **One focal card per week** — `focal` goes to today's still-planned session only. It gets the
  `rack` surface, `edge-strong`, and the page's only filled `btn-primary`. Six filled buttons is
  six focal points, which is none.
- **The cycle is a strip, not a bar** — 1–2px per week, `PHASE_COLORS`, current week at full opacity
  and double height, amber dot for deload/benchmark. It is context; the week is the task.
- **Setup collapses** — Strava, Telegram, injury, volume live in a `<details>`. A one-time job does
  not deserve permanent residence next to the thing you open the page for.
- **Numbers in mono, right-aligned, tabular** — `Row` in `PlanClient` is the pattern (`dt` label in
  `ash`, `dd` value in mono `bone`).
- Buttons: 40px min height, `active:scale-[0.97]`, `cubic-bezier(0.23, 1, 0.32, 1)`, ≤150ms.
- **One header, everywhere** — `AppHeader` owns the nav and the countdown. Each page passes what
  it counts down to (`Race day` on `/plan`, `Next main race` on `/season`) and at most one action.
  Navigation is not scaffolding around the product; it is the product's sense of place, and the
  current page is always visible in it.
- **A long list of same-shaped things becomes rows, not cards** — season blocks are `<details>` rows
  with a colour rail, the current one on `rack` with `edge-strong`. Fourteen identical cards is the
  sound of no one deciding.
- **Engine explanations are a feed** — an amber left border, `bone` text, no box. Used for both
  "Why your plan changed" and "How this year was planned", because they are the same thing at two
  altitudes.
- **A supporting view does not out-weigh what it supports** — the season calendar shows four months
  from today, with a toggle for the whole year. Thirteen months of mostly empty grid buried the
  timeline it exists to explain.
- `smoke` is disabled and decoration only. Explanatory prose is `ash` at minimum — 11px type set in
  the muted level is a legibility bug, not a hierarchy decision.
- **Settings get a page, not a drawer** — a control that rebuilds the plan is not a footnote to
  today's session. `/settings` groups by the decision being made (what your week looks like, what
  the app is connected to, what happens when something breaks), and reaches from the header's
  right-hand utility corner rather than as a sixth content tab.
- **A connection row states its state** — connected / a Connect button / "not configured". An inert
  button for an integration this deployment never set up is the worse answer.
- Test hooks are `data-*` attributes (`data-session-card`, `data-session-title`), never styling
  classes — a class is not a contract.
