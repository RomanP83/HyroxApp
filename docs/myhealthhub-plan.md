# MyHealthHub — Implementierungsplan

Persönlicher Hub für einen einzigen Nutzer. **MyHealthHub ist die zentrale Datenquelle:** Messdaten
(Garmin, Krafteinheiten) kommen zuerst hier an und werden von hier an die Apps verteilt. Eine KI
beantwortet Fragen zu allen Daten. Der Hub ist so geschnitten, dass später weitere Themen
(Gesundheit, Körper, Ernährung, …) dazukommen, ohne das Fundament umzubauen.

## 0. Getroffene Entscheidungen

| Frage | Entscheidung |
|---|---|
| Wo lebt der Hub? | Eigene neue App: eigenes Repo `MyHealthHub`, eigenes Vercel-Projekt, eigene Datenbank |
| Richtung des Datenflusses | Quelle → **Hub** → Apps. Der Hub ist die Quelle der Wahrheit für Messdaten |
| Garmin heute | Geplante Claude-Aufgabe (Garmin-Connector) → wird von HyroxApp auf den Hub umgestellt |
| Strength Tracker → Hub | Automatischer Sync im Hintergrund, `localStorage` bleibt Arbeitsspeicher des Trackers |
| Kraft → HyroxApp | Ja: Hub reicht Krafteinheiten weiter, die geplante Einheit gilt dort als erledigt |
| KI-Modell | Gemini (vorhandener `GEMINI_API_KEY`) |
| Datenumfang zum Start | Garmin-Aktivitäten und -Fitnesswerte, Strength Tracker, Plan aus HyroxApp |

Annahmen, die ich ohne Rückfrage gesetzt habe — bitte widersprechen, falls falsch:

- Oberfläche auf Deutsch, mobil zuerst, als PWA installierbar.
- Vercel-Hobby-Tarif: Cron höchstens täglich. Weiterleitungen laufen deshalb sofort beim Eingang,
  der Cron holt nur Liegengebliebenes nach.
- Eigenes Supabase-Projekt für den Hub (der Gratis-Tarif erlaubt zwei aktive Projekte).
- Die offizielle Garmin- und die Strava-Verbindung in HyroxApp sind nicht in Betrieb und bleiben
  unangetastet.

## 1. Wem gehört was

„Zentrale Datenquelle" heißt nicht, dass alles im Hub entsteht. Jede Information hat genau einen
Ort, an dem sie entsteht — und landet immer im Hub.

| Daten | Entsteht in | Quelle der Wahrheit | Fließt weiter an |
|---|---|---|---|
| Garmin-Aktivitäten, VO2max, Rennprognosen | Garmin | **Hub** | HyroxApp |
| Krafteinheiten, Sätze, Kraftziele | Strength Tracker | **Hub** | HyroxApp |
| Trainingsplan, Phasen, Wochen, geplante Einheiten | HyroxApp (Engine) | HyroxApp | Hub (Kopie zum Auswerten) |
| Abhaken, RPE, Benchmarks, Rennergebnisse | HyroxApp (deine Eingabe) | HyroxApp | Hub (Kopie zum Auswerten) |
| Künftige Themen (Schlaf, Gewicht, …) | jeweilige Quelle | **Hub** | wer sie braucht |

Der Plan bleibt in HyroxApp: Die Engine dort ist deterministisch und rechnet auf ihrer eigenen
Datenbank. Der Hub ändert den Plan nie — er liefert Messdaten über dieselben geprüften Wege an,
über die sie heute schon ankommen.

## 2. Ausgangslage

**HyroxApp** — Next.js 15, Supabase, Vercel `fra1`.
- `POST /api/garmin/import` (Bearer `GARMIN_IMPORT_SECRET`) nimmt Aktivitäten, VO2max und
  Rennprognosen in den Formen des Garmin-Connectors entgegen, speichert `garmin_runs` /
  `garmin_fitness` und ordnet Läufe geplanten Einheiten zu. Heute ruft ihn die geplante
  Claude-Aufgabe auf.
- `GET /api/export` liefert alles in einer Datei (`format: 1`), verlangt aber ein Browser-Login.
- Kraft: `strength_set_logs` hängen an einer geplanten Session; es gibt keinen Weg von außen.

**HyroxStrengthTracker** — eine statische `index.html`, kein Backend, Daten in `localStorage`
(`hst:sessions`, `hst:drafts`, `hst:goals`). Der Übungskatalog (`EXERCISES`) steht nur im Script.

