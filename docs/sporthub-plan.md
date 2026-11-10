# Sporthub — Implementierungsplan

Persönlicher Hub für einen einzigen Nutzer. Er trägt die Daten aus **HyroxApp** (Plan, Einheiten,
Läufe, Benchmarks, Rennen) und **HyroxStrengthTracker** (Krafteinheiten, Sätze, Ziele) zusammen und
beantwortet Fragen dazu über eine KI.

## 0. Getroffene Entscheidungen

| Frage | Entscheidung |
|---|---|
| Wo lebt der Hub? | Eigene neue App: eigenes Repo, eigenes Vercel-Projekt, eigene Datenbank |
| Strength Tracker → Hub | Automatischer Sync im Hintergrund, `localStorage` bleibt die Quelle |
| KI-Modell | Gemini (vorhandener `GEMINI_API_KEY`) |
| Datenumfang | Nur die beiden Apps. Garmin-Läufe kommen über HyroxApp mit |

Annahmen, die ich ohne Rückfrage gesetzt habe — bitte widersprechen, falls falsch:

- Oberfläche auf Deutsch, mobil zuerst, als PWA installierbar (wie beide Apps).
- Der Hub **liest nur**. Er ändert weder den Plan in HyroxApp noch Daten im Tracker.
- Vercel-Hobby-Tarif: Cron höchstens täglich. Aktualität kommt daher zusätzlich über
  „beim Öffnen synchronisieren" und einen Knopf.
- Eigenes Supabase-Projekt für den Hub (der Gratis-Tarif erlaubt zwei aktive Projekte; HyroxApp
  belegt eines).

## 1. Ausgangslage

**HyroxApp** — Next.js 15, Supabase (Postgres, Auth, RLS), Vercel `fra1`.
`GET /api/export` liefert bereits alles in einer Datei (`format: 1`): Profil, Pläne, Wochen,
Sessions, Session-Logs, Benchmarks, Rennergebnisse, `garmin_runs`, `garmin_fitness`,
Kraft-Templates und `strength_set_logs`. Der Endpunkt verlangt aber ein Browser-Login (Cookie) —
eine andere App kann ihn nicht aufrufen.

**HyroxStrengthTracker** — eine statische `index.html`, kein Backend. Daten in `localStorage`
(`hst:sessions`, `hst:drafts`, `hst:goals`). Eine Einheit:

```json
{ "id": "…", "workoutDay": "A", "performedAt": "2026-11-09", "createdAt": "…", "notes": "",
  "entries": [{ "exerciseId": "back-squat", "value": 100, "reps": "5 / 5 / 4", "sets": [ … ] }] }
```

Der Übungskatalog (`EXERCISES`: Name, Metrik `kg`/`kgEach`/`meters`/`reps`, Start, Ziel) steht nur
im Script.

**Folge:** HyroxApp wird vom Hub *abgeholt* (Pull), der Tracker muss *senden* (Push).

## 2. Architektur

```
HyroxStrengthTracker (Browser, localStorage)
        │  POST /api/ingest/strength   (Bearer-Token, nach jedem Speichern)
        ▼
┌──────────────────────── Sporthub (Next.js, Vercel fra1) ────────────────────────┐
│  Ingest  →  Rohdaten (raw_snapshots)  →  Normalisierung  →  Hub-Tabellen        │
│  UI: Übersicht · Verlauf · Kraft · Laufen · Fragen (KI) · Quellen               │
│  KI: Gemini mit Werkzeug-Aufrufen gegen die Hub-Tabellen (nur lesend)           │
└──────────────────────────────────────────────────────────────────────────────────┘
        ▲
        │  GET /api/hub/export   (Bearer-Token; täglich per Cron + beim Öffnen + Knopf)
HyroxApp (Supabase)
```

Stack wie HyroxApp, damit nichts Neues zu lernen ist: Next.js App Router, TypeScript, Tailwind,
Supabase, zod, vitest, Playwright.

## 3. Datenmodell des Hubs

Zwei Schichten: Rohdaten zum Wiederaufbauen, normalisierte Tabellen zum Abfragen.

| Tabelle | Inhalt |
|---|---|
| `sources` | Je Quelle: `key` (`hyroxapp`, `strength`), letzter Sync, Status, Fehlertext |
| `sync_runs` | Protokoll jedes Syncs: Start, Dauer, gelesen / neu / geändert, Fehler |
| `raw_snapshots` | Unveränderte Nutzlast je Sync (`jsonb`), die letzten 30 je Quelle |
| `workouts` | **Eine Zeile je absolvierter oder geplanter Einheit**, quellenübergreifend |
| `strength_sets` | Ein Satz: `workout_id`, `exercise_key`, Satznummer, Wdh., Last, Metrik |
| `exercises` | Übungskatalog mit Aliassen, Metrik, Start- und Zielwert |
| `daily_metrics` | Je Tag: VO2max, Rennprognosen (aus `garmin_fitness`) |
| `benchmarks` | Benchmark-Ergebnisse: Datum, Name, Wert, Einheit |
| `race_results` | Rennergebnisse mit Splits |
| `plan_weeks` | Planrahmen: Woche, Phase, Deload, Renndatum, Wochenziel |
| `chat_threads`, `chat_messages` | Verlauf der KI-Gespräche inkl. ausgeführter Werkzeug-Aufrufe |

