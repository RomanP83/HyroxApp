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
- Test hooks are `data-*` attributes (`data-session-card`, `data-session-title`), never styling
  classes — a class is not a contract.
