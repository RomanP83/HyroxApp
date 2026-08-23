# Working in this repository

## The user guide is part of every change

`docs/anleitung.md` is the running user guide: every page, every control, and what it actually
does. It is written in German, for the people who use the app.

**Whenever a change alters what a user can see or do, update the guide in the same commit.** That
means: a new page or button, a renamed control, a changed default, a rule that now behaves
differently, a feature that becomes available or goes away.

Two rules keep it honest:

1. **Describe what is wired, not what exists.** An API route with no button in the UI is not a
   feature — say so explicitly rather than implying the user can do it. (See the "Verschieben"
   entry for the tone: state that the endpoint exists and that the control does not.)
2. **Add a line to the change log** (section 17) for every user-visible change, newest first,
   pointing at the section that describes it.

Purely internal refactors, tests and tuning constants that no user can perceive do not need an
entry.

## The rest

- The plan core is deterministic: no LLM in `src/lib/engine/**`. Same input, same plan. Language
  models may polish coach text, never alter the plan.
- Engine constants live in `src/lib/engine/constants.ts` and `running.ts` — one place to argue with.
- Every migration is mirrored into `supabase/setup.sql`. A new enum value must also be added to the
  `create type` in `0001_schema.sql`, because a value cannot be *used* in the transaction that adds
  it.
- Verify with `npx vitest run`, `npx tsc --noEmit`, `npx next lint`, `npx next build` and
  `npx playwright test` before committing.
- Never put a model identifier into a commit message, PR text, or any file in the repo.