## 3. Architektur

```
 Garmin ── geplante Claude-Aufgabe ──┐
 Strength Tracker (Browser) ─────────┤  POST /api/ingest/<quelle>
 künftige Quellen ───────────────────┘
                 ▼
┌──────────────────────────── MyHealthHub ────────────────────────────┐
│ Eingang → Rohdaten → Normalisierung → Hub-Tabellen (Quelle d. Wahrheit) │
│                                   │                                  │
│   Ausgang (Zustellliste mit Wiederholung)      KI + Ansichten        │
└───────────────┬───────────────────────────────────▲──────────────────┘
                │ Garmin-Läufe, Fitnesswerte,       │ Plan, Abhaken, RPE,
                │ Krafteinheiten                    │ Benchmarks, Rennen
                ▼                                   │ (GET /api/hub/export)
              HyroxApp ─────────────────────────────┘
```

Stack wie HyroxApp: Next.js App Router, TypeScript, Tailwind, Supabase, zod, vitest, Playwright.

### Erweiterbarkeit: Kern + Module

- **Kern** (themenneutral): Login, Quellen, Eingang, Rohdaten, Zustellliste, Zugriffstoken,
  KI-Schleife, Chat, Navigation.
- **Module** unter `src/modules/<thema>/`, zum Start nur `training`. Ein Modul bringt mit:
  eigene Migrationen, Eingangs-Adapter, Normalisierer, KI-Werkzeuge, Seiten. Es meldet sich in
  einer Registry an; Navigation und Werkzeugliste der KI entstehen daraus.
- Ein neues Thema (z. B. `health` mit Schlaf und HRV) ist damit: neues Modul + ggf. die
  Garmin-Aufgabe um weitere Abrufe erweitern. Kein Umbau am Kern.
- Tageswerte liegen im Langformat (`daily_metrics`: Datum, Kennzahl, Wert, Quelle) — eine neue
  Kennzahl braucht keine Migration.

## 4. Datenmodell

**Kern**

| Tabelle | Inhalt |
|---|---|
| `sources` | Je Quelle: Schlüssel (`garmin`, `strength`, `hyroxapp`), letzter Eingang, Status |
| `raw_events` | Jede eingegangene Nutzlast unverändert (`jsonb`), mit Quelle und Zeit |
| `sync_runs` | Protokoll: gelesen / neu / geändert, Dauer, Fehler |
| `api_tokens` | Zugriffstoken (nur als Hash), je Token Rechte wie `ingest:garmin`, `ingest:strength`, `read:training` |
| `consumers` | Abnehmer des Hubs (zum Start: `hyroxapp`) mit Adresse und abonnierten Datenarten |
| `deliveries` | Zustellliste: Abnehmer, Datenart, Verweis, Status, Versuche, letzter Fehler |
| `chat_threads`, `chat_messages` | KI-Gespräche inkl. ausgeführter Abfragen |

**Modul `training`**

| Tabelle | Inhalt |
|---|---|
| `workouts` | Eine Zeile je Einheit, quellenübergreifend (siehe unten) |
| `strength_sets` | Ein Satz: Übung, Satznummer, Wdh., Last, Metrik |
| `exercises` | Übungskatalog mit Aliassen, Metrik, Start- und Zielwert |
| `daily_metrics` | Tageswerte im Langformat (VO2max, Rennprognosen, später mehr) |
| `plan_weeks`, `planned_sessions` | Kopie des Plans aus HyroxApp: Phase, Woche, Deload, geplante Einheiten |
| `benchmarks`, `race_results` | Kopie aus HyroxApp |

`workouts`:

```
id, source, source_id            unique (source, source_id)  → jeder Eingang ist idempotent
date, started_at
kind        run | strength | station | hybrid | other   (alle Garmin-Sportarten, nicht nur Läufe)
title, duration_min, rpe, distance_m, avg_hr, max_hr, elevation_m, calories, notes
planned_session_id               → Zuordnung zur geplanten Einheit aus HyroxApp
deleted_at
```

Views für UI und KI: `v_week_summary`, `v_exercise_progress` (bester Satz, geschätztes 1RM),
`v_records`, `v_plan_vs_actual`.

**Keine Dubletten mehr durch die neue Richtung:** Garmin und Kraft liegen im Original im Hub.
Aus HyroxApp kommen nur Plan und Eingaben zurück, nicht noch einmal die Messdaten. Die Zuordnung
„welche Einheit hat welche geplante Session erfüllt" meldet HyroxApp zurück und landet in
`planned_session_id`.

