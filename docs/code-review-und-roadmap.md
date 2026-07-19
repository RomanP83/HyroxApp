# Code Review & Implementierungs-Roadmap

**Stand:** 18.07.2026 · Review des MVP-Stands (Commit `7c89a60`, Engine v1.1)
**Referenz:** [`implementation-plan.md`](implementation-plan.md) — Pain-Point-Nummern (PP1–PP7) und Abschnitts-Verweise beziehen sich darauf.

---

## Teil 1 — Code Review

### 🔴 Kritisch (vor Beta beheben)

**K1 · Paywall-Leck: gesperrte Inhalte werden an den Client gesendet**
`src/app/plan/page.tsx:80` baut `clientSessions` inklusive aller Blöcke, Gewichte und Paces auf und übergibt sie an `PlanClient` — `locked` (`:104`) steuert nur die *Anzeige* in `SessionCard`. Jeder Nutzer kann den kompletten bezahlten Plan aus dem RSC-Payload lesen. → Fix: Blöcke serverseitig strippen, wenn `locked` (nur Titel/Typ/Dauer senden).

**K2 · Nightly-Cron rebased frische Pläne sofort**
`src/app/api/cron/macro/route.ts:48` setzt `daysSinceLastSession = 99`, wenn noch keine Logs existieren. Ein am Montag generierter Plan wird in der ersten Nacht rebased — mit der absurden Begründung „99 days without a session“. → Fix: Fallback auf `plans.generated_at` statt `99`.

**K3 · Verschobene Sessions sind nicht mehr loggbar**
`src/app/api/sessions/[id]/move/route.ts:30` setzt `status: "moved"`; `src/components/SessionCard.tsx:58` rendert die Quick-Log-Buttons aber nur bei `status === "planned"`. Wer eine Session verschiebt (PP3-Feature!), kann sie danach nicht mehr abschließen. → Fix: `moved` beim Rendering wie `planned` behandeln (oder Verschieben ohne Statuswechsel + Audit-Log behalten).

**K4 · `persistPlan` ist nicht atomar (und N+1)**
`src/lib/persistPlan.ts` führt pro Plan ~60–120 sequenzielle Einzel-Inserts aus, ohne Transaktion. Bricht ein Insert ab, bleibt ein verwaister Teilplan als „aktueller“ Plan zurück (die Plan-Seite lädt den neuesten). → Fix: eine Postgres-Function (RPC) nimmt den kompletten Plan-Baum als jsonb entgegen und schreibt ihn in einer Transaktion; nebenbei sinkt die Generierungszeit von Sekunden auf einen Roundtrip.

### 🟠 Mittel

**M1 · Telegram-Callback ohne Besitzer-Prüfung**
`src/app/api/telegram/webhook/route.ts` loggt jede `session_id` aus `callback_data`, ohne zu prüfen, ob `chat.id` zum `telegram_chat_id` des Plan-Besitzers gehört. Ein manipulierter Client kann fremde Sessions loggen (und damit fremde Pläne verstellen). → Fix: Join Session → Plan → Profil und `telegram_chat_id`-Abgleich vor dem Upsert.

**M2 · Der Telegram-Loop ist nur halb gebaut**
`quickLogKeyboard()` in `src/lib/telegram.ts` wird nirgends aufgerufen — es gibt keinen Versand des abendlichen Check-ins („Session heute gemacht?“). Der Webhook kann Antworten verarbeiten, die niemand je bekommt. Der Adherence- UND Daten-Hebel (PP5, §4) ist damit inaktiv. → Fix: zweiter Cron (`/api/cron/telegram-checkin`), der Nutzern mit heutiger geplanter Session die 4-Button-Nachricht schickt.

**M3 · Strength-Kalibrierung ist wirkungslos**
`adaptive.ts` auditiert bei Strength-Sessions `load_up/load_down ±5 %`, aber es gibt kein persistiertes Feld (z. B. `strength_modifier` in `athlete_state`) und `fill.ts` wendet nichts an. Die angezeigte Begründung verspricht eine Anpassung, die nie stattfindet — genau der Vertrauensbruch, den PP1 verbietet. → Fix: Feld ergänzen, in `fill.ts` auf `load_by_division` anwenden, Test ergänzen.