`workouts` (Kern):

```
id, source, source_id            unique (source, source_id)  → Sync ist idempotent
date, started_at
kind        run | strength | station | hybrid | other
status      planned | done | skipped
title, duration_min, rpe, distance_m, avg_hr, max_hr, elevation_m, notes
linked_workout_id                → Dubletten-Verknüpfung (siehe unten)
deleted_at
```

Views für UI und KI: `v_week_summary` (Einheiten, Laufkilometer, Kraftvolumen, Dauer je Woche),
`v_exercise_progress` (bester Satz und geschätztes 1RM je Übung und Tag), `v_records`.

**Dubletten.** Zwei Stellen, an denen dasselbe Training doppelt ankommt:

1. *Kraft:* HyroxApp plant „Kraft Tag A", geloggt wird im Tracker. Regel: gleicher Tag +
   `kind = strength` → die HyroxApp-Zeile wird über `linked_workout_id` an die Tracker-Zeile
   gehängt. Gezählt wird einmal; Sätze kommen vom Tracker, RPE und Plan-Kontext von HyroxApp.
2. *Läufe:* Ein Garmin-Lauf, der in HyroxApp bereits einer Session zugeordnet ist
   (Migration 0037), wird zu **einer** Zeile mit den Messwerten von Garmin.

**Übungsnamen.** Tracker-IDs (`back-squat`) und HyroxApp-Namen (Freitext in
`strength_set_logs.exercise_name`) werden über `exercises.aliases` auf einen `exercise_key`
gebracht. Unbekannte Namen landen sichtbar unter „Quellen → Nicht zugeordnet" statt still zu
verschwinden.

**Sicherheit.** RLS auf allen Tabellen, Lesen nur für den einen angemeldeten Nutzer. Schreiben
ausschließlich über Server-Routen mit Service-Role. Login per Magic-Link, Registrierung in
Supabase abgeschaltet, eine erlaubte E-Mail-Adresse (`ALLOWED_EMAIL`).

## 4. Anbindung HyroxApp (Pull)

Änderungen **in HyroxApp**:

- `src/lib/exportPayload.ts` — der Nutzlast-Bau aus `src/app/api/export/route.ts` wandert in eine
  Funktion `buildExport(supabase, profileId, { since? })`. `/api/export` ruft sie unverändert auf.
- `src/app/api/hub/export/route.ts` — neu. `Authorization: Bearer <HUB_EXPORT_TOKEN>`,
  Vergleich in konstanter Zeit, liest über Service-Role das eine Profil, antwortet mit demselben
  `format: 1`. Ohne gesetzten Token antwortet die Route 404, die App verhält sich wie bisher.
- Tests: Token fehlt / falsch / richtig; Nutzlast identisch zu `/api/export`.
- `docs/anleitung.md`: Abschnitt „Sporthub" und Eintrag im Änderungsprotokoll (Abschnitt 17) —
  ehrlich formuliert: Es gibt keinen Knopf in HyroxApp, der Hub holt die Daten ab.

Im **Hub**:

- `src/lib/sources/hyroxapp.ts` — holt, prüft mit zod, schreibt `raw_snapshots`, normalisiert.
- Zuordnung: `sessions` + `session_logs` → `workouts`; `garmin_runs` → `workouts` (`run`);
  `strength_set_logs` → `strength_sets`; `garmin_fitness` → `daily_metrics`;
  `benchmark_results` → `benchmarks`; `athlete_race_results` → `race_results`;
  `plan_weeks` + `plan_phases` → `plan_weeks`.
- Auslöser: `GET /api/cron/sync` täglich 04:00 (nach dem Makro-Cron von HyroxApp um 03:00),
  zusätzlich beim Öffnen der Übersicht, wenn der letzte Sync älter als 60 Minuten ist, und der
  Knopf „Jetzt synchronisieren".
- Die Datei ist klein (ein Athlet), deshalb zunächst Vollabzug + Upsert. `since` ist vorbereitet,
  wird aber erst gebaut, wenn der Abzug spürbar langsam wird.

## 5. Anbindung Strength Tracker (Push)

Im **Hub**: `POST /api/ingest/strength`