**Übungsnamen.** Tracker-IDs (`back-squat`) und die Freitextnamen der Kraft-Templates in
HyroxApp werden über `exercises.aliases` zusammengeführt. Unbekanntes erscheint unter
„Quellen → Nicht zugeordnet".

**Sicherheit.** RLS auf allen Tabellen, Lesen nur für den einen angemeldeten Nutzer. Schreiben nur
über Server-Routen mit Service-Role. Login per Magic-Link, Registrierung abgeschaltet, eine
erlaubte Adresse (`ALLOWED_EMAIL`).

## 5. Garmin → Hub → HyroxApp

**Eingang:** `POST /api/ingest/garmin` im Hub, Token mit Recht `ingest:garmin`.
Die Nutzlast hat **dieselbe Form wie heute** bei `/api/garmin/import` (`activities`, `vo2max`,
`race_predictions`). An der geplanten Claude-Aufgabe ändern sich nur Adresse und Token.

Der Hub speichert **alle** Aktivitäten (auch Rad, Kraft, Schwimmen — HyroxApp verwirft heute alles
außer Läufen) und die Fitnesswerte.

**Ausgang:** Für jeden Eingang entsteht ein Eintrag in `deliveries`; der Hub ruft sofort
`POST {HyroxApp}/api/garmin/import` mit dem bestehenden `GARMIN_IMPORT_SECRET` auf — in der
bekannten Form, nur Läufe und Fitnesswerte. Schlägt das fehl, bleibt der Eintrag offen und der
tägliche Cron versucht es erneut. Der Endpunkt in HyroxApp ist schon idempotent.

→ **HyroxApp braucht für Garmin keine Codeänderung.** Zuordnung zu geplanten Läufen, Belastung
und KI-Coach arbeiten weiter wie bisher.

**Umstellung ohne Lücke:**

1. Bestand übernehmen: einmalig `garmin_runs` und `garmin_fitness` aus dem HyroxApp-Export in den
   Hub laden (Schlüssel: Garmin-Aktivitäts-ID).
2. Geplante Aufgabe auf den Hub zeigen lassen.
3. Prüfen: Ein neuer Lauf steht im Hub und kurz darauf in HyroxApp unter „Running from Garmin".
4. `GARMIN_IMPORT_SECRET` in HyroxApp neu setzen, damit nur noch der Hub liefern kann.

## 6. Strength Tracker → Hub → HyroxApp

**Tracker → Hub:** `POST /api/ingest/strength`, Token mit Recht `ingest:strength`, CORS nur für
die Tracker-Domain.

- Nutzlast: `{ version, sessions[], goals, exercises[], deletedIds[] }` — immer der komplette
  Stand (wenige Kilobyte).
- Upsert über `(source='strength', source_id=session.id)`; Bearbeiten überschreibt.
- **Gelöscht wird nur, was in `deletedIds` steht — nie durch Fehlen.** Sonst würde ein neues Handy
  mit leerem Speicher den Hub leeren.
- Änderungen im Tracker (`index.html`): unter „Verlauf → Daten" ein Block **MyHealthHub** mit
  Hub-Adresse, Token, „Jetzt senden" und „Zuletzt gesendet". Senden nach Speichern, Bearbeiten,
  Löschen, Import, beim Start und beim `online`-Ereignis; Löschungen in `hst:tombstones`, bis der
  Hub sie bestätigt. `sw.js`-Cache-Version erhöhen. Ohne Token verhält sich der Tracker wie heute.
- Neu im Tracker: „Aus MyHealthHub wiederherstellen" — der Hub ist die Quelle der Wahrheit, also
  lässt sich ein leeres Gerät von dort füllen.

**Hub → HyroxApp:** neuer Endpunkt in HyroxApp, `POST /api/hub/strength` (Bearer
`HUB_INGEST_SECRET`).

- Sucht die geplante Krafteinheit desselben Tages im aktiven Plan (sonst: derselben Woche, noch
  offen). Gibt es keine, ändert sich nichts und der Hub zeigt „in HyroxApp nicht zugeordnet".
- Loggt über **dieselben Wege wie ein manuelles Abhaken** (transaktionales Session-Logging,
  `recordStrengthSets`): geprüft, im Änderungsprotokoll, rückgängig zu machen. Kein Sonderweg an
  der Engine vorbei.
- Idempotent über die Hub-ID der Einheit; eine im Tracker nachbearbeitete Einheit aktualisiert die
  Sätze, statt doppelt zu loggen.