**M4 · ±3 %-Pace-Cap gilt pro Log, nicht pro Woche**
`capPace()` deckelt jede einzelne Anpassung; §5 verlangt „gecappt auf ±3 % pro Woche“. Wer 4× pro Woche loggt, kann ~12 % driften. → Fix: Cap gegen einen Wochen-Snapshot der Zonen rechnen (z. B. Zonenstand bei `last_recalc_at` ≥ 7 Tage).

**M5 · Makro-Direktiven werden nur teilweise angewendet**
`trim_week` (×0,85) und `ramp_up` landen nur im Audit-Log, reduzieren aber keine Session-Volumina; `rebase` markiert die Woche als `rebased`, generiert aber nichts neu („Rebase generiert immer ab heute neu“, §5/§7). Bewusste MVP-Lücke, aber die Begründungen im UI versprechen mehr, als passiert. → Roadmap Phase B.

**M6 · Benchmark-Erfassung fehlt komplett**
Tabellen, Prognose-Anbindung und Benchmark-*Sessions* existieren, aber es gibt kein UI/keine Route, um `benchmark_results` einzutragen. Der Woche-1-Benchmark läuft ins Leere; die Prognose kalibriert nie über Benchmarks. → Roadmap Phase B (kleines Formular + POST-Route).

**M7 · Jeder Generate-Aufruf erzeugt einen neuen aktiven Plan**
`/api/plans/generate` legt bei jedem Aufruf einen Plan an; Alt-Pläne bleiben `active`, eine Stripe-Zahlung hängt am alten Plan. → Fix: bestehende aktive Pläne des Profils auf `abandoned` setzen (oder bezahlten Plan schützen + Bestätigung verlangen).

**M8 · Cron-Route ist ohne `CRON_SECRET` öffentlich**
`cron/macro/route.ts:10` erlaubt unauthentifizierte Aufrufe, wenn die Env-Var fehlt — bequem lokal, gefährlich im Prod-Deploy mit vergessener Var. → Fix: in Production (`NODE_ENV`) hart ablehnen.

### 🟡 Klein

- **S1** · Stationsrotation ist 3× dupliziert (`fill.ts`, `adaptiveRunner.ts`, `demo/page.tsx`) — bei Änderung driftet die Kalibrierung von der Generierung weg. → `stationForWeek()` aus der Engine exportieren.
- **S2** · `?paid=1` nach Stripe-Checkout ist rein kosmetisch; der Webhook kann später ankommen als der Redirect → UI zeigt „unbezahlt“. → Verify-Endpoint oder kurzes Polling.
- **S3** · Middleware macht Auth-Refresh auch für `/api/*` (Webhooks brauchen das nie). → Matcher um `api/` erweitern.
- **S4** · `plan/page.tsx` crasht bei leerer `weekList` (`current` undefined) — nur bei korrupten Daten erreichbar, trotzdem guarden.
- **S5** · `any`-Casts an allen Supabase-Joins (`adaptiveRunner.ts`, `plan/page.tsx`). → `supabase gen types typescript` einführen.
- **S6** · `adaptiveRunner` lädt bei jedem Log *alle* Logs des Plans; das 28-Tage-Fenster gehört in die Query.
- **S7** · Der Browser-Smoke-Test (Playwright) existiert nur ad hoc im Scratchpad — als `e2e/`-Script + CI-Job committen.

### ✅ Was gut trägt

- Die Engine ist konsequent **pur und deterministisch** (kein Supabase-Import) — dieselben Funktionen laufen in API-Routen und im Browser-Demo; genau das macht die 27 Tests inkl. der 10 Simulationsläufe möglich.
- **Ein-Schritt-Regel, Zwei-Sessions-Bestätigung, Tier-Clamping** sind implementiert *und* durch Simulationstests abgesichert (keine Oszillation).
- Jede Engine-Aktion erzeugt eine **nutzerlesbare Ein-Satz-Begründung** + Audit-Zeile (PP1-Transparenz) — die Architektur dafür (reine Funktionen geben `adjustments[]` zurück) ist sauber.
- RLS-Modell ist schlüssig: user-scoped über `owns_profile`/`owns_plan`, Engine-Tabellen nur via Service-Role, Bibliothek read-only public.
- Interpolation für krumme Zeiträume (9/11/14 Wochen) mit garantiertem Taper — der klassische Template-Bruchpunkt ist getestet abgedeckt.

