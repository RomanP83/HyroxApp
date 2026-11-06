---
name: HYROX Verona Training Tracker
description: The box's whiteboard for one athlete on the way to sub 70 in Verona.
colors:
  board: "#f0f2f3"
  panel: "#ffffff"
  panel-sunk: "#f6f7f8"
  rail-hi: "#d4d8da"
  rail-lo: "#b6bbbe"
  rail-edge: "#8f9497"
  ink: "#1b1d20"
  ink-2: "#454b50"
  ink-3: "#5f666b"
  rule: "#d6dadc"
  rule-2: "#c2c7ca"
  marker-red: "#c12d24"
  marker-blue: "#1f4fb8"
  marker-green: "#18794a"
  green-wash: "#e9f4ee"
  marker-hyrox: "#b4521a"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, Barlow, sans-serif"
    fontSize: "clamp(2.25rem, 7vw, 3rem)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0"
  clock:
    fontFamily: "Barlow Condensed, Arial Narrow, Barlow, sans-serif"
    fontSize: "clamp(3.25rem, 14vw, 4.5rem)"
    fontWeight: 800
    lineHeight: 1
    fontFeature: "tnum"
  number-n1:
    fontFamily: "Barlow Condensed, Arial Narrow, Barlow, sans-serif"
    fontSize: "clamp(2rem, 6.4vw, 2.75rem)"
    fontWeight: 800
    lineHeight: 1
  number-n2:
    fontFamily: "Barlow Condensed, Arial Narrow, Barlow, sans-serif"
    fontSize: "clamp(1.75rem, 5vw, 2.25rem)"
    fontWeight: 800
    lineHeight: 1.05
    fontFeature: "tnum"
  number-n3:
    fontFamily: "Barlow Condensed, Arial Narrow, Barlow, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 800
    lineHeight: 1.15
    fontFeature: "tnum"
  number-n4:
    fontFamily: "Barlow Condensed, Arial Narrow, Barlow, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    fontFeature: "tnum"
  headline:
    fontFamily: "Barlow Condensed, Arial Narrow, Barlow, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0.01em"
  title:
    fontFamily: "Barlow, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.35
  body:
    fontFamily: "Barlow, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.5
  body-sm:
    fontFamily: "Barlow, Segoe UI, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: 1.55
  label:
    fontFamily: "Barlow, Segoe UI, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 700
    lineHeight: 1.4
rounded:
  hair: "2px"
  tag: "4px"
  sm: "6px"
  md: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.panel}"
    typography: "{typography.title}"
    rounded: "{rounded.sm}"
    padding: "11px 16px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "#000000"
  button-start:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.panel}"
    rounded: "{rounded.sm}"
    height: "54px"
    width: "100%"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "11px 16px"
    height: "48px"
  button-secondary-hover:
    backgroundColor: "{colors.panel-sunk}"
  button-danger:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.marker-red}"
    rounded: "{rounded.sm}"
    height: "48px"
  button-ghost:
    textColor: "{colors.ink}"
    height: "48px"
  text-link:
    textColor: "{colors.marker-blue}"
    height: "44px"
  chip:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "44px"
  chip-on:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.panel}"
  tag:
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.tag}"
    padding: "3px 8px"
  card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.md}"
    padding: "20px"
  card-sunk:
    backgroundColor: "{colors.panel-sunk}"
    rounded: "{rounded.md}"
  input-field:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "11px 12px"
    height: "50px"
  nav-item:
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "50px"
  nav-item-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.panel}"
---

> Shared with the HyroxTraining tracker. HyroxApp keeps its own token names in
> `tailwind.config.ts` (floor, lane, chalk …) and maps them to the values below; it has six views,
> so the phone tab bar has six columns, and its Setup lives in the rail top bar.


# Design System: HYROX Verona Training Tracker

## Overview

**Creative North Star: "The Box Whiteboard"**

The app is the gym's WOD whiteboard. A cool off-white enamel ground sits inside an aluminium-grey frame rail: a sticky top bar on phones, a full-height side column on desktop. Content is written up on white board panels separated by thin grey rules, never by glow or tinted glass. Today's session is the block written on the board, lifted off the enamel; the rest of the week sits flat and dims by colour.

