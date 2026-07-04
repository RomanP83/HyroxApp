# Hyrox Periodization Hub – Implementierungsplan

**Version:** 1.1 · 04.07.2026 · Solo-Dev / Vibe-Coding-Kontext
**Basis:** Finaler Produkt-Prompt + zwei Pain-Point-Recherchen (Reddit/X/App-Store/Blogs)
**Änderung v1.1:** Adaptionslogik von grober Wochen-Ebene auf zweischichtige Engine (Mikro-Kalibrierung nach jeder Session + Makro-Guardrails) angehoben – running.COACH-Stil ohne Wearable-Pflicht. Betroffen: Abschnitte 2, 3, 5, 6, 7.

---

## 0. Pain-Point-Mapping (Leitplanken für alle Entscheidungen)

Bevor der Plan startet: Jede Feature- und Architektur-Entscheidung unten referenziert diese Pain Points (PP1–PP7). Das ist die Checkliste, gegen die jedes Feature bestehen muss.

| # | Pain Point (aus Recherche) | Produkt-Konsequenz |
|---|---|---|
| PP1 | „Random Workouts, keine Progression" – Apps wirken wie zufällige Workout-Sammlungen (Hyrox Workout Trainer Review, r/hyrox-Frust-Thread) | **Sichtbare Phasenstruktur**: Jede Woche zeigt Phase, Wochenziel und „Warum diese Woche so aussieht". Progression muss *erlebbar* sein, nicht nur intern existieren. |
| PP2 | Keine Individualisierung – identische Workouts für alle, unabhängig von Renndatum/Level (E15 £495-Kritik, RMR-Diskussion) | Onboarding erfasst Renndatum, Division, Stationen-Zeiten, 5K-Zeit, Trainingstage → Plan ist ab Tag 1 nachweisbar anders als der des Nachbarn. Gewichte/Distanzen/Reps **immer explizit** (Hauptkritik am „lazy AI"-Plan). |
| PP3 | Starre Pläne kollabieren bei Real-Life (verpasste Sessions, Fatigue) | **Adaptive Engine als Kern-Differenzierung**, nicht als Nice-to-Have. Verpasste Session ≠ kaputter Plan – und jede gelogte Session kalibriert den Plan nach. |
| PP4 | Taper/Peak-Unsicherheit („Rate my Taper", „2 weeks out"-Threads) | Dedizierter **Race-Week-/Taper-Modus** mit klarer, begründeter Logik – hoher wahrgenommener Wert, geringe technische Komplexität. |
| PP5 | Adherence > perfekter Plan („How much structure do you actually need") | Telegram-Check-ins, 1-Tap-Logging, 5-Minuten-Wochenreview (HYFIT-Muster). Reibungsarmes Logging schlägt Feature-Tiefe – gerade weil die feinere Engine Daten braucht. |
| PP6 | Fragmentierte Quellen (Runna + YouTube + Excel + Notizen) | Ein System: Plan + Tracking + Anpassung + Benchmarks. Excel-Planner auf Etsy = validierte Nachfrage, die wir absorbieren. |
| PP7 | Preissensitivität: Apps 10–30 €/Monat akzeptiert, Coaching 40–115 €/Monat, Einmalkäufe 25–80 € etabliert | Pricing im App-Korridor, nicht im Coaching-Korridor. Einmalpreis pro Race-Cycle als Anker (Benchmark: The Hyrox Coach 79,99 € / 12 Wochen). |

**Sprach-/Positionierungs-Flag:** Nutzer suchen „12-Week Hyrox Training Plan", nicht „Periodization". Marketing-Sprache = „Dein Plan bis zum Renntag", Periodisierung ist der *Mechanismus*, nicht der Pitch. Mit der v1.1-Engine kommt ein zweiter Pitch-Baustein dazu: „Dein Plan passt sich nach jedem Training an" (das zentrale Verkaufsargument von running.COACH, im Hyrox-Markt unbesetzt).

---

## 1. Phase 0 – Validierung (Woche 1–3, vor jeder Zeile Engine-Code)

**These, die validiert wird:** Zahlen selbst-trainierende Hyrox-Athleten 39 € für einen personalisierten 12-Wochen-Plan zu ihrem konkreten Renndatum – bevor eine App existiert?

### 1.1 Aufbau

**Landingpage (2–3 Tage, Bolt.new-Scaffold → Next.js auf Vercel):**

- Hero: „Dein 12-Wochen-Plan bis zu *deinem* Hyrox-Rennen. Kein Random-WOD-Feed." – direkt gegen PP1 positioniert.
- Social Proof über Pain-Zitate paraphrasieren („Kennst du das? Woche 3 brutal, Woche 4 trivial, kein roter Faden…") – die Recherche liefert die Sprache der Zielgruppe wörtlich.
- Mini-Onboarding-Formular als Teil des Kaufprozesses: Renndatum (Dropdown aus echten Events), Division, 5K-Zeit, Trainingstage/Woche, Equipment (Gym/Home). Das Formular *ist* der Personalisierungs-Beweis.
- Stripe Payment Link (39 €, einmalig) – kein Account, kein Backend nötig.
- Lieferung: PDF + Google-Sheet-Version innerhalb 48 h, manuell aus 3–4 vorbereiteten Master-Templates (8 / 10 / 12 / 16 Wochen × 3–4 Level) zusammengesetzt und per Hand angepasst. Aufwand pro Kunde: 30–45 min.

**Tech-Stack Phase 0 (bewusst minimal):**

| Baustein | Tool | Aufwand |
|---|---|---|
| Landingpage | Next.js (Bolt.new-Scaffold) + Vercel | 2–3 Tage |
| Payment | Stripe Payment Link | 1 h |
| Formular | Tally oder eigenes Form → Supabase-Tabelle `preorders` | 0,5 Tage |
| E-Mail-Zustellung | Resend (Transaktions-Mail) oder manuell | 0,5 Tage |
| Traffic | r/hyrox (Build-in-Public-Angle, kein Spam), Hyrox-Facebook-Gruppen, faktini/eigene Kanäle, evtl. 100–200 € Meta-Ads-Test | laufend |

**ValidaDoor-Synergie:** Die Landingpage kann als erster echter ValidaDoor-Use-Case laufen (Fake-Door-Mechanik ist hier aber *keine* Fake Door – es wird real geliefert, was Reputation in der kleinen Hyrox-Community schützt).

### 1.2 Kill-/Go-Kriterien (hart, vorher festlegen)

- **Go:** ≥ 10 zahlende Kunden in 3 Wochen bei ≤ 300 € Ad-Spend, ODER ≥ 5 Kunden rein organisch.
- **Pivot-Signal:** Viele E-Mail-Signups, aber < 3 Käufe → Preis/Format-Problem, nicht Pain-Problem → Einmalpreis-Varianten testen (29 € / 49 €).
- **Kill:** < 3 Käufe UND < 50 qualifizierte Signups → nicht bauen; Erkenntnisse ins Ideen-Decision-Log.

**Nebeneffekt unabhängig vom Ausgang:** Die manuell erstellten Pläne + Kundenfeedback werden das Trainingsdaten-Set für die spätere Engine. Jede manuelle Anpassung, die du machst, ist eine Regel, die später Code wird – das gilt in v1.1 doppelt, weil auch die Mikro-Kalibrierungsfaktoren (wie stark reagierst du auf „war zu leicht"?) aus dieser manuellen Phase kommen.

---

## 2. Priorisierte Feature-Liste

### Must-Have (MVP – zahlender Nutzer bekommt echten Kern-Wert)

| Feature | Begründung / Pain Point |
|---|---|
| Onboarding: Renndatum (aus Event-Kalender), Division, Level (5K-Zeit + 2–3 Stationen-Selbsteinschätzungen), Trainingstage/Woche, Equipment Gym/Home | PP2. Ohne das ist es „noch eine Workout-App". Stationen-Zeiten optional halten – Onboarding-Friktion niedrig. |
| Automatische Plan-Generierung: Base → Build → Peak → Taper, rückwärts vom Renndatum | Kernprodukt. PP1, PP4. |
| Compromised-Running-Sessions als eigener Session-Typ mit Progression | Hyrox-fachliche Glaubwürdigkeit; taucht in jedem ernsthaften Referenzplan auf. |
| Wochenansicht mit konkreten Sessions inkl. Warm-up, Main Work (mit **expliziten Gewichten/Distanzen/Reps je Division**), Mobility-Block | PP1, PP2. Die fehlenden Gewichte/Reps waren der wörtliche Kündigungsgrund im App-Store-Review. |
| „Warum diese Woche?"-Erklärung pro Woche (2–3 Sätze, aus Phase + Wochenindex generiert) | PP1. Macht Periodisierung *sichtbar* – das differenziert von RoxFit & Co. |
| **Adaptive Engine v1 (zweischichtig):** Mikro-Kalibrierung nach jeder gelogten Session (RPE-Delta → Pace-/Tier-/Load-Anpassung ±1 Stufe, stationsspezifische Tiers, Pacezonen-Update) + Makro-Guardrails (sRPE-Load/ACWR-Überwachung, Auto-Deload, Rebase bei Pause, Injury-/Reha-Modus) | PP2, PP3. Das ist die running.COACH-Parität („Plan passt sich nach jedem Training an") ohne Wearable-Pflicht – Details in Abschnitt 5. |
| **1-Tap-Logging „✅ Wie geplant"** (schreibt Planwerte als Ist-Werte); Abweichungen optional per RPE-Slider + Kurz-Eingabe | PP5. Die feinere Engine braucht Daten – aber Friktion bleibt der Feind der Adherence. Der 1-Tap-Default löst den Konflikt: volle Datenqualität im Normalfall, Eingabe nur bei Abweichung. |
| **Zielzeit-Prognose v1** (gewichtete Benchmark-Formel, nach jedem Log/Benchmark aktualisiert) | running.COACHs zweites Kern-Verkaufsargument; mit `athlete_state` ohnehin fast geschenkt. Bewusst als „Schätzung" gelabelt, bis Beta-Daten die Formel kalibrieren. |
| Benchmark-Protokoll: Start / Mid / Pre-Race (1 km, Wall Balls max, Row 1000 m o. ä.) | Fortschritt beweisbar machen; füttert Pacezonen + Prognose. |
| Deload-Wochen fest in der Phasenlogik | Fachlicher Standard; Kritikpunkt an „random" Plänen ist genau das Fehlen davon. |
| Telegram-Reminder/Check-in mit Quick-Log-Buttons: „Wie geplant / Härter als gedacht / Leichter als gedacht / Skip" | PP5. Die vier Buttons mappen direkt auf RPE-Deltas → füttern die Mikro-Kalibrierung, ohne dass der Nutzer die App öffnet. |
| Stripe: Einmalkauf „Race Cycle" (Onboarding→Renntag) + Free-Preview (Woche 1 sichtbar, Rest gesperrt) | PP7. Einmalpreis pro Rennen matcht das mentale Modell („Plan für MEIN Rennen"), Benchmark 79,99 €. |
| Manuelles Verschieben/Tauschen von Sessions innerhalb der Woche | PP3, geringer Aufwand, hohe gefühlte Kontrolle. |

### Should-Have (V2 – nach ersten 50–100 zahlenden Nutzern)

| Feature | Begründung |
|---|---|
| **Strava-Sync (nur Läufe)** als erster Wearable-Schritt: gelaufene Paces fließen automatisch in Pacezonen-Kalibrierung | Eine einzige API statt Garmin/Coros/Polar-Zoo; ersetzt manuelle Laufzeit-Eingabe und bringt die Mikro-Adaption auf running.COACH-Niveau beim Laufteil. |
| Subscription-Tier zusätzlich zum Einmalkauf (Mehrfach-Racer, Off-Season-Modus) | Erst wenn Retention-Daten zeigen, dass Nutzer nach dem Rennen bleiben wollen. |
| Zielzeit-Prognose v2: kalibriert mit Session-Ist-Daten + Stationen-Splits | Ausbau der MVP-Formel, sobald echte Log-Daten die Gewichte liefern. |
| Volle Home-/Minimal-Equipment-Alternativen je Übung | MVP: Flag Gym/Home mit 1 Alternative pro Station; V2: vollständige Scaling-Bibliothek. |
| Nutrition-Basics pro Phase (statischer Content, Race-Week Carb-Loading) | Wertvoll, aber Content statt Code → nach Engine. |
| Fortschritts-Visualisierung (Wochen-Compliance, Benchmark-Verlauf, RPE-Trend, ACWR-Kurve) | PP5/PP7-Feedback-Wunsch; die Daten liegen dank Engine v1 bereits vor, es fehlt nur UI. |
| Doubles-spezifische Planlogik (Partner-Workouts, geteilte Stationen) | Divisions-Gewichte sind MVP, echte Doubles-*Trainingslogik* ist V2. |

### Nice-to-Have (später)

- **Coach-Dashboard (B2B):** erst wenn organisch Coaches anfragen; komplett anderes Produkt (Multi-Tenant, Kommunikation).
- **Voller Wearable-Import (Garmin/Coros/Whoop, HRV/Recovery):** hohe Integrationskosten; Strava-Sync (V2) + RPE decken 80 % des Signals ab.
- **Community-Layer** („Athleten mit gleichem Renndatum"): Engagement-Idee, aber Moderationsaufwand für Solo-Dev.
- **Native App / PWA-Push:** PWA + Telegram deckt Mobile ab; native App erst bei nachgewiesener Retention.

---

## 3. Datenmodell (Supabase / Postgres)

Zentrale Entitäten mit konkreten Feldern. RLS überall (user-scoped), Templates/Bibliothek read-only public.

```
users (Supabase Auth) ──1:1── athlete_profiles ──1:1── athlete_state
athlete_profiles ──1:n── plans ──1:n── plan_phases ──1:n── plan_weeks ──1:n── sessions
sessions ──n:m── workout_blocks (via session_blocks)
sessions ──1:0..1── session_logs
athlete_profiles ──1:n── benchmark_results
plans ──n:1── races (Event-Kalender)
plans ──1:n── plan_adjustments
```

**`athlete_profiles`**
`id, user_id (FK auth.users), division (enum: open|pro|doubles|masters_*), experience_level (enum: beginner|intermediate|advanced), five_k_seconds, station_estimates (jsonb: {ski_erg_1000m: sec, wall_balls_max: reps, ...}), training_days_per_week (int 3–6), equipment_access (enum: full_gym|home_minimal|hybrid), telegram_chat_id, created_at`

**`athlete_state`** *(neu in v1.1 – der „lebende" Fitness-Zustand, wird ausschließlich von der Engine geschrieben)*
`profile_id (PK, FK athlete_profiles), acute_load_7d (numeric – Summe sRPE letzte 7 Tage), chronic_load_28d (numeric – Ø-Wochenload letzte 28 Tage), acwr (numeric – acute/chronic), pace_zones (jsonb: {easy_sec_km, tempo_sec_km, interval_sec_km, race_sec_km}), station_tiers (jsonb: {ski_erg: 2, sled_push: 1, sled_pull: 1, burpee_broad_jump: 2, row: 2, farmers_carry: 1, sandbag_lunges: 1, wall_balls: 2}), predicted_race_time_sec (int), last_recalc_at`

**`races`** (gescrapte Event-Daten)
`id, name, city, country, event_date, division_availability (jsonb), source_url, scraped_at`

**`plans`**
`id, profile_id, race_id (nullable, FK races), race_date (date – auch ohne Event wählbar), status (enum: active|completed|paused|abandoned|rehab), total_weeks (int), generated_at, engine_version (text – wichtig für spätere Regel-Iterationen!), stripe_payment_id`

**`plan_phases`**
`id, plan_id, phase_type (enum: base|build|peak|taper), sort_order, start_week, end_week, focus_description (text), volume_multiplier (numeric)`

**`plan_weeks`**
`id, phase_id, week_number (int, 1-basiert), is_deload (bool), is_benchmark_week (bool), weekly_goal (text – die „Warum diese Woche"-Erklärung), target_sessions (int), status (enum: upcoming|current|completed|rebased)`

**`sessions`**
`id, week_id, day_hint (int 1–7, verschiebbar), session_type (enum: run_easy|run_intervals|compromised_run|strength|station_work|full_sim|mobility|benchmark|rest), title, planned_duration_min, intensity_rpe_target (int 1–10), status (enum: planned|done|skipped|moved), sort_order`

**`workout_blocks`** (wiederverwendbare Bibliothek – eigenes IP, siehe Risiken)
`id, block_type (enum: warmup|main|mobility|finisher), station (enum: ski_erg|sled_push|sled_pull|burpee_broad_jump|row|farmers_carry|sandbag_lunges|wall_balls|run|general, nullable), content (jsonb: [{exercise, sets, reps, load_by_division: {open: "…", pro: "…"}, distance_m, rest_sec}]), equipment_variant (enum: gym|home), difficulty_tier (int 1–3), tags (text[])`

**`session_blocks`** (Join)
`session_id, block_id, sort_order, load_adjustments (jsonb – von der Engine gerenderte, profil-spezifische Overrides der Template-Loads inkl. Tier/Pacezone zum Generierungszeitpunkt)`

**`session_logs`** *(erweitert in v1.1)*
`id, session_id, completed_at, completed_as_planned (bool, default true – der 1-Tap-Fall), rpe_actual (int), duration_actual_min, block_results (jsonb, nullable – nur bei Abweichung befüllt: [{block_id, load_actual, reps_actual, pace_actual_sec_km}]), notes (text)`
→ Beim 1-Tap „Wie geplant" schreibt die Engine die Planwerte automatisch als Ist-Werte (rpe_actual = intensity_rpe_target, duration_actual = planned_duration). Telegram-Buttons „Härter/Leichter als gedacht" setzen rpe_actual = target ± 2.

**`benchmark_definitions`** / **`benchmark_results`**
`benchmark_definitions: id, name, metric_type (enum: time_sec|reps|distance_m), protocol (text)`
`benchmark_results: id, profile_id, benchmark_id, plan_id, phase_context (enum: start|mid|pre_race), value, recorded_at`

**`plan_adjustments`** (Audit-Log der adaptiven Engine – Gold für Debugging, Tuning & spätere ML)
`id, plan_id, layer (enum: micro|macro), trigger (enum: session_logged|missed_session|pause|acwr_high|acwr_low|rpe_trend|manual_move|injury_flag|benchmark_result), action_taken (jsonb – z. B. {type: "tier_up", station: "wall_balls", from: 1, to: 2}), created_at`

---

## 4. Architektur-Skizze

```
┌─────────────────────────────────────────────────────────┐
│  Next.js (Vercel) – App Router                          │
│  • Marketing/SEO-Seiten („12-Week Hyrox Plan …")        │
│  • Onboarding-Wizard → POST /api/plans/generate         │
│  • Wochenansicht, 1-Tap-Logging-UI, Benchmark-UI,       │
│    Prognose-Anzeige                                     │
│  • Stripe Checkout + Webhook (/api/stripe/webhook)      │
└───────────────┬─────────────────────────────────────────┘
                │ Supabase JS Client (RLS) + Server Actions
┌───────────────▼─────────────────────────────────────────┐
│  Supabase                                               │
│  • Postgres (Datenmodell oben) + Auth + RLS             │
│  • Edge Function: plan-engine                           │
│    – generate: Plan-Erstellung                          │
│    – recalc-micro: Trigger auf INSERT session_logs      │
│      (sRPE-Load, Tier-/Pace-Kalibrierung, Prognose)     │
│    – recalc-macro + Rebase: via pg_cron (nightly)       │
│      (ACWR-Guardrails, Auto-Deload, Week-Rollover)      │
└───────┬───────────────────────────────┬─────────────────┘
        │                               │
┌───────▼───────────────┐   ┌───────────▼─────────────────┐
│  n8n (self-hosted)    │   │  Python-Pipeline (lokal/    │
│  • Telegram-Bot:      │   │  Cron): Firecrawl/Apify →   │
│    Wochen-Check-ins,  │   │  races-Tabelle (Hyrox-      │
│    Session-Reminders, │   │  Eventkalender-Scrape)      │
│    4-Button-Quick-Log │   │  Läuft 1×/Woche, schreibt   │
│    → session_logs     │   │  via Supabase Service Key   │
└───────────────────────┘   └─────────────────────────────┘
```

**Design-Entscheidungen:**

- **Plan-Engine als Supabase Edge Function (TypeScript), nicht Python-Service.** Ein Deployment-Ziel weniger; die Engine ist deterministische Logik ohne Heavy Compute. Die Mikro-Rekalkulation läuft als DB-Webhook/Trigger auf `session_logs`-Inserts – jeder Log stößt genau einen Engine-Lauf an. Python bleibt reines Scraping-Tool.
- **Telegram-Quick-Log ist der heimliche Adherence- UND Daten-Hebel (PP5):** Bot fragt abends „Session heute gemacht?" → 4 Inline-Buttons (Wie geplant / Härter / Leichter / Skip) → schreibt direkt in `session_logs` → triggert die Mikro-Kalibrierung. Der Nutzer füttert die adaptive Engine, ohne die Web-App zu öffnen.
- **Kein LLM im Plan-Kern.** LLM optional nur für die `weekly_goal`-Formulierungen (einmalig bei Generierung, gecacht). Plan und Adaption müssen deterministisch, testbar und erklärbar sein – „lazy AI" ist wörtlich der Vorwurf an den Wettbewerb (PP1). Jede Anpassung bekommt eine regelbasierte Begründung, die dem Nutzer angezeigt wird („Wall Balls hochgestuft, weil die letzten 2 Sessions leichter waren als geplant").
- **Stripe:** MVP = Checkout mit einmaligem `race_cycle`-Preis; Webhook setzt `plans.status = active`. Subscription-Infra erst V2.

---

## 5. Periodisierungs-Logik: Hybrid (Template-Makro + Regel-Mikro)

### Bewertung der Optionen

| Ansatz | Pro | Contra |
|---|---|---|
| Rein regelbasiert | Maximal flexibel, jede Wochenzahl | Sehr viel Sportwissenschaft in Code gießen; schwer zu QA-en; Solo-Dev-Falle |
| Rein Template-basiert | Schnell, qualitativ kontrollierbar | Genau der „Copy-Paste"-Vorwurf (PP2); bricht bei krummen Zeiträumen (z. B. 9 Wochen bis Rennen) |
| **Hybrid (Empfehlung)** | Templates sichern fachliche Qualität, Regeln liefern Individualisierung + Adaption | Zwei Systeme zu pflegen – aber sauber getrennt beherrschbar |

### Konkreter Ablauf der Engine

**Schritt 1 – Makro (Template):** `weeks_to_race` → Phasen-Split über Lookup + Interpolation:

| Wochen bis Rennen | Base | Build | Peak | Taper |
|---|---|---|---|---|
| 16 | 6 | 6 | 3 | 1 |
| 12 | 4 | 5 | 2 | 1 |
| 10 | 3 | 4 | 2 | 1 |
| 8 | 2 | 3 | 2 | 1 |
| < 8 | 0–1 | Rest | 2 | 1 (Taper ist nie verhandelbar → PP4) |

Deloads: jede 4. Woche in Base/Build (`is_deload = true`, Volumen ×0,6). Benchmark-Wochen: Woche 1, Ende Build, Start Taper.

**Schritt 2 – Mikro (Regeln):** Pro Woche werden Session-Slots nach `training_days_per_week` verteilt, mit Prioritätsreihenfolge je Phase. Beispiel Build-Phase, 4 Tage: `[compromised_run, strength, station_work, run_intervals]`; bei 3 Tagen fällt der niedrigst-priorisierte Slot weg, bei 5 kommt `run_easy` dazu. Compromised-Running-Anteil steigt Base → Peak (Base: 1×/2 Wochen, Build: 1×/Woche, Peak: 2×/Woche inkl. 1 Full-Sim).

**Schritt 3 – Befüllung:** Jeder Slot zieht `workout_blocks` per Filter (session_type, equipment_variant, Station-Rotation über die Woche). Statt statischem `difficulty_tier` aus dem Level nutzt die Befüllung ab v1.1 die **live `station_tiers` und `pace_zones` aus `athlete_state`** – d. h. dieselbe Woche wird für denselben Nutzer zwei Wochen später anders gerendert, wenn sich sein Zustand geändert hat. Loads aus `load_by_division` + Tier-Skalierung, Laufpaces aus den aktuellen Pacezonen.

**Schritt 4 – Adaptive Engine v1 (zweischichtig, das v1.1-Herzstück):**

*Layer 1 – Mikro-Kalibrierung (Trigger: jeder `session_logs`-Insert):*

1. **Load-Update:** sRPE-Load = `rpe_actual × duration_actual_min` → `acute_load_7d` / `chronic_load_28d` in `athlete_state` neu berechnen.
2. **Ziel-Kalibrierung pro Session-Typ:** Delta = `rpe_actual − intensity_rpe_target`. Delta ≤ −2 in zwei aufeinanderfolgenden Sessions gleichen Typs → nächste Session dieses Typs **eine Stufe hoch** (Laufpace −5 s/km, oder `station_tier` +1, oder Load +5 %). Delta ≥ +2 → eine Stufe runter, sofort (Überlastung wird schneller korrigiert als Unterforderung). **Ein-Schritt-Regel:** nie mehr als eine Stufe pro Anpassung – verhindert Oszillation.
3. **Stationsspezifisch statt global:** Jede der 8 Stationen hat ihren eigenen Tier in `station_tiers`; Wall-Ball-Logs bewegen nur den Wall-Ball-Tier. Genau das fehlt allen kritisierten Apps (PP2: „gleiche Workouts unabhängig von Stärken/Schwächen").
4. **Pacezonen-Update:** Benchmarks + gelogte Laufzeiten (manuell, später Strava) rechnen die Zonen über einen einfachen Äquivalenz-Faktor neu, **gecappt auf ±3 % pro Woche** (kein Runaway durch einen Ausreißer-Lauf).
5. **Prognose-Update:** `predicted_race_time_sec` aus gewichteter Benchmark-Formel neu berechnen; UI zeigt Trend („−2:10 seit Planstart").

*Layer 2 – Makro-Guardrails (nightly pg_cron):*

- **ACWR-Wächter:** `acwr > 1,3` → Restwoche Volumen ×0,85 + erklärter Hinweis; `acwr > 1,5` ODER Ø-RPE ≥ 8,5 über 14 Tage → **Auto-Deload**: nächste Woche wird Deload-Woche, Phasen-Split ab dort neu gerechnet. `acwr < 0,8` nach Pause → gedrosselter Wiedereinstieg (2 Wochen Ramp-up statt Voll-Volumen).
- **Verpasste Session:** höchst-priorisierte verbleibende Sessions bleiben, niedrigste entfällt ersatzlos (kein „Nachholen-Stau" – klassischer DIY-Fehler aus der Recherche).
- **≥ 7 Tage inaktiv → Rebase:** aktuelle Woche wird als Mini-Deload neu generiert, Phasen-Split ab heute neu gerechnet.
- **Injury-Flag → Reha-Modus** (`plans.status = rehab`): Mobility-/Low-Impact-Wochen statt Plan-Stopp (das Pendant zu running.COACHs gelobtem Reha-Plan), Rebase bei Reaktivierung.

*Transparenz-Regel (PP1):* Jede Engine-Aktion landet in `plan_adjustments` **und** wird dem Nutzer als Ein-Satz-Begründung angezeigt. Adaption ohne Erklärung fühlt sich an wie die „Random Workouts", gegen die wir antreten.

**Ehrliche Einordnung:** Das ist funktional running.COACHs „automatic adjustment after each workout" – aber mit RPE + 1-Tap-Logs als Signalquelle statt Wearable-Stream. Die Kalibrierungsfaktoren (±1 Stufe, ±3 %-Cap, ACWR-Schwellen 0,8/1,3/1,5) sind Startwerte aus der Trainingsliteratur, keine gesicherten Konstanten – sie werden in der Beta mit echten Logs getunt (deshalb das Audit-Log ab Tag 1).

---

## 6. Wochenweiser Build-Plan (Solo, Vibe-Coding-Tempo)

| Woche | Baustein | Deliverable |
|---|---|---|
| **1–3** | **Phase 0** (parallel: Master-Templates in Sheets bauen = spätere `workout_blocks`) | Landingpage live, ≥ 10 Verkäufe oder Kill |
| 4 | Supabase-Setup: Schema inkl. `athlete_state`, RLS, Auth; Next.js-Projekt, Onboarding-Wizard (UI) | Registrierung + Profil speicherbar |
| 5 | Content-Woche: 60–80 `workout_blocks` aus Phase-0-Templates strukturieren (jsonb), `benchmark_definitions`, Divisions-Load-Tabellen, Tier-Stufen je Station definieren | Bibliothek in DB, fachlich gegengeprüft |
| 6–7 | Plan-Engine v1 (Edge Function): Makro-Split, Slot-Verteilung, Block-Befüllung aus `athlete_state`, `weekly_goal`-Texte. Unit-Tests gegen 5 Referenzprofile (8/10/12/16 Wochen × Level) | Generierter Plan, den du selbst 1 Woche trainieren würdest |
| 8 | Wochenansicht + Session-Detail + 1-Tap-Logging-UI (Wie geplant / Abweichung / Skip) + Session-Verschieben | Kern-UX komplett |
| 9 | Stripe Checkout (Einmalkauf) + Free-Preview-Gating + Webhook | Zahlbar |
| 10 | Telegram-Bot via n8n: Onboarding-Link (HMAC-Deep-Link wie bei miofatturato), Wochen-Check-in, 4-Button-Quick-Log → `session_logs` | Adherence- & Daten-Loop live |
| **11–12** | **Adaptive Engine v1:** Mikro-Trigger auf `session_logs` (Load, Tier-/Pace-Kalibrierung, Prognose v1), Makro-Cron (ACWR, Auto-Deload, Rebase, Reha-Modus), `plan_adjustments` + Begründungs-UI. Simulations-Tests: 10 synthetische Athleten-Verläufe (konsistent / chaotisch / überlastet / Pause) durchspielen | Plan passt sich nachweisbar & erklärt an; keine Oszillation in Simulationen |
| 13 | Benchmark-UI + Prognose-Anzeige; Event-Kalender-Scraper (Python + Firecrawl, 1×/Woche) + Onboarding-Integration; Polish, Fehlerzustände, Mobile-QA | Beta-ready |
| 14 | Closed Beta mit Phase-0-Käufern (App-Zugang gratis als Upgrade). **Engine-Tuning mit echten Logs** (Schwellen/Faktoren justieren, `engine_version` hochziehen) | 10–20 echte Nutzer, kalibrierte Engine |
| 15 | Beta-Fixes, Onboarding-Friktion messen/senken, Public Launch (r/hyrox Build-in-Public-Post, eigene Kanäle) mit Pitch „passt sich nach jedem Training an" | Launch |

Realistisch: **~15 Wochen bis Public Launch inkl. Validierung** (+1–2 Wochen ggü. der groben v1.0-Adaption), bei ~15–20 h/Woche. Wahrscheinlichste Überzieher: Content-Woche 5, Engine-Wochen 6–7 und die Adaptions-Wochen 11–12 (+1–2 Wochen Puffer). Fallback, falls Woche 11–12 explodiert: Layer 2 (Makro-Guardrails) shippen, Layer 1 (Mikro-Kalibrierung) als schnelles Post-Launch-Update – die Datensammlung läuft ab Tag 1 ohnehin.

---

## 7. Risiken & offene Fragen

**Copyright bei Trainingsprogrammen (hoch, aber lösbar):** Trainingsprinzipien (Periodisierung, Compromised Running, Taper-Logik) sind nicht schutzfähig – konkrete Planwerke (PureGym-PDF, Mainathlet etc.) schon. Strategie: Quellen als *Fachrecherche* nutzen, aber jede Session-Struktur und jeden Block eigenständig formulieren (`workout_blocks` = eigenes IP). Niemals scrapen-und-umformatieren; die Python-Pipeline scrapt **nur den Event-Kalender**, keine Trainingsinhalte. Phase 0 zwingt ohnehin zur eigenen Template-Erstellung.

**Grenzen ggü. echtem 1:1-Coaching (mittel):** Auch die feinere Engine sieht keine Technik, keine Lebensumstände, keine Verletzungshistorie. Ehrlich positionieren: „strukturierter als jede App, günstiger als jeder Coach" – nicht „ersetzt Coaching". Disclaimer + Injury-Flag/Reha-Flow sind auch Haftungs-Hygiene (Healthcare-adjacent: kein medizinischer Rat, klare Nutzungsbedingungen).

**Technisches Risiko der Adaption (v1.1: mittel-hoch):** Die zweischichtige Engine ist der anspruchsvollste Baustein des Produkts. Drei konkrete Gefahren und Gegenmittel: (1) *Falsche Kalibrierungsfaktoren* – Startwerte sind Literatur-Schätzungen; Gegenmittel: alles deterministisch, jede Aktion im `plan_adjustments`-Log, Tuning in der Beta, `engine_version` pro Plan. (2) *Oszillation/Runaway* – Gegenmittel: Ein-Schritt-Regel, ±3 %-Pace-Cap, Zwei-Sessions-Bestätigung vor Hochstufung. (3) *Rebase-Edge-Cases* (Rennen verschoben, mehrfache Pausen, Phasenwechsel mitten in der Woche) – Gegenmittel: Rebase generiert immer *ab heute neu* statt alte Wochen zu mutieren, plus die 10 Simulations-Verläufe als Regressionstests. Wichtigster Schutz: Der 1-Tap-Default garantiert Datenqualität – eine adaptive Engine mit Müll-Input ist schlimmer als keine.

**Datenqualitäts-Risiko (neu in v1.1, mittel):** Die Mikro-Kalibrierung steht und fällt mit ehrlichem RPE-Logging. Nutzer, die alles per 1-Tap „wie geplant" bestätigen, bekommen faktisch die v1.0-Erfahrung (nur Makro-Guardrails greifen) – das ist ein akzeptabler Degradations-Pfad, kein Bruch. Beta-Metrik: Anteil der Logs mit echtem RPE-Input.

**Markt-/Wettbewerbsrisiko (real):** RoxFit (170k+ Athleten) und RMR haben Reichweite; FORMD & Co. entstehen aus demselben Frust. Deine Nische: **selbst-trainierende DACH/IT-Athleten** (mehrsprachige Lokalisierung als Distributionsvorteil – RoxFit/RMR sind englischzentriert) + sichtbare, erklärte Adaption statt Blackbox. Hyrox wächst in DACH stark; lokalisierte SEO-Seiten („Hyrox Trainingsplan 12 Wochen") sind ein unbesetzter Kanal.

**Offene Fragen für Phase 0:**
1. Konvertiert 39 € einmalig besser als 12–15 €/Monat? (Beides testbar via zwei Payment Links.)
2. Wollen Käufer PDF/Sheet behalten oder drängen sie selbst zur App? (Signal für App-Dringlichkeit.)
3. Welche Divisionen kaufen? (Doubles-Anteil entscheidet, wie früh Doubles-Logik nötig ist.)
4. Wie viele Nutzer verbinden Telegram wirklich? (Falls < 30 %: E-Mail-Reminder als Fallback in V2 vorziehen – für die Mikro-Engine ist der Quick-Log-Kanal jetzt noch wichtiger.)
5. Neu: Wie oft weichen Phase-0-Kunden von den gelieferten Plänen ab, und wie? (Direkte Empirie für die Kalibrierungsfaktoren der Engine.)