---

## Teil 2 — Implementierungsplan

Aufwände in Solo-Dev-Wochen à 15–20 h (wie §6 des Produktplans).

### Phase A — Korrektheit & Vertrauen ✅ umgesetzt (19.07.2026, Engine v1.2)

| # | Maßnahme | Behebt | Status |
|---|---|---|---|
| A1 | Gesperrte Blöcke serverseitig strippen | K1 | ✅ `plan/page.tsx` |
| A2 | Cron-Fallback auf `generated_at`; Prod-Pflicht für `CRON_SECRET` | K2, M8 | ✅ `cron/macro/route.ts` |
| A3 | `moved`-Sessions loggbar machen | K3 | ✅ `SessionCard.tsx` |
| A4 | `persistPlan` als Postgres-RPC (atomar + 1 Roundtrip) | K4 | ✅ Migration 0004 |
| A5 | Telegram-Ownership-Check | M1 | ✅ `telegram/webhook` |
| A6 | `strength_modifier` in `athlete_state` + Anwendung in `fill.ts` + Test | M3 | ✅ Migration 0005 |
| A7 | Wochen-Snapshot für den Pace-Cap + Test | M4 | ✅ `adaptive.ts` |
| A8 | Alt-Pläne bei Neu-Generierung auf `abandoned` | M7 | ✅ in RPC (0004) |
| A9 | `stationForWeek` in die Engine, Duplikate löschen | S1 | ✅ `fill.ts` Export |

### Phase B — MVP wirklich komplett ✅ umgesetzt (19.07.2026)

| # | Maßnahme | Bezug | Status |
|---|---|---|---|
| B1 | **Telegram-Check-in-Cron** + „Connect Telegram”-Karte im Plan-UI (HMAC-Deep-Link) | M2, PP5 | ✅ `cron/telegram-checkin`, 18:00 UTC |
| B2 | **Benchmark-UI + Route** mit Prognose-Update + Audit-Eintrag | M6, §2 | ✅ `/benchmarks` + `api/benchmarks` |
| B3 | **Makro-Direktiven anwenden**: trim ×0,85, ramp_up 2 Wochen ×0,8, Auto-Deload skaliert Sessions, Rebase generiert via `persist_plan` ab heute neu | M5, §5 | ✅ `rebasePlan.ts`, Migration 0006 |
| B4 | **Injury-Flag im UI** → Reha-Modus + Rebase bei Reaktivierung | §5 | ✅ `api/plans/injury` + Banner. Hinweis: Reha zeigt Banner/Low-Impact-Guidance; dedizierte Mobility-Wochen-Generierung → Phase C |
| B5 | **Event-Kalender**: Firecrawl-Scraper → `races`; Onboarding-Dropdown mit Custom-Fallback | §4 | ✅ `scripts/scrape_races.py` (erster Lauf manuell verifizieren) |
| B6 | Stripe-Verify-Endpoint statt `?paid=1` | S2 | ✅ `api/stripe/verify` |
| B7 | E2E-Smoke (Playwright) + CI (Typecheck, Tests, Build, E2E) | S7 | ✅ `e2e/` + `.github/workflows/ci.yml` |
| B8 | Typisierte Join-Shapes statt `any` (`dbTypes.ts` + `stateFromRow`) | S5 | ✅ Hinweis: echte Codegen (`supabase gen types`) folgt, sobald CI gegen eine Instanz läuft |

### Phase C — V2-Features ✅ umgesetzt (19.07.2026, außer C6)

