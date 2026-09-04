# Anleitung zur App

Diese Anleitung beschreibt **jede Funktion der Web-App und wie sie arbeitet** — aus Sicht des
Nutzers, mit einem kurzen Blick unter die Haube, wo das Verhalten sonst überraschen würde.

Sie wird **fortlaufend** mit jeder neuen Funktion erweitert; das Änderungsprotokoll am Ende hält
fest, wann was dazugekommen ist. Technische Detaildokumente liegen daneben:
[`season-periodisation.md`](season-periodisation.md), [`knowledge-pipeline.md`](knowledge-pipeline.md),
[`implementation-plan.md`](implementation-plan.md), [`personal-setup.md`](personal-setup.md).

---

## Inhalt

1. [Das Grundprinzip in drei Sätzen](#1-das-grundprinzip-in-drei-sätzen)
2. [Seitenübersicht](#2-seitenübersicht)
3. [Onboarding — den Plan erzeugen](#3-onboarding--den-plan-erzeugen)
4. [`/plan` — die Trainingswoche](#4-plan--die-trainingswoche)
5. [Eine Einheit loggen (und den Fehlklick zurücknehmen)](#5-eine-einheit-loggen-und-den-fehlklick-zurücknehmen)
6. [Wie sich der Plan anpasst](#6-wie-sich-der-plan-anpasst)
7. [`/season` — Rennkalender und Jahresplanung](#7-season--rennkalender-und-jahresplanung)
8. [`/settings` — Setup & Tools](#8-settings--setup--tools)
9. [`/strength` — eigenes Kraftprogramm](#9-strength--eigenes-kraftprogramm)
10. [`/benchmarks` — Tests eintragen](#10-benchmarks--tests-eintragen)
11. [`/progress` — Auswertungen](#11-progress--auswertungen)
12. [Verbindungen: Strava, Garmin, Telegram](#12-verbindungen-strava-garmin-telegram)
13. [Automatische Abläufe im Hintergrund](#13-automatische-abläufe-im-hintergrund)
14. [Persönlicher Betrieb](#14-persönlicher-betrieb)
15. [`/demo` — ausprobieren ohne Konto](#15-demo--ausprobieren-ohne-konto)
16. [Betreiber-Oberflächen](#16-betreiber-oberflächen)
17. [Begriffe](#17-begriffe)
18. [Änderungsprotokoll](#18-änderungsprotokoll)

---

## 1. Das Grundprinzip in drei Sätzen

1. **Der Plan wird gerechnet, nicht generiert.** Im Kern läuft kein Sprachmodell, sondern eine
   deterministische Engine (`src/lib/engine/**`): gleiche Eingaben → immer derselbe Plan. Das ist
   der Grund, warum jede Entscheidung erklärbar und testbar ist.
2. **Rückwärts vom Renntag.** Zuerst steht der Taper fest, dann der rennspezifische Block, dann der
   Build — die Basis bekommt, was übrig bleibt.
3. **Die App passt sich an dich an, nicht umgekehrt.** Jede geloggte Einheit verschiebt Paces,
   Gewichte und Volumen ein Stück; jede Anpassung wird protokolliert und ist rücknehmbar.

---

## 2. Seitenübersicht

| Seite | Wofür | Ohne Login? |
|---|---|---|
| `/` | Leitet direkt zu `/plan` weiter; ohne Login zum Onboarding | Weiterleitung |
| `/demo` | Kompletter Durchlauf mit Beispieldaten | ja |
| `/onboarding` | Profil anlegen, Plan erzeugen | Login nötig (Magic Link) |
| `/plan` | Die aktuelle Trainingswoche | nein |
| `/season` | Rennkalender und Jahresplanung | nein |
| `/strength` | Eigene Kraftprogramme, Sätze protokollieren | nein |
| `/benchmarks` | Testergebnisse eintragen | nein |
| `/progress` | Verlauf und Auswertungen | nein |
| `/settings` | Setup & Tools: Wochenform, Laufvolumen, Verbindungen, Verletzung | nein |
| `/de/…` | Deutsche Landingpages (8/12/16 Wochen) | ja |

Alle eingeloggten Seiten teilen sich **eine Kopfzeile**: das Logo führt immer zurück auf `/plan`
(die Wochenansicht), daneben stehen die fünf Bereiche als Tabs, der aktuelle ist markiert. Auch die
Betreiberseite `/admin/knowledge` hat oben links einen Rückweg in die App.
| `/admin/knowledge` | Betreiber: Wissensquellen einspeisen | Betreiber-Secret |

---

## 3. Onboarding — den Plan erzeugen

**Anmeldung** läuft über einen Magic Link: E-Mail eingeben, Link im Postfach klicken. Kein Passwort.

Danach vier kurze Schritte. Alles ist später änderbar.

| Eingabe | Was sie bewirkt |
|---|---|
| **Division** (Open, Pro, Doubles, Masters) | Bestimmt die Wettkampfgewichte in jeder Station-Beschreibung (z. B. Sled 152 kg vs. 202 kg). |
| **Erfahrungslevel** | Start-Tiers der Stationen, Grundlage für die Frequenzberatung. |
| **Trainingstage pro Woche (3–6)** | Wie viele Slots eine Woche bekommt. Bei 5 Tagen überleben die fünf höchstpriorisierten Einheiten der Phase. *Später jederzeit unter [Setup](#8-settings--setup--tools) änderbar.* |
| **Doppeltage (0–3)** | Tage mit AM- und PM-Einheit. Die PM-Einheit ist immer die leichtere. *Später jederzeit unter [Setup](#8-settings--setup--tools) änderbar.* |
| **Peak-km pro Woche** | Die eine Zahl für das Laufvolumen; eine Kurve verteilt sie über die Phasen. |
| **Läufe pro Woche** | Optional. Verschiebt die Mischung Richtung Laufen — genau ein Nicht-Lauf-Slot bleibt geschützt. |
| **Equipment** (Full Gym / Home / Hybrid) | Wählt zwischen Gym- und Home-Varianten aller Blöcke. |
| **5-km-Zeit** | Leitet alle Pace-Zonen ab (easy / race / interval) und die erste Zielzeit-Prognose. |
| **Renndatum** | Aus der Rennliste oder frei gewählt. Der Plan wird rückwärts davon geplant. |

**Live-Vorschau:** Noch bevor irgendetwas gespeichert wird, rechnet die Engine im Browser die
Phasenaufteilung und die geschätzte Zielzeit — man sieht das Ergebnis, bevor man sich festlegt.

**Frequenzhinweis:** Die App vergleicht deine gewählten Tage *und Einheiten* (Tage + Doppeltage)
mit dem, wofür dein Level gebaut ist:

| Level | Zielzeit | Tage | Einheiten |
|---|---|---|---|
| Beginner | 1:40+ | 3–4 | 3–4 |
| Intermediate | sub 1:30 | 4–5 | 4–5 |
| Advanced | sub 1:20 | 5 | 5–6 |
| Elite | sub 70 min | 5–6 | 6–8 (teils Doppeltage) |
| World Class | sub 60 min | 6 | 7–9 (AM/PM die Regel) |

Doppeltage gibt es ab Advanced; auf World-Class-Niveau sind sie der Normalfall — sechs Tage ohne
Doppeltag liegen dort sogar *unter* dem Soll, und die App sagt das. **Es ist ein Hinweis, keine
Sperre:** du entscheidest.

Am Ende: **Plan erzeugen.** Die Engine baut Phasen → Wochen → Einheiten → Blöcke, alles wird in
einer einzigen Transaktion gespeichert (`persist_plan`), damit kein halber Plan entstehen kann.

---

## 4. `/plan` — die Trainingswoche

Ohne ausdrücklich gewählte Woche zeigt die App die aktuelle Kalenderwoche des Plans.
Woche 1 ist die Montag–Sonntag-Woche der Planerstellung; montags schaltet die Ansicht weiter.
Vergangene Wochen bleiben einsehbar und ihre Logs erhalten. Die letzte Planwoche bleibt nach
Zyklusende auswählbar, aber alle Wochen gelten dann als abgeschlossen; Makro-Cron und Check-ins
arbeiten nicht erneut die letzte Woche ab. `APP_TIME_ZONE` legt die Trainingszeitzone fest
(Standard: Europe/Berlin).

Die Hauptseite. Links die Einheiten der Woche, rechts die Kontextkarten.

### Was oben steht

Kopfzeile: die Navigation zeigt, auf welcher Seite du bist, und rechts steht der **Countdown** —
nicht das Renndatum, sondern wie viele Tage bleiben. Darunter der **Zyklus-Streifen**: eine Linie
pro Woche in der Farbe ihrer Phase, die aktuelle Woche hervorgehoben, ein Bernsteinpunkt über jeder
Deload- und Benchmark-Woche. Anklicken springt in die Woche.

### Die Wochenansicht

- **Wochenziel** in einem Satz: warum diese Woche so aussieht (Phase, Deload, Benchmark — oder das
  Rennen, das in ihr liegt).
- **Wochenwechsel** über die Nummern; abgeschlossene Wochen bleiben lesbar.
- **Doppeltage** sind mit AM/PM markiert.
- **Laufauswertung der Woche:** geplante Kilometer, Anteil im lockeren Bereich, und ob das im
  polarisierten Fenster der Phase liegt. Liegt es daneben, nennt die Karte den Hebel (meist: ein
  Doppeltag holt die Kilometer zurück).

### Eine Einheitenkarte

**Kompromittierte Läufe** kommen aus einem eigenen Katalog: 60 Sessions über fünf Leistungslevel
und vier Phasen, je drei pro Kombination. Was du bekommst, hängt an deinem Level — ein Beginner
läuft 800 m nach leichten Lunges, ein World-Class-Athlet 1000 m in 3:45–3:55 nach dem Pro-Schlitten
mit unter fünf Sekunden Transition. Jede zweite Woche zielt die Auswahl auf deine schwächste
Station. Ohne Ergometer bekommst du nie eine Erg-Session — die App weicht auf eine andere aus,
statt die Einheit zu streichen.

Links an jeder Einheit sitzt eine **Intensitäts-Leiste** in der Farbe dessen, was der Tag verlangt:
orange = hart, grün = aerob, bernstein = Kraft und Stationen, grau = Erholung. Die Wochenform ist
damit sichtbar, bevor ein Wort gelesen ist — zwei orange Leisten heißen: harte Woche.

**Die Einheit von heute** ist hervorgehoben und trägt als einzige einen gefüllten Knopf. Alle
anderen Einheiten haben dieselben vier Knöpfe, nur ruhiger — sonst gäbe es sechs Blickfänge, also
keinen.

Zugeklappt: Titel, Typ, Dauer, RPE-Ziel. Bei Laufeinheiten zusätzlich direkt sichtbar:

- **Variante** der Woche (z. B. „Pyramid Intervals") — und ob sie auf deine Schwachstelle zielt
- **HF-Zone** und **Zielpace**
- Bei kompromittierten Läufen: **die Eröffnungspace** (+20 s/km über die ersten 400 m)

Aufgeklappt: alle Blöcke — Warm-up, Hauptteil, Finisher — mit Sätzen, Wiederholungen, Gewichten
oder Distanzen, gerendert auf deine Division und deinen aktuellen Stand. Kraft-Einheiten zeigen
dort zusätzlich dein importiertes Programm mit einem Eingabefeld pro Satz; **zugeklappt** steht
stattdessen nur eine Zeile (Programmname, Übungszahl, „tap to log sets") — ein Tap darauf öffnet
die Karte.

Renntage tragen keine Vorgabe: dort steht, dass das Event die Einheit ist.

### Die Karten rechts

| Karte | Funktion |
|---|---|
| **Estimated finish** | Die Zielzeit-Prognose als Rennuhr, darunter deine Pace-Zonen und der ACWR. Die eine Zahl, für die das ganze System existiert. |
| **Why your plan changed** | Jede automatische Anpassung im Klartext (siehe Abschnitt 6). |
| **Ernährung** | Ein kurzer, phasenabhängiger Hinweis. |
| **Setup & tools** | Ein Link auf die [eigene Setup-Seite](#8-settings--setup--tools). |
| **Coach-Feedback** | Erscheint nach dem Loggen als Overlay (siehe Abschnitt 6). |

---

## 5. Eine Einheit loggen (und den Fehlklick zurücknehmen)

Session-Log, eingetragene Kraftsätze und der Status „done“ werden gemeinsam gespeichert oder
gemeinsam zurückgerollt. Das gilt auch für Telegram und Wearables. Ein doppelter Klick bzw.
erneut zugestellter Log derselben Session überschreibt nichts und kalibriert nicht erneut.
Korrekturen laufen über **Undo** und erneutes Loggen. Feedback und die anschließende
Engine-Kalibrierung sind separate Verarbeitungsschritte, nicht Teil dieser Log-Transaktion.

Vier Knöpfe pro Einheit — **ein Tap genügt**:

| Knopf | Bedeutung | Wirkung |
|---|---|---|
| **As planned** | So absolviert wie geplant | Geplante Werte werden als Ist-Werte übernommen. |
| **Felt harder** | *War* härter als erwartet | Nächste Einheiten werden etwas leichter: Pace/Last gehen einen Schritt zurück. |
| **Felt easier** | *War* leichter als erwartet | Nach zwei solchen Rückmeldungen in Folge geht es einen Schritt hoch. |
| **Skip** | Nicht gemacht | Wird als ausgelassen protokolliert und fließt in die Compliance ein. |

> **Wichtig zur Formulierung:** „Felt harder/easier" beschreibt, **wie es war** — nicht, was du dir
> wünschst. Genau deshalb heißen die Knöpfe seit der Umbenennung so und tragen einen Tooltip.

### Undo

Vertippt? Unter der Knopfreihe erscheint bei einer geloggten Einheit **„Logged by mistake? · Undo"**.
Das nimmt nicht nur den Eintrag zurück, sondern auch **die Kalibrierung, die er ausgelöst hat**: Die
App spielt die verbleibenden Logs neu ein und stellt Paces, Tiers und Kraftfaktor auf den Stand ohne
diesen Tag. Ein Fehlklick verzieht also nichts dauerhaft.

Die **Form deiner Woche** — feste Wochentage für Long Run, Kraft und Ruhe — legst du auf der
[Setup-Seite](#8-settings--setup--tools) fest.

### Verschieben

Für eine **einzelne** Woche abweichen — ohne den Standard zu ändern — geht weiterhin über Move:

**Move** sitzt im aufgeklappten Zustand der Einheit — eine Zeile „Verschieben" unter jeder
zugeklappten Karte wäre Mobiliar in einer Liste, die man nach dem heutigen Training überfliegt.
Karte antippen, dann **Move**: ein Tap öffnet die Wochentage — Mo bis So als Reihe. Der Tag, auf dem die Einheit schon liegt, ist markiert und nicht anklickbar; jeder andere
verschiebt sie dorthin.

**Ein belegter Tag ist kein Fehler, sondern ein Tausch.** Liegt auf dem Zieltag schon eine Einheit,
tauschen die beiden ihre Tage. Nichts fällt weg, und kein Tag bekommt zwei Einheiten in derselben
Tageshälfte. Der Hinweis am Chip sagt das vorher an („Mittwoch ist belegt — die beiden Einheiten
tauschen die Tage").

**Doppeltage:** Trägt der Tag eine AM- *und* eine PM-Einheit, erscheint zusätzlich eine Umschaltung
für die Tageshälfte. Ohne Doppeltag entfällt sie — dann ist Verschieben ein einziger Tap.

Was dabei passiert:

- Eine noch offene Einheit bekommt den Status **„moved"** und bleibt normal loggbar.
- Eine **bereits geloggte** Einheit behält ihren Status: Verschieben wirft „erledigt" oder
  „ausgelassen" nicht weg.
- Der Tausch läuft in **einer** Transaktion. Ein Abbruch mittendrin kann die Woche nicht in einen
  Zustand mit zwei Einheiten auf derselben Tageshälfte bringen.
- Jede Verschiebung landet im Anpassungsprotokoll — inklusive der Einheit, mit der getauscht wurde.

**Eine Verschiebung überlebt einen Neuaufbau.** Wird der Plan neu gerechnet — Volumen geändert,
Wochenform gespeichert, nach einer Verletzung, oder automatisch nach sieben inaktiven Tagen —
kommt jede von Hand verschobene Einheit auf ihren Tag zurück. Die App merkt sich das an der
**Kalenderwoche**, nicht an der Planwoche: Wochennummern verschieben sich beim Neuaufbau, Montage
nicht. Ein Tausch wird als beide Hälften gemerkt, kommt also vollständig zurück.

Zwei Grenzen, die du kennen solltest: Enthält die neu gebaute Woche die Einheit nicht mehr (etwa
weil ein Deload sie gestrichen hat), verfällt die Verschiebung. Und ein **Renntag** hat Vorrang —
er ist eine Tatsache im Kalender, deine Verschiebung eine Präferenz.

Verschieben gilt innerhalb der Woche; gesperrte Wochen bieten es nicht an. Im [Demo](#15-demo--ausprobieren-ohne-konto)
funktioniert es genauso, nur ohne Konto.

---

## 6. Wie sich der Plan anpasst

Zwei Schichten, klar getrennt:

**Schicht 1 — nach jeder Einheit (Mikro).** Aus deiner Rückmeldung werden Pace-Zonen, Stations-Tiers
und der Kraftfaktor in kleinen Schritten nachgeführt (±5 s/km, ±5 % Last), gedeckelt auf ±3 % pro
Woche, damit nichts davonläuft.

**Schicht 2 — nachts (Makro).** Ein Hintergrundlauf prüft die Belastungsentwicklung:

Eine Skalierung wird je Plan, Woche und Direktive nur einmal angewendet. Wiederholte Cron-Aufrufe
verkürzen die gleichen Einheiten nicht Nacht für Nacht erneut. Unterschiedliche Direktiven
(z. B. Trim und Deload) bleiben unterschiedliche Entscheidungen.

**ACWR-Kaltstart:** Solange seit dem ersten verwertbaren Log noch keine 28 Beobachtungstage
vorliegen, bleibt ACWR neutral bei 1,0; die chronische Last wird vorläufig mit der akuten Last
angezeigt. Fehlende Historie erzeugt damit keinen künstlichen Belastungssprung. RPE- und
Inaktivitätsregeln gelten trotzdem. Der Makro-Cron berechnet die Lastfenster vor jeder Prüfung neu.

| Signal | Reaktion |
|---|---|
| ACWR über 1,3 | Restwoche wird auf 85 % getrimmt |
| ACWR über 1,5 | Automatischer Deload |
| Dauerhaft hohe RPE (14 Tage) | Automatischer Deload |
| ACWR unter 0,8 | Sanfter Wiedereinstieg |
| 7 Tage inaktiv | Plan wird ab heute neu aufgebaut |

**Die Woche ist physiologisch sortiert.** Der Planer hält beim Verteilen der Tage zwei Regeln ein:
Zwischen zwei harten Ausdauertagen liegt immer ein Zone-2-Tag, ein Kraft-/Stationstag oder eine
Kalenderlücke — nie zwei harte Tage direkt hintereinander. Und Krafttraining (das mit Plyometrie
beginnt) liegt nie auf dem Tag unmittelbar nach einem harten Tag, weil das Nervensystem dafür
24–48 h Frische braucht. Auf Doppeltagen kommt die anspruchsvollere Einheit zuerst (Kraft/Station
am Morgen), die PM-Einheit ist immer leicht — der AM/PM-Abstand ist genau die Trennung, die der
Interferenz-Effekt verlangt. In Basis und Build weist die Laufauswertung zudem darauf hin, dass
20–40 % der lockeren Kilometer auf SkiErg, Ruderergometer oder Rad wandern können — gleicher
Motor, schonender für die Achillessehne.

**Rebase statt Flickwerk.** Wenn sich etwas Grundlegendes ändert — Verletzung, Pause, neues
Laufvolumen — wird der Plan **ab heute neu gerechnet**, nicht rückwirkend verbogen. Vergangene
Wochen bleiben als Protokoll stehen.

**Coach-Feedback.** Nach dem Loggen erscheint eine Karte mit einem Erfüllungsindex und einem kurzen
Text, was die Anpassung bedeutet. Der Text ist deterministisch vorformuliert; ist ein API-Schlüssel
hinterlegt, wird er sprachlich veredelt — fällt das aus, steht der Standardtext da. **Der Plan
selbst wird nie von einem Sprachmodell verändert.**

**Alles ist protokolliert.** Jede automatische Anpassung landet mit Grund in einem Änderungs-Log,
das du auf `/plan` und `/progress` sehen kannst.

---

## 7. `/season` — Rennkalender und Jahresplanung

### Rennen eintragen

Zwei Wege: als Zeile (Datum, Bezeichnung, Priorität) oder **per Klick auf einen Tag im Kalender**.
Ein per Klick angelegtes Rennen startet als Nebenwettkampf und kann oben hochgestuft werden.

### Die drei Prioritäten

| | Was es ist | Was der Plan daraus macht |
|---|---|---|
| **A — Hauptrennen** | Das Rennen, um das die Saison gebaut wird | Eigener Makrozyklus: voller Taper davor, 2–3 Erholungswochen danach. Die letzten zwei Tage gehen von den Beinen, der Tag danach ist Erholung. |
| **B — Nebenwettkampf** | Wichtig, aber nicht *das* Rennen | Läuft im laufenden Block mit: 3 lockere Tage davor, 2 danach, Woche auf 80 % Volumen. Kein eigener Zyklus. |
| **C — Testrennen** | Formtest, harte Einheit mit Startnummer | Kein Taper. Es **ersetzt** die harte Einheit der Woche, danach ein lockerer Tag. |

Gibt es kein A-Rennen, wird das letzte automatisch dazu erklärt — mit Hinweis. Liegen zwei
A-Rennen zu dicht beieinander, sagt die App, dass der zweite Zyklus fast nur aus Taper und
Erholung besteht.

### Was du danach siehst

Oben rechts steht, wie viele Tage bis zum **nächsten Hauptrennen** bleiben.

- **Das Jahr** als durchgehender Balken pro Makrozyklus: jeder Block breitengetreu, der aktuelle
  hervorgehoben und unterstrichen, die Rennen des Zyklus mit Datum darunter. Das ist der Blickfang —
  alles Weitere auf der Seite erklärt ihn.
- **Kalender**: die nächsten vier Monate, Tage in der Farbe ihres Blocks, Rennen auf ihrem echten
  Datum (Buchstabe = Priorität, weißer Punkt = Hauptrennen). „Show all … weeks" klappt das ganze
  Jahr auf.
- **Blockliste** statt Kartenwand: eine Zeile je Block mit Farbleiste, Wochen, Volumen und
  Deload-Wochen; antippen zeigt Schlüsseleinheiten, Zeitraum und die adressierten Schwachstellen.
- **„How this year was planned"**: die Entscheidungen des Planers im Klartext — dieselbe Darstellung
  wie „Why your plan changed" in der Wochenansicht, weil es dasselbe auf einer anderen Flughöhe ist.
- **Der Renn-Editor** steht darunter, nicht darüber: Sobald eine Saison existiert, ist das Jahr die
  Hauptsache und das Formular das Werkzeug. Ohne Saison ist es umgekehrt.

### Schwachstellen

Ein Freitextfeld („Sled Push, Laktattoleranz, Wall Balls"). Jede Schwachstelle wird dem Block
zugeordnet, in den sie gehört — Kraft in die Basis, Laktattoleranz in den Build, Renndurchführung in
den spezifischen Block. Zusätzlich zielt **jede zweite Woche** die Variantenwahl auf deine
schwächste Station.

### Vom Kalender zum Wochenplan

**„Build the training plan for the next main race"** erzeugt den detaillierten 4–20-Wochen-Plan aus
dem Kalender: nächstes Hauptrennen als Ziel, alle Rennen dazwischen als echte Renntage im Plan. Der
Kalender überlebt auch einen Rebase.

---

## 8. `/settings` — Setup & Tools

Erreichbar über **Setup** rechts oben, auf jeder Seite. Drei Gruppen, nach dem sortiert, was du
entscheidest.

### Deine Trainingswoche

Beide Regler bauen die **verbleibenden Wochen** neu auf; vergangene Wochen bleiben als Protokoll
stehen. Ohne bestehenden Plan gelten sie für den nächsten.

**Die Form deiner Woche.** Ganz oben **Trainingstage** (3–6) und **Doppeltage** (0–3) — zusammen
ergeben sie deine Einheiten pro Woche. Direkt darunter steht, wie das zu deinem Level passt, und
zwar **live**: Jede Änderung an den Chips rechnet den Hinweis neu, bevor du speicherst.

Darunter sieben Schalter je Zeile für **Long Run**, **Kraft** und **Ruhetage**, Montag zuerst. Die
Obergrenze für Ruhetage (`7 − Trainingstage`) bewegt sich mit; nimmst du Trainingstage weg, werden
zu viele Pins automatisch gekürzt statt dich am Speichern-Knopf auflaufen zu lassen.

*Harte Pins:* Diese Tage gewinnen — auch gegen die Erholungsregeln. Öffnungszeiten im Gym und ein
freier Sonntag sind Tatsachen, und ein Plan, der sie stillschweigend überstimmt, wird nicht befolgt.
Alles Übrige ordnet sich um deine Pins herum an, weiterhin regelkonform, soweit die verbleibenden
Tage es zulassen.

*Weiche Warnung:* Was ein Pin kostet, steht direkt unter den Schaltern — etwa *„Strength on Thursday
follows a hard Wednesday — plyometrics wants 24-48 h of fresh legs."* Nichts wird heimlich
korrigiert; du siehst den Preis und entscheidest.

Drei Dinge lehnt die App beim Speichern ab, statt sie zu erraten: eine Laufanzahl, die nach dem
Reduzieren der Trainingstage nicht mehr hineinpasst, ein Tag, der gleichzeitig Ruhetag
und Kraft-/Long-Run-Tag ist, und mehr Ruhetage als deine Trainingsfrequenz übrig lässt. Passt die
Woche trotzdem nicht, gewinnt das Training den Tag zurück und sagt welchen.

**Laufvolumen.** Peak-Kilometer der Woche und Läufe pro Woche, dazu — sobald du geloggt hast — der
Abgleich mit dem, was deine letzten vier Wochen wirklich getragen haben. Die Obergrenze für Läufe
folgt deinen Trainingstagen: eine Einheit pro Woche bleibt Kraft oder Stationsarbeit.

### Verbindungen

Strava, Garmin und Telegram als Zeilen mit ihrem Zustand: **connected**, ein *Connect*-Knopf, oder
*not configured* — Letzteres heißt, dass die Integration auf dieser Installation gar nicht
eingerichtet ist. Ein toter Knopf wäre die schlechtere Antwort.

### Wenn etwas kaputtgeht

Verletzung melden schaltet in den Reha-Modus; im Reha-Modus steht hier der Weg zurück.

---

## 9. `/strength` — eigenes Kraftprogramm

Gedacht für alle, die ihr Krafttraining bereits in Excel führen.

**Import per Einfügen.** Bereich in Excel markieren, kopieren, ins Feld einfügen — die Zwischenablage
enthält tabulatorgetrennten Text, und genau den liest der Parser. Erkannt werden Wiederholungs-
bereiche („6 - 8"), Supersatz-Markierungen und Körpergewichts-Zeilen ohne Last.

**Vorschau vor dem Speichern.** Du siehst, was der Parser verstanden hat, und kannst korrigieren,
bevor irgendetwas gespeichert wird.

**Sätze protokollieren.** Auf der **aufgeklappten** Kraft-Einheit in `/plan` steht pro Satz ein
Eingabefeld für Wiederholungen und Gewicht; zugeklappt zeigt die Karte nur eine Programmzeile.
Leer gelassen heißt „wie programmiert" — auch wer ohne Aufklappen „As planned" tippt, loggt das
Programm wie geschrieben.

**Progression als Vorschlag.** Nach einem geloggten Training schlägt die App die nächste Last vor
(doppelte Progression: erst Wiederholungen ans obere Ende, dann Gewicht rauf). Der Vorschlag
**überschreibt nichts** — du bestätigst ihn oder ignorierst ihn.

---

## 10. `/benchmarks` — Tests eintragen

Eine Liste standardisierter Tests (z. B. 1 km Zeit, Wall Balls in 2 min). Ergebnis eintragen,
speichern — die Zielzeit-Prognose wird sofort neu gerechnet und der Verlauf auf `/progress`
fortgeschrieben. Der Plan setzt Benchmark-Wochen automatisch: Woche 1, Ende des Build-Blocks und
Beginn des Tapers.

---

## 11. `/progress` — Auswertungen

| Element | Was es zeigt |
|---|---|
| **Estimated finish** | Aktuelle Zielzeit-Prognose |
| **ACWR now** | Belastungsverhältnis akut/chronisch |
| **Avg. weekly compliance** | Geloggte gegen geplante Einheiten |
| **Sessions logged** | Gesamtzahl |
| **Weekly compliance** | Balken pro Woche |
| **Effort: planned vs. felt** | RPE-Ziel als Linie gegen dein geloggtes RPE |
| **Training load ratio** | ACWR über die Zeit, mit den Schwellen 0,8 / 1,3 / 1,5 |
| **Finish-time estimate over time** | Jede Neuberechnung der Prognose |
| **Benchmarks** | Ein Verlauf pro Test |

Die ACWR-Kurve wird Tag für Tag mit **derselben** Funktion nachgerechnet, die auch die adaptive
Schicht benutzt — Diagramm und Engine können nicht auseinanderlaufen.

---

## 12. Verbindungen: Strava, Garmin, Telegram

**Strava / Garmin.** Einmal verbinden; danach werden Läufe automatisch der passenden geplanten
Einheit zugeordnet und geloggt. Die tatsächlich gelaufene Pace fließt direkt in die
Pace-Kalibrierung. Neue Aktivitäten kommen per Webhook an — kein Polling, keine manuelle Eingabe.

Automatisch zugeordnet werden nur Läufe mit gültigem Startzeitpunkt nach Planerstellung, in der
aktuellen Planwoche und im passenden Tag-/AM-PM-Slot. Alte oder nicht passende Aktivitäten werden
nicht auf eine andere offene Einheit umgebucht. Nicht zugeordnete Läufe kannst du manuell loggen.

**Garmin-Einrichtung:** Zusätzlich zu Client-ID und Client-Secret ist `GARMIN_WEBHOOK_SECRET`
erforderlich. Die Push-URL wird mit `?token=<Secret>` registriert (alternativ Header
`x-garmin-webhook-secret`). Ohne oder mit falschem Secret antwortet der Endpunkt mit 401, auch
bei der Erreichbarkeitsprüfung. URL samt Token nicht teilen oder in öffentliche Logs übernehmen.
Pro Push sind höchstens 20 Aktivitäten erlaubt; Datenbankfehler werden nicht mehr still bestätigt.

**Telegram.** Abends kommt ein Check-in mit vier Knöpfen (dieselben wie in der App). Antippen loggt
die Einheit, ohne die App zu öffnen. Ohne Telegram gibt es stattdessen eine E-Mail.

---

## 13. Automatische Abläufe im Hintergrund

| Wann | Was passiert |
|---|---|
| Täglich abends | Check-in an alle mit einer heute noch offenen Einheit (Telegram, sonst E-Mail) |
| Nächtlich | Makro-Guardrails: ACWR-Prüfung, Auto-Deload, Rebase, Reha-Übergänge |
| Sonntagabend | Wochenrückblick: Compliance, Belastung, was nächste Woche ansteht |

Diese Läufe sind mit einem Betreiber-Secret geschützt und lassen sich nicht von außen auslösen.

---

## 14. Persönlicher Betrieb

Die App ist für den persönlichen Gebrauch eingerichtet. Alle Wochen sind immer vollständig
zugänglich; Kauf, Abo, Freischaltung und Stripe-Endpunkte sind entfernt. `PERSONAL_MODE` und
`STRIPE_*` werden nicht mehr benötigt. Bestehende Zahlungsfelder in der Datenbank bleiben aus
Kompatibilitätsgründen erhalten, steuern aber keinen Zugriff mehr.

Die Startadresse führt direkt zum Plan. Authentifizierung und Row-Level-Security bleiben aktiv.
Nach Anlage deines Kontos solltest du neue Registrierungen in Supabase deaktivieren (siehe
`personal-setup.md`). Reha-Aktivierung und der Neuaufbau nach Genesung verlangen eine Bestätigung.

---

## 15. `/demo` — ausprobieren ohne Konto

Ein kompletter Durchlauf mit Beispieldaten: Plan erzeugen, eine Einheit loggen, die Feedback-Karte
und den Anpassungs-Feed sehen. Dieselbe Engine wie in der echten App, nur mit einer
Beispiel-Bibliothek statt der Datenbank — geeignet, um Varianten, Doppeltage und die adaptive
Schicht zu zeigen.

---

## 16. Betreiber-Oberflächen

Nicht verlinkt, per `robots.txt` ausgeschlossen, durch das Betreiber-Secret geschützt.

### `/admin/knowledge` — eigenes Wissen einspeisen

Drei Wege, neues Trainingswissen in die App zu bringen:

1. **PDF** — Studie, Trainingsplan, Fachartikel. Wird gelesen und in Vorschläge zerlegt.
2. **AI-Zusammenfassung / Notizen** — bereits von einer KI analysierter Text lässt sich direkt
   einfügen, ohne Umweg über ein PDF.
3. **Fertige Vorschläge** im JSON-Format der App — nützlich, wenn die Analyse schon woanders
   stattgefunden hat und nur noch eingespielt werden soll.

Daraus entstehen **Vorschläge**, nie sofortige Änderungen: neue Bibliotheksblöcke oder geänderte
Kalibrierungskonstanten. Jeder Vorschlag wird einzeln angenommen oder verworfen. Erst mit der
Annahme ändert sich etwas am Plan.

> **Warum dieser Umweg:** Trainingsprinzipien sind frei, veröffentlichte Programme sind es nicht.
> Die Pipeline extrahiert Prinzipien und Parameter — sie gibt niemals die Einheiten einer Quelle im
> Wortlaut wieder. Die Prüfung durch einen Menschen ist der Punkt, an dem das sichergestellt wird.

Ein „Brief" fasst zusammen, was aktuell aus eigenen Quellen im System steckt.

### `/api/admin/kpis`

Kennzahlen zum Betrieb, mit demselben Secret abrufbar.

---

## 17. Begriffe

| Begriff | Bedeutung |
|---|---|
| **Phase** | Base, Build, Peak oder Taper — die vier Abschnitte eines Rennzyklus. |
| **Block** | Ein Baustein einer Einheit: Warm-up, Hauptteil, Finisher. |
| **Makrozyklus** | Ein kompletter Rennzyklus innerhalb der Saison. |
| **Deload** | Entlastungswoche. Im Jahresplan −35 %, innerhalb des Wochenplans −40 % — die beiden Ebenen führen ihre eigene Zahl, absichtlich. |
| **ACWR** | Verhältnis der Belastung der letzten 7 zu den letzten 28 Tagen. |
| **RPE** | Subjektives Anstrengungsempfinden, 1–10. |
| **Kompromittiertes Laufen** | Laufen unter Vorermüdung — das Gefühl des echten Rennens. Die Session ist **level- und phasenabhängig**: 60 Vorgaben über fünf Level und vier Phasen, siehe [Abschnitt 4](#4-plan--die-trainingswoche). |
| **Polarisiert** | 75–85 % der Laufdistanz locker, der Rest wirklich hart. Gemessen an der **Distanz je Zone**, nicht an der Zahl der Einheiten. |
| **Tier** | Leistungsstufe 1–3 pro Station; steuert Gewichte und Vorgaben. |
| **Rebase** | Neuberechnung des Plans ab heute statt nachträglicher Änderung. |
| **Variante** | Eine konkrete Ausprägung einer Kerneinheit (14 Lauf-, 11 Stations-, 5 Kraftformen). |

---

## 18. Änderungsprotokoll

Neueste zuerst. Jede Zeile nennt die Funktion und den Abschnitt, in dem sie beschrieben ist.

| Änderung | Abschnitt |
|---|---|
| 2026-09-04: Persönlicher Direkteinstieg, alle Wochen offen, Stripe entfernt, Reha-Bestätigung | [14](#14-persönlicher-betrieb) |
| 2026-09-04: Wochenfortschritt nach Kalender, idempotente Makro-Skalierungen und neutraler ACWR-Kaltstart | [4](#4-plan--die-trainingswoche), [6](#6-wie-sich-der-plan-anpasst) |
| 2026-09-04: Transaktionale Session-Logs und abgesicherter Garmin-Webhook mit engerer Laufzuordnung | [5](#5-eine-einheit-loggen-und-den-fehlklick-zurücknehmen), [12](#12-verbindungen-strava-garmin-telegram) |
| Kompromittiertes Laufen: 60 level- und phasenspezifische Sessions statt vier allgemeiner Varianten | [4](#4-plan--die-trainingswoche) |
| Trainingstage und Doppeltage sind nach dem Onboarding änderbar (Setup → Form deiner Woche), mit live mitrechnender Frequenzberatung | [8](#8-settings--setup--tools) |
| Setup & Tools ist eine eigene Seite (`/settings`), erreichbar über „Setup" rechts oben; Verbindungen zeigen ihren Zustand | [8](#8-settings--setup--tools) |
| Von Hand verschobene Einheiten überstehen einen Neuaufbau des Plans (gemerkt an der Kalenderwoche) | [5](#5-eine-einheit-loggen-und-den-fehlklick-zurücknehmen) |
| Feste Wochentage für Long Run, Kraft und Ruhetage planweit definierbar; harte Pins mit Hinweis auf ihre Kosten | [5](#5-eine-einheit-loggen-und-den-fehlklick-zurücknehmen) |
| Fünf Leistungslevel (bis World Class, sub 60) mit Einheiten-Soll; Wochenplaner hält Abstandsregeln ein (keine zwei harten Tage in Folge, Kraft nie nach hartem Tag); 16 Wochen = 5/5/4/2; Erg-Hinweis; Kohlenhydrat-Periodisierung | [3](#3-onboarding--den-plan-erzeugen), [6](#6-wie-sich-der-plan-anpasst) |
| Kraft-Einheiten: das importierte Programm klappt mit der Karte zu — zugeklappt bleibt eine Programmzeile | [4](#4-plan--die-trainingswoche), [9](#9-strength--eigenes-kraftprogramm) |
| Einheitliche Rückkehr zur Wochenansicht: gemeinsame Kopfzeile auf allen eingeloggten Seiten (Logo → `/plan`), Rückweg auch auf der Betreiberseite | [2](#2-seitenübersicht) |
| `/season` überarbeitet: das Jahr als Blickfang, Blöcke als aufklappbare Zeilen, Kalender auf vier Monate mit Aufklapp-Option, Editor nach unten. Einheitliche Kopfzeile mit `/plan` | [7](#7-season--rennkalender-und-jahresplanung) |
| `/plan` überarbeitet: Countdown statt Renndatum, Zyklus-Streifen, Intensitäts-Leiste je Einheit, die heutige Einheit als einziger Blickfang, Setup zusammengeklappt. Neue Farb- und Schriftwelt in der ganzen App | [4](#4-plan--die-trainingswoche) |
| Einheiten per Knopf auf einen anderen Wochentag verschieben; ein belegter Tag tauscht die beiden Einheiten | [5](#5-eine-einheit-loggen-und-den-fehlklick-zurücknehmen) |
| Rennkalender mit Haupt-/Nebenrennen wirkt bis in die einzelnen Trainingstage; Kalenderansicht auf `/season`; Plan direkt aus dem Kalender bauen | [7](#7-season--rennkalender-und-jahresplanung) |
| Trainingsstruktur nachgeschärft: max. zwei harte Tage, eine Simulation pro Zyklus, Plyometrie und Griffkraft als Finisher, Frequenzberatung nach Level | [3](#3-onboarding--den-plan-erzeugen), [4](#4-plan--die-trainingswoche) |
| 11 Stationsvarianten nach Phase | [17](#17-begriffe) |
| 14 Varianten der vier Kernlaufeinheiten, rotierend, jede zweite Woche auf die Schwachstelle | [4](#4-plan--die-trainingswoche) |
| Laufvolumen selbst steuern: Peak-km pro Zyklus und Läufe pro Woche | [4](#4-plan--die-trainingswoche) |
| Laufarchitektur: HF-Zonen, Paces, polarisierte Fenster, Eröffnungspuffer nach der Station | [4](#4-plan--die-trainingswoche), [17](#17-begriffe) |
| Eigenes Kraftprogramm aus Excel importieren, Sätze protokollieren, Progression als Vorschlag | [9](#9-strength--eigenes-kraftprogramm) |
| Quick-Log-Knöpfe umbenannt: „Felt harder / Felt easier" beschreiben, wie es *war* | [5](#5-eine-einheit-loggen-und-den-fehlklick-zurücknehmen) |
| Doppeltage (AM/PM) | [3](#3-onboarding--den-plan-erzeugen), [4](#4-plan--die-trainingswoche) |
| AI-Zusammenfassungen statt PDFs einspeisbar | [16](#16-betreiber-oberflächen) |
| Jahresperiodisierung mit Makrozyklen, Deloads und Mehrrennen-Logik | [7](#7-season--rennkalender-und-jahresplanung) |
| Wissenspipeline für eigene PDFs (Vorschläge mit Freigabe) | [16](#16-betreiber-oberflächen) |
| Einzelne Tage zurücksetzen — Undo nimmt auch die Kalibrierung zurück | [5](#5-eine-einheit-loggen-und-den-fehlklick-zurücknehmen) |