- `docs/anleitung.md`: Abschnitt und Eintrag im Änderungsprotokoll (Abschnitt 17) — sichtbar ist:
  Eine Krafteinheit kann jetzt ohne Tippen in HyroxApp als erledigt erscheinen.

## 7. HyroxApp → Hub (Plan und Eingaben)

In HyroxApp:

- `src/lib/exportPayload.ts` — der Nutzlast-Bau aus `/api/export` wird eine Funktion; `/api/export`
  nutzt sie unverändert.
- `GET /api/hub/export` — Bearer `HUB_EXPORT_TOKEN`, Vergleich in konstanter Zeit, dieselbe
  Nutzlast `format: 1`. Ohne gesetzten Token 404.
- Tests für beide neuen Routen; Anleitung ergänzen (ehrlich: kein Knopf in HyroxApp).

Im Hub: täglich 04:00 per Cron (nach dem Makro-Cron um 03:00), beim Öffnen der Übersicht, wenn
älter als 60 Minuten, und per Knopf. Übernommen werden Plan, Phasen, Wochen, geplante Einheiten,
Session-Logs (Status, RPE, Dauer, Zuordnung), Benchmarks, Rennergebnisse — **nicht** die
Garmin- und Kraftdaten, die liegen im Original im Hub.

## 8. Lese-Schnittstelle für Apps

`GET /api/v1/training/workouts`, `…/strength-sets`, `…/daily-metrics`, jeweils mit `from`, `to`
und Token-Recht `read:training`. HyroxApp braucht sie zum Start nicht (sie wird beliefert), aber
jede künftige App kann sich damit aus dem Hub bedienen, ohne dass der Hub sie kennen muss.

## 9. KI — „Fragen"

**Prinzip:** Das Modell rechnet nicht aus dem Kopf. Es ruft Abfrage-Werkzeuge auf und antwortet
mit den Zahlen, die zurückkommen. Jede Antwort zeigt aufklappbar die Abfragen dahinter.

Werkzeuge des Moduls `training` (nur lesend, Parameter mit zod geprüft):

| Werkzeug | Liefert |
|---|---|
| `list_workouts(from, to, kind?)` | Einheiten im Zeitraum |
| `get_workout(id)` | Eine Einheit mit Sätzen bzw. Laufwerten |
| `exercise_history(exercise, from?, to?)` | Verlauf einer Übung, bester Satz, geschätztes 1RM |
| `week_summary(from, to)` | Je Woche: Einheiten, Kilometer, Kraftvolumen, Dauer, RPE |
| `run_stats(from, to)` | Distanz, Pace, Puls, längster Lauf |
| `records(exercise?)` | Bestwerte |
| `goal_progress()` | Start → aktuell → Ziel je Übung |
| `daily_metric(metric, from, to)` | Verlauf einer Tageskennzahl |
| `benchmarks_and_races()` | Benchmarks, Rennergebnisse, Prognosen |
| `plan_context(date?)` / `plan_vs_actual(from, to)` | Phase, Woche, Deload; geplant gegen absolviert |