Colour behaves like marker on enamel: each marker has a job. Black ink writes the work and fills the things you press; red marks targets and gaps still open; blue writes running; green means done; an orange-brown marks HYROX station work. Type is one condensed grotesk in heavy caps for headings, titles and every number that matters, plus a plain grotesk for everything you read or tap. Numbers sit on a fixed four-step ramp by how much they decide.

The signature is the marker strike: a tapered green marker stroke drawn across a completed item, which sweeps in once when the item becomes done. The world is light only, by decision.

**Key Characteristics:**
- Cool enamel ground (board) framed by a brushed aluminium rail gradient.
- White ruled panels, 1px grey rules, 8px corners; depth is a single lift reserved for today.
- Marker colours carry meaning (work, target/gap, running, done, HYROX), never decoration.
- Barlow Condensed 800 caps for headings and numbers; Barlow 500/600/700 for UI text.
- Four-step number ramp (n1 to n4) assigned by decision weight.
- The marker strike on completed items.

## Colors

A near-neutral cool enamel and aluminium set, written on with five saturated marker colours that each mean one thing.

### Primary
- **Marker Ink** (ink): the working colour. All body and heading text, the fill of primary buttons, the active nav item, selected chips and segments, the 2px top rule of the week strip, day list and table heads, and chart bars and lines for strength/load data.

### Secondary
- **Target Red** (marker-red): targets and open gaps. The gap to sub 70 ("+14:57"), focus priority numbers, the race marker and race-day calendar dot, the warning notice cap, and the outline of destructive buttons.
- **Running Blue** (marker-blue): running. Running bars, run calendar dots and the run label on the week strip. It also carries a second, interaction job in the build: text links, the 3px focus ring, the input caret, and the cap rule of information notices.
- **Done Green** (marker-green): done, and targets already met. The marker strike, completed unit values, the "Erledigt" mark, done check buttons and on-target values.
- **Done Wash** (green-wash): the pale ground of a check button once it is marked done.

### Tertiary
- **Station Orange** (marker-hyrox): HYROX station work. Station label on the week strip, station calendar dots, station series in the hours chart.

### Neutral
- **Enamel Board** (board): the page ground, also the modal sheet ground.
- **Board Panel White** (panel): cards, inputs, chips, the bottom tab bar, the lifted today day.
- **Sunk Panel** (panel-sunk): secondary panels nested inside a fold or panel, set cards, empty states.
- **Rail Light / Rail Dark** (rail-hi, rail-lo): the two stops of the aluminium frame gradient (horizontal on the desktop side column, vertical on the phone top bar and modal heads).
- **Rail Edge** (rail-edge): the 1px seam where the rail meets the board.
- **Ink 2** (ink-2): secondary text, labels, the dimmed wordmark half.
- **Ink 3** (ink-3): tertiary text, meta lines, struck-through text, and the colour non-today days dim to.
- **Rule** (rule): the 1px board rules between rows and around panels; also the progress track.
- **Rule 2** (rule-2): stronger rule for control outlines (chips, inputs, icon buttons) and chart axes.

### Named Rules
**The Marker Job Rule.** A marker colour on data means exactly its job: red is a target or an open gap, blue is running, green is done (including a target already met), orange is HYROX stations, ink is work. Never pick a marker colour because it looks good in a spot.

**The Pressable Fill Rule.** Solid filled surfaces (ink buttons, active nav, selected chips and segments) belong only to things you can press. Information panels are white or sunk white with a rule; data marks (chart bars, the progress fill, legend swatches, the today cap bar) are marks, not surfaces.

**The Frame Is Metal Rule.** The aluminium gradient appears only on frame chrome: the side column, the phone top bar and modal sheet heads. Content never sits on the rail colour.

## Typography

**Display Font:** Barlow Condensed (with Arial Narrow, Barlow, sans-serif), self-hosted at 600 and 800
**Body Font:** Barlow (with Segoe UI, system-ui, sans-serif), self-hosted at 500, 600, 700

**Character:** A heavy condensed grotesk writes the board in caps the way a coach writes a WOD; a plain, sturdy grotesk handles everything the athlete reads or taps. No handwriting faces.

