# Personal setup — run the Hub just for yourself

The fastest path to *your* plan on *your* phone: **Supabase (free) + Vercel
(free)**. Roughly 20 minutes, no credit card, no Stripe account.

Everything optional stays optional — Telegram, Strava, Garmin, Resend
and Anthropic keys can all stay unset; the app degrades gracefully without them.

---

## 1. Database — Supabase (~8 min)

1. Create a free project at [supabase.com](https://supabase.com). Pick a region
   near you and save the database password.
2. In the project: **Project Settings → API** — copy three values:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` *(server-only, never
     paste it anywhere the browser can read)*
3. Set up the database — **no CLI needed**. Copy the whole of
   [`supabase/setup.sql`](../supabase/setup.sql) and paste it into
   **SQL Editor → New query** in the Supabase dashboard, then **Run**. That one
   file creates every table, enables row-level security, installs the
   plan-persistence function, and seeds the workout library plus benchmark
   definitions. It is safe to run more than once.

   Prefer the CLI? `npx supabase link --project-ref <ref> && npx supabase db push`
   applies the migrations; you then still need the three files in
   `supabase/seed/` for the workout library.

4. **Lock the door behind you.** Sign in to the app once (step 3 below), then in
   Supabase go to **Authentication → Providers → Email** and turn off
   *Allow new users to sign up*. Now the URL is public but only your account
   exists. (Row-level security already scopes every row to its owner, so even a
   second account could never see your data — this just keeps the list at one.)

---

## 2. Hosting — Vercel (~8 min)

1. Push this branch to your GitHub repo (already done if you cloned it).
2. [vercel.com/new](https://vercel.com/new) → import the repo → framework
   auto-detects as Next.js.
3. Add environment variables before the first deploy:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | from Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from Supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | from Supabase |
   | `NEXT_PUBLIC_APP_URL` | `https://<your-app>.vercel.app` |
   | `APP_TIME_ZONE` | `Europe/Berlin` (or your training timezone) |
   | `CRON_SECRET` | any long random string |

   Every week is available without a payment flag. Stripe and the paywall have been removed.

   > Chicken-and-egg on `NEXT_PUBLIC_APP_URL`: deploy once, copy the URL Vercel
   > gives you, paste it in, redeploy.

4. Deploy. Open the URL, and **add it to your home screen** on the phone
   (Safari: Share → Add to Home Screen; Chrome: ⋮ → Add to home screen). It then
   opens fullscreen like an app.

### Crons on the free tier

`vercel.json` declares three scheduled jobs — nightly guardrails, the evening
check-in, and the Sunday review. Vercel's Hobby plan caps how many cron jobs a
project may have, so if a deploy complains, keep `/api/cron/macro` (the adaptive
guardrails — the one that matters) and delete the other two entries from
`vercel.json`. Nothing else breaks: the check-in and review are notification
conveniences, and both do nothing anyway until Telegram or Resend is configured.

---

## 3. First run (~3 min)

1. Open your URL → your plan, or onboarding if you have not signed in yet.
2. Sign in with your email — Supabase mails you a magic link. *(The built-in
   mailer is rate-limited but fine for one person. If the mail never arrives,
   check Supabase → Authentication → Logs.)*
3. Onboarding: division, level, training days, equipment, 5K time, race date.
4. You land on your week. Log sessions with one tap; the engine recalibrates and
   explains each change in the sidebar.

---

## Local instead of hosted?

If you'd rather keep everything on your machine (no cloud at all), you need
Docker for the local Supabase stack:

```bash
cp .env.example .env.local     # fill in the values printed by `supabase start`
npx supabase start             # prints URL + anon + service_role keys
npx supabase db reset          # migrations + seeds in one go
npm install && npm run dev     # http://localhost:3000
```

Trade-off: it only runs while your laptop is on and only on your home network —
which is exactly wrong for logging a session at the gym. Hence the hosted route
above.

---

## Optional extras, in the order they're worth it

| Add | Why | Needs |
|---|---|---|
| **Telegram bot** | Evening check-in with 4 buttons — log without opening the app. The single biggest adherence lever. | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` from [@BotFather](https://t.me/botfather); point its webhook at `/api/telegram/webhook` |
| **Strava or Garmin** | Runs auto-log themselves with real pace → sharper pace zones. | Developer app at either provider; see `.env.example` |
| **Anthropic key** | Post-session coach text gets rewritten in a warmer voice (numbers stay engine-computed). | `ANTHROPIC_API_KEY` |
| **Resend** | Email fallback for check-ins if you skip Telegram. | `RESEND_API_KEY`, `EMAIL_FROM` |

Garmin requires `GARMIN_WEBHOOK_SECRET` as well as OAuth credentials. Register
`https://<your-app>/api/garmin/webhook?token=<secret>` in the Garmin portal and keep
that URL private. No secret means the webhook rejects requests, including reachability checks.

## Updating an existing install (September 2026)

Back up the database. Apply migrations `0027_macro_idempotency.sql` and
`0028_transactional_session_logging.sql` before deploying the updated app. Do not
reset a live database. Configure the Garmin secret/Push URL and `APP_TIME_ZONE`.
Remove unused `STRIPE_*` and `PERSONAL_MODE` variables. Authentication and RLS remain necessary.