Jedes künftige Modul bringt seine eigenen Werkzeuge mit; die KI kann dann themenübergreifend
fragen („Wie war mein Schlaf vor den drei härtesten Einheiten?"). Stufe 2, falls feste Werkzeuge
zu eng werden: `query_sql` gegen eine Postgres-Rolle, die nur Views lesen darf, mit Zeit- und
Zeilenlimit.

Umsetzung: `src/core/ai/gemini.ts` (REST mit Funktionsaufrufen und Streaming, Modell über
`GEMINI_MODEL`), `src/core/ai/ask.ts` (Schleife, höchstens 8 Runden), `POST /api/ask`. Ohne
`GEMINI_API_KEY` sagt die Seite, was fehlt; der Rest läuft.

Hinweis Datenschutz: Die abgefragten Daten gehen an Google. Mit „Gesundheit" im Namen und
künftigen Themen wiegt das schwerer — empfohlen ist der bezahlte API-Tarif.

## 10. Oberfläche

| Seite | Inhalt |
|---|---|
| `/` Übersicht | Diese Woche, Tage bis zum Rennen, letzte Einheiten, Stand der Quellen |
| `/training` | Zeitleiste aller Einheiten, Filter nach Art und Quelle |
| `/training/kraft` | Je Übung: Verlauf, geschätztes 1RM, Start → Ziel |
| `/training/laufen` | Wochenkilometer, Pace, Puls, VO2max, Rennprognosen |
| `/fragen` | KI-Chat |
| `/wissen` | Dokumente hochladen, verschlagworten, Zusammenfassung und Fundstellen ansehen |
| `/quellen` | Eingänge, Zustellungen an Apps, Token verwalten, nicht Zugeordnetes |

## 11. Umsetzung in Phasen

Jede Phase ist für sich nutzbar und endet mit grünen Tests.

| Phase | Inhalt | Aufwand | Fertig, wenn |
|---|---|---|---|
| 0 Fundament | Repo, Kern-Tabellen, Login, Token, Modul-Registry, Vercel | 1 Tag | Login geht, fremde Adresse wird abgewiesen |
| 1 Garmin über den Hub | Eingang, Bestandsübernahme, Zustellliste, Weiterleitung, Aufgabe umstellen | 1 Tag | Neuer Lauf steht im Hub und in HyroxApp; Ausfall von HyroxApp wird nachgeliefert |
| 2 Tracker → Hub | Eingang, Sync-Block und Wiederherstellen im Tracker, Übungs-Aliasse | 1 Tag | Speichern erscheint binnen Sekunden im Hub; ein leerer Browser löscht nichts |
| 3 Plan → Hub | `/api/hub/export` in HyroxApp, Abholer, Zuordnung geplant/absolviert | 1 Tag | Zwei Syncs ergeben dieselben Zeilen; keine Einheit doppelt |
| 4 Kraft → HyroxApp | `/api/hub/strength` in HyroxApp, Zustellung | 1 Tag | Krafteinheit im Tracker hakt die geplante Einheit ab, ist rückgängig zu machen, wird nicht doppelt geloggt |
| 5 Ansichten | Übersicht, Training, Kraft, Laufen | 1–1½ Tage | Wochenzahlen stimmen mit den Apps überein (Stichprobe drei Wochen) |
| 6 KI | Werkzeuge, Gemini-Schleife, Chat | 1–1½ Tage | Zehn Testfragen mit bekannter Antwort liefern richtige Zahlen |
| 7 Wissen | Modul `wissen`: Ablage, Aufbereitung, Suche, Quellenangaben im Chat (Abschnitt 15) | 2 Tage | Fünf Testfragen nennen die richtige Studie mit Seite; eine Frage ohne passende Literatur sagt das auch |
| 8 Feinschliff | PWA, Fehlerzustände, Export des Hubs, Lese-Schnittstelle, Kurzanleitung | 1 Tag | — |

Prüfung in jeder Phase: `vitest` (Normalisierer mit festen Beispieldateien, Zustellung mit
Wiederholung, Token-Rechte, KI-Werkzeuge), `tsc --noEmit`, `next lint`, `next build`, Playwright.
In HyroxApp zusätzlich die dortigen Regeln: Anleitung im selben Commit, keine KI in der Engine.

## 12. Was du dafür tun musst

1. Leeres GitHub-Repo `MyHealthHub` anlegen und für die Claude-Sitzung freigeben.
2. Neues Supabase-Projekt (Region Frankfurt) und neues Vercel-Projekt anlegen.
3. Umgebungsvariablen setzen:

| Wo | Variable |
|---|---|
| Hub | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Hub | `ALLOWED_EMAIL`, `CRON_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `STRENGTH_ORIGIN` |
| Hub | `HYROXAPP_URL`, `HYROXAPP_GARMIN_IMPORT_SECRET`, `HYROXAPP_INGEST_SECRET`, `HYROXAPP_EXPORT_TOKEN` |
| HyroxApp | `HUB_EXPORT_TOKEN`, `HUB_INGEST_SECRET` (neu); `GARMIN_IMPORT_SECRET` (nach Umstellung neu setzen) |
| Tracker | keine — Hub-Adresse und Token werden einmal in der App eingetragen |

4. In Phase 1: die geplante Claude-Aufgabe auf die Hub-Adresse und das Hub-Token umstellen.

## 13. Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Der Hub wird zum einzigen Nadelöhr: fällt er aus, bekommt HyroxApp keine Garmin-Daten | Rohdaten und Zustellliste gehen nicht verloren, Nachlieferung automatisch; Stand je Abnehmer auf `/quellen` sichtbar; HyroxApp läuft ohne Garmin weiter wie heute |
| Datenverlust im Hub wiegt schwerer als bisher | Vollständiger Export des Hubs als Datei, Rohdaten erlauben Neuaufbau aller Tabellen |
| Krafteinheit wird der falschen geplanten Session zugeordnet | Enge Regel (gleicher Tag, Art Kraft), sonst nicht zuordnen; in HyroxApp rückgängig zu machen |
| Export-Format von HyroxApp ändert sich | `format`-Nummer prüfen, zod-Validierung |
| KI nennt falsche Zahlen | Zahlen nur aus Werkzeug-Ergebnissen, Abfragen einsehbar, Testfragen |
| Token im Tracker liegt im Browser | Token darf nur Kraftdaten schreiben und lesen; jederzeit austauschbar |

## 14. Bewusst noch nicht enthalten

Garmin-Gesundheitsdaten (Schlaf, HRV, Ruhepuls), Körperdaten, Ernährung, Mehrbenutzer-Betrieb,
Planänderungen durch den Hub. Für die ersten drei ist der Weg vorbereitet: Garmin-Aufgabe um die
Abrufe erweitern, neues Modul, Kennzahlen in `daily_metrics`.

## 15. Modul `wissen` — wissenschaftliche Dokumente

Studien, Reviews und Artikel zu Hyrox, Laufen, Kraft usw. liegen im Hub, und die KI zieht sie bei
Antworten heran — mit Quellenangabe.

**Ablegen.** Seite `/wissen`: PDF hochladen (auch mehrere), dazu Titel, Autoren, Jahr, Art
(Studie, Review, Artikel, eigenes Notizdokument) und Themen-Schlagworte (Hyrox, Laufen, Kraft,
Regeneration, …). Die KI schlägt diese Angaben aus dem Dokument vor, du bestätigst. Die Datei
liegt in einem privaten Speicher-Bucket; dieselbe Datei zweimal wird über ihre Prüfsumme erkannt.

**Aufbereiten** (einmal je Dokument, im Hintergrund):

1. Text seitenweise auslesen; gescannte PDFs und Tabellen liest das Modell direkt.
2. In Abschnitte von etwa einer halben Seite teilen, jeder mit Seitenzahl.
3. Je Abschnitt einen Bedeutungsvektor berechnen und in Postgres ablegen (`pgvector`).
4. Einen Steckbrief erzeugen: Fragestellung, Probanden, Methode, Kernergebnisse mit Zahlen,
   Grenzen der Aussagekraft.

| Tabelle | Inhalt |
|---|---|
| `documents` | Metadaten, Schlagworte, Prüfsumme, Speicherpfad, Status, Steckbrief |
| `document_chunks` | Abschnitt, Seite, Volltext-Index, Vektor |

**Nutzen in der KI.** Zwei weitere Werkzeuge:

| Werkzeug | Liefert |
|---|---|
| `search_knowledge(query, topics?)` | Die passendsten Textstellen (Bedeutungs- und Stichwortsuche kombiniert) mit Titel, Jahr, Seite |
| `get_document(id)` | Steckbrief eines Dokuments |

Die Suche arbeitet sprachübergreifend: deutsche Frage, englische Studie. Regeln für die Antwort:

- Aussagen aus der Literatur tragen eine Quellenangabe (Titel, Jahr, Seite), anklickbar bis zur
  Textstelle.
- „Deine Daten" und „Literatur" werden in der Antwort getrennt ausgewiesen.
- Findet die Suche nichts Passendes, sagt die KI das, statt aus Allgemeinwissen eine Studienlage
  zu behaupten.

So werden Fragen möglich wie: „Ich laufe seit vier Wochen 45 km — was sagen meine Studien zur
Steigerung des Umfangs, und passt mein Verlauf dazu?"

**Verhältnis zu HyroxApp.** HyroxApp hat bereits eine eigene Dokumenten-Strecke
(`/admin/knowledge`) mit anderem Zweck: Sie leitet aus einem Dokument geprüfte Änderungs­vorschläge
für die Plan-Engine ab. Der Hub bleibt auch hier die Ablage: Ein Dokument bekommt den Knopf
**„An HyroxApp senden"**, der es in die dortige Prüfliste legt. Bewusst nicht automatisch — jede
Übergabe löst dort eine Auswertung aus und verlangt deine Durchsicht.

**Zu beachten.**

- Beim Aufbereiten und beim Antworten gehen Textstellen an Google.
- Die Dokumente sind nur für dich abrufbar; es gibt keine Freigabe nach außen.
- Speicher: Der kostenlose Supabase-Tarif reicht für einige hundert PDFs.