### Hierarchy
- **Display** (Condensed 800, clamp 2.25 to 3rem, line-height 1, uppercase): the view title ("Heute", "Fortschritt"), with its context line (date and phase) set below it in Body Small at 600, ink-2.
- **Clock** (Condensed 800, clamp 3.25 to 4.5rem, tabular): the live simulation split clock only.
- **Number n1** (Condensed 800, clamp 2 to 2.75rem): the largest decision; today's session title on the lifted panel.
- **Number n2** (Condensed 800, clamp 1.75 to 2.25rem, tabular): headline metrics, the gap to sub 70, the days-to-Verona count, race intro title.
- **Number n3** (Condensed 800, 1.375rem, tabular): supporting figures (week tally, week-strip dates, benchmark and mini-stat values, rail count, baseline).
- **Number n4** (Condensed 600, 1.0625rem, tabular): row-level values (unit results, priority numbers).
- **Headline** (Condensed 800, 1.375rem, uppercase, 0.01em): section heads ("Diese Woche", "Verlauf"); modal heads at 1.625rem (1.375rem on phones); form section heads and set titles at 1.0625 to 1.25rem.
- **Title** (Barlow 700, 1 to 1.0625rem, line-height 1.35): row titles, card titles, fold summaries.
- **Body** (Barlow 500, 1rem, line-height 1.5); **Body Small** (0.9375rem, line-height 1.55) for panel copy and buttons.
- **Label** (Barlow 700, 0.8125rem): field labels, tags, week-strip weekdays (0.75rem, uppercase, 0.04em), table heads. A caption under a metric uses 600 in ink-2.

### Named Rules
**The Four Numbers Rule.** Every displayed figure takes one of n1 to n4 by how much it decides, never an ad-hoc size. Numbers that change are tabular.

**The Condensed Caps Rule.** Condensed caps are for the board's writing: view titles, section heads, session titles, numbers. Anything you read as a sentence or press as a control is Barlow in sentence case.

## Layout

Desktop (above 900px) is a two-column shell: a 232px sticky aluminium side column (wordmark, nav, footer) and a main column capped at 1160px with clamp(24px, 4.5vw, 64px) side padding; the days-to-Verona count sits top right. At 900px and below the side column disappears: the rail becomes a sticky top bar (wordmark left, count and add button right) and navigation moves to a five-column bottom tab bar on panel white, both respecting safe-area insets. Further steps at 620px (16px gutters, single-column grids, full-screen sheets) and 370px (12px gutters, short labels).

The board is ruled, not boxed: lists (today's units, the plan's day list, the week strip, tables) are rows separated by 1px rules under a 2px ink top rule, with 12px vertical row padding. The week is seven equal ruled columns. Panels stack with a 12px gap; sections open with about 30px above the head. Spacing values are literal in the stylesheet (no spacing tokens); the scale above records the steps actually reused, and many one-off inline margins sit outside it.

## Elevation & Depth

The board is flat. Depth comes from tone (enamel, white panel, sunk panel) and 1px rules. A single lift marks what is happening now; overlays use one sheet shadow.

### Shadow Vocabulary
- **Today Lift** (`box-shadow: 0 1px 0 #e3e5e1, 0 14px 30px -20px rgba(27,29,32,.5)`): today's session panel, today's column on the week strip, today's row in the plan list. Nothing else.
- **Sheet** (`box-shadow: 0 30px 80px -30px rgba(0,0,0,.55)`): the modal sheet on desktop; removed when the sheet goes full-screen on phones.

### Named Rules
**The One Lift Rule.** Only today lifts. The rest of the week stays flat and dims by colour (ink-3), not by opacity.

## Shapes

Gently rounded, sign-like rectangles: 8px on panels, folds and sheets; 6px on buttons, inputs, chips and nav items; 4px on tags; 2px on progress bars and legend swatches; full circle only on 6px calendar dots. Borders do the structural work: 1px rule around panels, 1.5px outlines on controls, 2px ink for the active phase, today's calendar cell and table heads. Strong ink borders (1.5 to 2px) mark the focused or active board block. Full-screen phone sheets drop all corners.

## Components