- `Authorization: Bearer <STRENGTH_INGEST_TOKEN>`, CORS nur für die Tracker-Domain.
- Nutzlast: `{ version, sessions[], goals, exercises[], deletedIds[] }` — immer der komplette
  Stand; das sind wenige Kilobyte.
- Upsert über `(source='strength', source_id=session.id)`. Bearbeiten im Tracker überschreibt.
- **Gelöscht wird nur, was in `deletedIds` steht — nie durch Fehlen.** Sonst würde ein neues
  Handy mit leerem Speicher den Hub leeren.
- `exercises[]` pflegt Katalog, Start- und Zielwerte automatisch mit, wenn der Plan im Script
  geändert wird.

Im **Tracker** (`index.html`):

- „Verlauf → Daten": neuer Block **Sporthub** mit Feldern Hub-Adresse und Token, Knopf
  „Jetzt senden", Zeile „Zuletzt gesendet: …". Gespeichert in `hst:hub`.
- `syncHub()` nach Speichern, Bearbeiten, Löschen und Backup-Import, beim App-Start und beim
  `online`-Ereignis. Entprellt, mit Wiederholung; Fehler nur als dezenter Hinweis — das Loggen
  darf nie am Netz hängen.
- Löschungen kommen in `hst:tombstones` und bleiben dort, bis der Hub sie bestätigt hat.
- `sw.js`: Cache-Version erhöhen. POST-Anfragen fasst der Service Worker schon heute nicht an.
- Ohne eingetragenen Token ändert sich am Tracker nichts.

## 6. KI — „Fragen"

**Prinzip:** Das Modell rechnet nicht aus dem Kopf und sieht nicht die ganze Datenbank. Es bekommt
Werkzeuge, ruft sie auf, und antwortet mit den Zahlen, die zurückkommen. Jede Antwort zeigt
aufklappbar, welche Abfragen dahinterstehen.

Werkzeuge (alle nur lesend, Parameter mit zod geprüft):

| Werkzeug | Liefert |
|---|---|
| `list_workouts(from, to, kind?)` | Einheiten im Zeitraum |
| `get_workout(id)` | Eine Einheit mit allen Sätzen bzw. Laufwerten |
| `exercise_history(exercise, from?, to?)` | Verlauf einer Übung: Sätze, bester Satz, geschätztes 1RM |
| `week_summary(from, to)` | Je Woche: Einheiten, Laufkilometer, Kraftvolumen, Dauer, RPE |
| `run_stats(from, to)` | Distanz, Pace, Puls, längster Lauf |
| `records(exercise?)` | Bestwerte |
| `goal_progress()` | Start → aktuell → Ziel je Übung |
| `benchmarks_and_races()` | Benchmarks, Rennergebnisse, Prognosen |
| `plan_context(date?)` | Phase, Woche, Deload, Tage bis zum Rennen |

Stufe 2, falls die festen Werkzeuge zu eng werden: `query_sql` gegen eine eigene Postgres-Rolle,
die nur die Views lesen darf, mit Zeitlimit und Zeilenlimit.

Umsetzung:

- `src/lib/gemini.ts` — REST-Aufruf wie in HyroxApp, erweitert um Funktionsaufrufe und Streaming.
  Modell über `GEMINI_MODEL`, nicht im Code.
- `src/lib/ai/tools.ts` — Definitionen + Ausführung. `src/lib/ai/ask.ts` — Schleife: Frage →
  Werkzeug-Aufrufe (höchstens 8 Runden) → Antwort.
- `POST /api/ask` streamt die Antwort; Gespräche werden in `chat_messages` gespeichert.
- Systemanweisung: heutiges Datum, Zeitzone Europe/Berlin, Einheiten, „nenne nur Zahlen aus
  Werkzeug-Ergebnissen; wenn Daten fehlen, sag es", Antworten auf Deutsch.