1. **Fortschritts-Visualisierung** ✅ — `/progress`: KPI-Row, Wochen-Compliance (Bars), RPE Soll vs. Ist (2 Serien, validierte Palette), ACWR-Kurve (täglich aus der Log-Historie via `computeLoadState` rückgerechnet, Guardrail-Referenzlinien), Prognose-Verlauf, Benchmark-Small-Multiples. Pure Server-SVG nach Dataviz-Spezifikation (Marks, Legende, Tooltips, Data-Table je Chart).
2. **Strava-Sync (nur Läufe)** ✅ — OAuth (`/api/strava/connect|callback`, HMAC-State) + Webhook (`/api/strava/webhook`): neue Runs werden der passenden geplanten Lauf-Session zugeordnet und mit echter Pace gelogged → speist die bestehende Pace-Kalibrierung. Connect-Karte im Plan-UI.
3. **Wochen-Review** ✅ — `buildWeeklyReview()` + Sonntags-Cron `/api/cron/weekly-review` (17:00 UTC So): gelogged/Ziel, Engine-Änderungen mit Begründungen, Prognose, Vorschau nächste Woche. Telegram zuerst, E-Mail-Fallback.
4. **Subscription-Tier** ✅ (schlank) — `tier: “subscription”` im Checkout (`STRIPE_SUBSCRIPTION_PRICE_ID`), Webhook pflegt `subscription_status` am Profil über den Lifecycle, aktives Abo schaltet alle Pläne frei („Multi-racer? Subscribe instead”-Button).
5. **Home-/Minimal-Bibliothek** ✅ — 10 eigen-autorisierte Home-Blöcke je Station (Seed `0003_workout_blocks_home.sql`), explizite Kurzhantel-/Rucksack-Lasten.
6. **Doubles-Trainingslogik** ⏸ bewusst offen — laut §7 erst bauen, wenn Phase-0/Beta-Daten Doubles-Nachfrage zeigen.
7. **Nutrition-Basics pro Phase** ✅ — statischer Content je Phase inkl. Race-Week-Carb-Load (`src/lib/nutrition.ts`), Karte in der Wochenansicht.

### Phase D — Später / strategisch ✅ umgesetzt (19.07.2026)

- **DACH-SEO** ✅: deutsche Landingpage `/de` + Exact-Match-Keyword-Seiten `/de/hyrox-trainingsplan-{8,12,16}-wochen` (Phasen-Tabellen live aus `splitPhases()`, FAQ mit JSON-LD, hreflang-Alternates), `sitemap.xml` + `robots.txt`. Hinweis: App-UI (Onboarding/Plan) bleibt vorerst Englisch — vollständige App-i18n ist der nächste D1-Schritt.
- **Engine-Tuning-Infrastruktur** ✅: `engine_config`-Tabelle je `engine_version` (Migration 0007, geseedet mit den Literatur-Startwerten), `EngineTuning`-Override in Mikro- und Makro-Engine, Loader mit 5-min-Cache — Beta-Tuning per SQL-UPDATE statt Deploy. Beta-KPIs (`beta_kpis`-View + Telegram-Connect-Quote inkl. 30-%-Schwelle) über `GET /api/admin/kpis` (Bearer `CRON_SECRET`).
- **E-Mail-Fallback-Reminder** ✅: Check-in-Cron heißt jetzt `/api/cron/checkin` und schickt bei nicht verbundenem Telegram die Abend-Erinnerung via Resend (`RESEND_API_KEY`/`EMAIL_FROM`).
- **PWA + Push**, **Coach-Dashboard (B2B)** — weiterhin bewusst nicht gebaut, wie im Produktplan begründet. **Wearables**: auf expliziten Wunsch wurde zusätzlich zu Strava ein **Garmin-Sync (nur Läufe)** ergänzt — OAuth2/PKCE + Push-Webhook, gemeinsamer `autoLogRun`-Pfad mit Strava, keine HRV-/Recovery-Daten (der volle Wearable-Import bleibt offen).

### Empfohlene Reihenfolge

**A komplett → B1/B2/B3 → Beta-Start → Rest B parallel zur Beta → C nach ersten 50 zahlenden Nutzern.** Phase A ist nicht verhandelbar: K1 (Paywall), K2 (Rebase-Fehlschuss) und M3 (leeres Anpassungs-Versprechen) beschädigen genau das Vertrauen („erklärte Adaption statt Blackbox“), das das zentrale Verkaufsargument ist.