### Buttons
Marker-black and plain: a pressed board magnet, not a glossy pill.
- **Shape:** 6px corners, 48px minimum height (54px for the start button), 1.5px border.
- **Primary:** ink fill, white Barlow 700 at 0.9375rem; hover deepens to pure black. Today's "Training starten" is a full-width primary.
- **Secondary:** white with a 1.5px ink outline; hover to sunk white.
- **Danger:** white with a red outline and red text.
- **Ghost:** no box; ink text with a 1.5px underline that turns blue on hover.
- **Text link:** blue Barlow 700 with a trailing arrow, 44px tap height.
- **Press:** every button nudges down 1px on press; focus is a 3px blue outline offset 2px.

### Chips and segmented controls
- **Chips:** white, 1.5px rule-2 outline, 6px corners, 44px tall, tabular numerals; selected becomes an ink fill with white text.
- **Segmented:** one 1.5px ink-outlined strip divided by ink rules; the selected segment fills ink.

### Tags
Outlined, never filled: 1.5px outline and text in the same colour (ink-2 by default, or the matching marker), 4px corners, label type. Today's kind tag takes its session's marker: blue for running, orange-brown for HYROX work, ink for strength, ink-3 for recovery.

### App icon
The heartbeat mark in ink (#1b1d20) on the enamel board (#f0f2f3); the browser-tab favicon adds a rail-grey (#b6bbbe) frame. No lime, no dark tile.

### Cards / Containers
- **Corner Style:** 8px.
- **Background:** panel white; sunk white when nested or secondary.
- **Shadow Strategy:** none, except Today Lift (see Elevation).
- **Border:** 1px rule; ink when the panel is the focus block.
- **Internal Padding:** 20px (16px on phones); today's panel 22px (18px).
- **Notices:** white panel with a 2px coloured cap rule on top (blue info, red warning).
- **Empty states:** sunk white with a dashed 1.5px rule-2 border, centred.

### Inputs / Fields
- **Style:** white, 1.5px rule-2 outline, 6px corners, 50px tall, 1rem text; labels above in Label type, ink-2.
- **Focus:** 3px blue outline flush to the field, border turns ink.
- **Steppers:** 48px ink-outlined plus/minus buttons around a centred tabular input.

### Navigation
- **Desktop:** nav items in the aluminium side column, Barlow 700 at 0.9375rem with a 22px line icon; hover is a translucent white wash; active fills ink.
- **Phone:** five-column bottom bar on panel white, icon over a 0.75rem label; active fills ink.
- **In-view tabs:** text tabs on a 2px ink baseline; the active tab gets a 3px ink underline.

### Week Strip
Seven ruled columns under a 2px ink top rule: weekday label, condensed date at n3, kind in its marker colour. Today becomes a white lifted column with a 4px ink cap; other days stay on the enamel in ink-3.

### The Marker Strike
A tapered green marker stroke (an 8px SVG mask, rotated -1.5deg) drawn across a done item: today's unit rows, set titles in the workout sheet, and kinds on the week strip. Struck text drops to ink-3. Items that just became done sweep the stroke in once (0.5s, cubic-bezier(.22,1,.36,1), scaling from the left); under reduced motion the stroke is simply present. Multi-line plan titles use a 3px green line-through instead, because the mask cannot follow wrapped lines.

## Do's and Don'ts

### Do:
- **Do** give every number a step on the n1 to n4 ramp and keep changing numbers tabular.
- **Do** draw done things with the marker strike in Done Green, and use green for nothing but done states and targets already met.
- **Do** keep today the only lifted element; dim the rest of the week to ink-3.
- **Do** separate rows with 1px rules under a 2px ink top rule instead of boxing each row.
- **Do** keep tap targets at 44px minimum and primary controls at 48px or more.
- **Do** honour reduced motion: the strike appears without the sweep, transitions collapse.

### Don't:
- **Don't** fill a non-pressable surface with ink or a marker colour.
- **Don't** use a marker colour outside its job (for example red for emphasis, or green for anything not done or met).
- **Don't** dim inactive days or rows with opacity; use ink-3.
- **Don't** introduce a dark theme, glow, glass, or neon accents; the world is light enamel only.
- **Don't** add handwriting or script faces; the board is written in Barlow Condensed.
- **Don't** set uppercase kicker labels above titles or values; context goes on the line below the title.
- **Don't** use the aluminium rail gradient as a content background.