- UI: Chat mit Beispielfragen („Wie hat sich mein Back Squat seit September entwickelt?",
  „Wie viele Kilometer bin ich in den letzten vier Wochen gelaufen, verglichen mit davor?",
  „Welche Übungen stagnieren?").
- Ohne `GEMINI_API_KEY` bleibt die Seite sichtbar und sagt, was fehlt; der Rest des Hubs läuft.

Hinweis Datenschutz: Die abgefragten Trainingsdaten gehen an Google. Im kostenlosen
Gemini-API-Tarif dürfen Eingaben zur Produktverbesserung verwendet werden, im bezahlten nicht.

## 7. Oberfläche

| Seite | Inhalt |
|---|---|
| `/` Übersicht | Diese Woche (Einheiten, km, Kraftvolumen), Tage bis zum Rennen, letzte Einheiten, Sync-Stand |
| `/verlauf` | Alle Einheiten beider Apps in einer Zeitleiste, Filter nach Art und Quelle |
| `/kraft` | Je Übung: Verlauf, geschätztes 1RM, Start → Ziel |
| `/laufen` | Wochenkilometer, Pace- und Pulsverlauf, VO2max, Rennprognosen |
| `/fragen` | KI-Chat |
| `/quellen` | Je Quelle: letzter Sync, Protokoll, „Jetzt synchronisieren", nicht zugeordnete Übungen |

## 8. Umsetzung in Phasen

Jede Phase ist für sich nutzbar und endet mit grünen Tests.

**Phase 0 — Fundament** (½ Tag)
Repo, Next.js-Gerüst, Supabase-Projekt, Migration `0001` (alle Tabellen + RLS), Login mit einer
erlaubten Adresse, Vercel-Projekt, leere Seiten.
*Fertig, wenn:* Login funktioniert, fremde E-Mail wird abgewiesen.

**Phase 1 — HyroxApp anbinden** (1 Tag)
`/api/hub/export` in HyroxApp, Abholer + Normalisierung im Hub, Cron, `/quellen`.
*Fertig, wenn:* Zwei Syncs hintereinander ergeben dieselben Zeilenzahlen; ein Garmin-Lauf mit
zugeordneter Session erscheint einmal.

**Phase 2 — Strength Tracker anbinden** (1 Tag)
Ingest-Route, Sync-Block im Tracker, Dubletten-Verknüpfung Kraft, Übungs-Aliasse.
*Fertig, wenn:* Speichern im Tracker erscheint binnen Sekunden im Hub; offline gespeicherte
Einheiten kommen nach; ein leerer Browser löscht im Hub nichts.

**Phase 3 — Ansichten** (1–1½ Tage)
Übersicht, Verlauf, Kraft, Laufen, Views.
*Fertig, wenn:* Die Wochenzahlen stimmen mit beiden Apps überein (Stichprobe von drei Wochen).

**Phase 4 — KI** (1–1½ Tage)
Werkzeuge, Gemini-Schleife, Chat, gespeicherte Gespräche.
*Fertig, wenn:* Zehn Testfragen mit bekannter Antwort liefern die richtigen Zahlen und die
Abfragen sind einsehbar.

**Phase 5 — Feinschliff** (½ Tag)
PWA, Fehlerzustände, Datenexport des Hubs, Kurzanleitung.

Prüfung in jeder Phase: `vitest` (Normalisierer mit festen Beispieldateien beider Formate,
Werkzeuge gegen Testdaten, Token-Prüfung), `tsc --noEmit`, `next lint`, `next build`, Playwright
für Login, Sync-Knopf und eine Chat-Frage mit gestelltem Modell.

## 9. Was du dafür tun musst

1. Leeres GitHub-Repo anlegen (Vorschlag: `SportHub`) und für die Claude-Sitzung freigeben.
2. Neues Supabase-Projekt (Region Frankfurt) anlegen.
3. Neues Vercel-Projekt mit dem Repo verbinden.
4. Umgebungsvariablen setzen:

| Wo | Variable |
|---|---|
| Hub | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Hub | `ALLOWED_EMAIL`, `CRON_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL` |
| Hub | `HYROXAPP_URL`, `HYROXAPP_EXPORT_TOKEN`, `STRENGTH_INGEST_TOKEN`, `STRENGTH_ORIGIN` |
| HyroxApp | `HUB_EXPORT_TOKEN` (gleicher Wert wie `HYROXAPP_EXPORT_TOKEN`) |
| Tracker | keine — Hub-Adresse und Token werden einmal in der App eingetragen |

## 10. Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Export-Format von HyroxApp ändert sich | `format`-Nummer prüfen, zod-Validierung, Rohdaten bleiben erhalten und lassen sich neu normalisieren |
| Tracker-Daten gehen verloren (Safari löscht `localStorage`) | Der Hub ist ab Phase 2 nebenbei das Backup; Löschen nur über `deletedIds` |
| KI nennt falsche Zahlen | Zahlen nur aus Werkzeug-Ergebnissen, Abfragen einsehbar, Testfragen mit bekannter Antwort |
| Token im Tracker liegt im Browser | Token darf nur Krafteinheiten schreiben, nichts lesen; jederzeit austauschbar |
| Doppelt gezählte Einheiten | Verknüpfungsregeln aus Abschnitt 3, in Tests abgedeckt |

## 11. Bewusst nicht enthalten

Garmin-Gesundheitsdaten (Schlaf, HRV), Körperdaten, Ernährung, Schreiben zurück in die Apps,
Mehrbenutzer-Betrieb. Das Datenmodell (`sources`, `daily_metrics`) ist so geschnitten, dass
weitere Quellen später ohne Umbau dazukommen.
