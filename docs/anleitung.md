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
4. [`/today` und `/plan` — heute und die Trainingswoche](#4-today-und-plan--heute-und-die-trainingswoche)
5. [Eine Einheit loggen (und den Fehlklick zurücknehmen)](#5-eine-einheit-loggen-und-den-fehlklick-zurücknehmen)
6. [Wie sich der Plan anpasst](#6-wie-sich-der-plan-anpasst)
7. [`/season` — Rennkalender und Jahresplanung](#7-season--rennkalender-und-jahresplanung)
8. [`/settings` — Setup & Tools](#8-settings--setup--tools)
9. [`/strength` — eigenes Kraftprogramm](#9-strength--eigenes-kraftprogramm) (über Setup)
10. [`/benchmarks` — Tests eintragen](#10-benchmarks--tests-eintragen) (über Progress)
11. [`/progress` — Auswertungen](#11-progress--auswertungen)
12. [`/race` — Renntag: Pacing und Ergebnis](#12-race--renntag-pacing-und-ergebnis)
13. [Verbindungen: Strava, Garmin, Telegram](#13-verbindungen-strava-garmin-telegram)
14. [Automatische Abläufe im Hintergrund](#14-automatische-abläufe-im-hintergrund)
15. [Eine App für einen Athleten](#15-eine-app-für-einen-athleten)
16. [`/demo` — ausprobieren ohne Konto](#16-demo--ausprobieren-ohne-konto)
17. [Betreiber-Oberflächen](#17-betreiber-oberflächen)
18. [Begriffe](#18-begriffe)
19. [Änderungsprotokoll](#19-änderungsprotokoll)

---

## 1. Das Grundprinzip in drei Sätzen

1. **Der Plan wird gerechnet, nicht generiert.** Im Kern läuft kein Sprachmodell, sondern eine
   deterministische Engine (`src/lib/engine/**`): gleiche Eingaben → immer derselbe Plan. Das ist
   der Grund, warum jede Entscheidung erklärbar und testbar ist. Ein Sprachmodell darf Texte
   formulieren und [Vorschläge machen](#ki-coach-gemini) — den Plan ändert erst dein Tippen, über
   die Regeln der Engine.
2. **Rückwärts vom Renntag.** Zuerst steht der Taper fest, dann der rennspezifische Block, dann der
   Build — die Basis bekommt, was übrig bleibt.
3. **Die App passt sich an dich an, nicht umgekehrt.** Jede geloggte Einheit verschiebt Paces,
   Gewichte und Volumen ein Stück; jede Anpassung wird protokolliert und ist rücknehmbar.

---

## 2. Seitenübersicht

| Seite | Wofür | Ohne Login? |
|---|---|---|
| `/` | Leitet direkt auf `/today` weiter | ja |
| `/demo` | Kompletter Durchlauf mit Beispieldaten | ja |
| `/onboarding` | Profil anlegen, Plan erzeugen | Login nötig (Magic Link) |
| `/today` | **Tab Today:** der Tag — Wochenstreifen, die Einheit von heute, Wochenstand, Coach | nein |
| `/plan` | **Tab Plan → Week:** die Trainingswoche, eine Zeile pro Tag | nein |
| `/season` | **Tab Plan → Season:** Rennkalender und Jahresplanung | nein |
| `/strength` | Eigene Kraftprogramme — erreichbar über **Setup → Strength program** | nein |
| `/benchmarks` | Tests und Rennen eintragen — erreichbar über **Progress → Log a test / Log a race** | nein |
| `/progress` | **Tab Progress:** Prognose, Verlauf und Auswertungen | nein |
| `/progress/running` | Lauffortschritt aus Garmin — erreichbar über **Progress → Running from Garmin** | nein |
| `/race` | Renntag: Pacing-Blatt, Stationskosten, Rennergebnis | nein |
| `/settings` | Setup & Tools: Wochenform, Laufvolumen, Verbindungen, Verletzung | nein |
| `/admin/knowledge` | Betreiber: Wissensquellen einspeisen | Betreiber-Secret |

Alle eingeloggten Seiten teilen sich **einen Rahmen** im Look des HyroxTraining-Trackers (die
„Box-Whiteboard"-Optik, siehe [Das Aussehen](#das-aussehen)):

- **Am Desktop** (breiter als 900 px) steht links eine graue Aluminium-Spalte: oben das Logo
  „HYROX / HUB" (führt immer zurück auf `/today`), darunter die vier Tabs mit Symbol, unten
  **Setup**. Der Countdown steht oben rechts über dem Inhalt.
- **Am Handy** (900 px und schmaler) ist der Rahmen eine Leiste oben — Logo links, Countdown und ein
  Zahnrad für **Setup** rechts — und die vier Tabs sitzen als Tab-Leiste am unteren Rand.

**Vier Tabs, sortiert nach dem, was du gerade tust:**

| Tab | Wofür | Hängt daran |
|---|---|---|
| **Today** | In der Halle: die Einheit von heute loggen | — |
| **Plan** | Die Woche und die Saison ansehen, Einheiten verschieben | Season, über den Umschalter **Week \| Season** oben |
| **Progress** | Wo du stehst: Prognose, Ziel, Verlauf | Tests und Rennen eintragen (`/benchmarks`), Lauf-Dashboard (`/progress/running`) |
| **Race** | Renntag: Pacing-Blatt und Stationskosten | — |

Der Tab, auf dem du bist, ist schwarz gefüllt — auch auf den Seiten, die an ihm hängen: Auf der
Saison leuchtet **Plan**, auf Tests & races und dem Lauf-Dashboard **Progress**, auf dem Kraftprogramm das
**Setup**-Zahnrad. Diese Seiten haben oben links zusätzlich einen Rückweg („← Progress",
„← Setup"). Auch die Betreiberseite `/admin/knowledge` hat oben links einen Rückweg in die App.

Bis zu diesem Umbau gab es sechs gleichrangige Tabs (Week, Season, Strength, Progress, Race, Tests).
Strength und Tests sind keine eigenen Tabs mehr, ihre Seiten und Adressen gibt es aber weiter.

### Seitenwechsel

Beim Tippen auf einen Bereich wird der neue Tab **sofort** schwarz, und die Seite zeigt graue
Platzhalter in ihrer Form, bis die Daten vom Server da sind — die Navigation bleibt dabei stehen.
Vorher blieb bei Season, Strength, Race und Setup die alte Seite ohne jede Rückmeldung stehen, bis
die neue fertig war.

**Ein Bereich, den du vor weniger als 30 Sekunden offen hattest, erscheint beim Zurückwechseln
ohne Ladezeit** — aus dem Zwischenspeicher des Browsers. Alles, was du selbst in der App änderst
(Loggen, Tauschen, Einstellungen speichern …), leert diesen Speicher sofort; was in diesen 30
Sekunden höchstens nachhinkt, ist etwas, das im Hintergrund ankam (z. B. ein Strava- oder
Garmin-Lauf). Neu laden zeigt in dem Fall sofort den aktuellen Stand.

### Das Aussehen

HyroxApp sieht aus wie der HyroxTraining-Tracker: ein heller, kühler Whiteboard-Grund im grauen
Aluminiumrahmen, weiße Tafeln mit dünnen grauen Linien, Überschriften und Zahlen in schmalen
Großbuchstaben (Barlow Condensed), Text in Barlow. Nur hell — einen Dunkelmodus gibt es nicht.

Jede Markerfarbe bedeutet genau eine Sache:

| Farbe | Bedeutung |
|---|---|
| Schwarz | Alles, was du drücken kannst; ausgewählte Chips und Tage sind schwarz gefüllt |
| Rot | Harte Einheiten, Ziele und offene Lücken, Fehler |
| Blau | Laufen — und Links sowie der Fokusrahmen beim Tippen mit der Tastatur |
| Grün | Erledigt (und schon erreichte Ziele), sonst nichts |
| Orange | HYROX-Stationen und Kraft |

Schaltflächen sind 48 px hoch, Eingabefelder 50 px, Chips 44 px — mit Handschuhen und verschwitzten
Fingern treffbar.

---

## 3. Onboarding — den Plan erzeugen

**Anmeldung** läuft über einen Magic Link: E-Mail eingeben, Link im Postfach klicken. Kein Passwort.

**Auf mehreren Geräten.** Handy und PC können gleichzeitig angemeldet sein — die Sitzung liegt als
Cookie im jeweiligen Browser. Wichtig: **Der Link funktioniert nur in dem Browser, der ihn
angefordert hat.** Am PC anfordern und die Mail am Handy öffnen geht nicht; fordere den Link auf
jedem Gerät neu an. Die Anmeldeseite sagt das auch.

**Hast du schon einen Plan, landest du nach der Anmeldung direkt auf `/today`.** Das Formular unten
erscheint dann gar nicht mehr — es würde beim Absenden einen neuen Plan bauen und den bestehenden
verwerfen. Willst du wirklich von vorne anfangen, rufe `/onboarding?new=1` auf.

Beim ersten Mal folgen vier kurze Schritte. Alles ist später änderbar.

| Eingabe | Was sie bewirkt |
|---|---|
| **Division** (Open, Pro, Doubles, Masters) | Bestimmt die Wettkampfgewichte in jeder Station-Beschreibung (z. B. Sled 152 kg vs. 202 kg). |
| **Erfahrungslevel** | Start-Tiers der Stationen, Grundlage für die Frequenzberatung. |
| **Trainingstage pro Woche (3–6)** | Wie viele Slots eine Woche bekommt. Bei 5 Tagen überleben die fünf höchstpriorisierten Einheiten der Phase. *Später jederzeit unter [Setup](#8-settings--setup--tools) änderbar.* |
| **Doppeltage (0–3)** | Tage mit AM- und PM-Einheit. Die PM-Einheit ist immer die leichtere. *Später jederzeit unter [Setup](#8-settings--setup--tools) änderbar.* |
| **Peak-km pro Woche** | Die eine Zahl für das Laufvolumen; eine Kurve verteilt sie über die Phasen. Der Gipfel liegt in der **Basis** — siehe [6](#6-wie-sich-der-plan-anpasst). |
| **Läufe pro Woche** | Optional. Verschiebt die Mischung Richtung Laufen — genau ein Nicht-Lauf-Slot bleibt geschützt. |
| **Equipment** (Full Gym / Home / Hybrid) | Wählt zwischen Gym- und Home-Varianten aller Blöcke. |
| **5-km-Zeit** | Leitet alle Pace-Zonen ab (easy / race / interval) und die erste Zielzeit-Prognose. |
| **Level** | Was du heute tragen kannst: Trainingsmischung, Sessionkataloge, Einheitenzahl, Start-Tiers. |
| **Zielzeit** | Was du anstrebst. Schlägt zunächst die Zeit des Levels vor und folgt ihm nicht mehr, sobald du selbst eine wählst. |
| **Renndatum** | Aus der Rennliste oder frei gewählt. Der Plan wird rückwärts davon geplant. |
| **Startdatum** | Der Montag, an dem Woche 1 beginnt — voreingestellt der kommende. Alles, was „welche Woche ist jetzt" beantwortet, zählt von hier. Ein anderer Wochentag rastet auf den Montag seiner Woche ein. |

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

## 4. `/today` und `/plan` — heute und die Trainingswoche

Ohne ausdrücklich gewählte Woche zeigt die App die aktuelle Kalenderwoche des Plans. Woche 1
beginnt am **Startdatum** des Plans (ein Montag, unter Setup änderbar); montags schaltet die
Ansicht weiter. Vergangene Wochen bleiben einsehbar und ihre Logs erhalten. Welcher Tag „heute"
ist, rechnet der Server in der Trainingszeitzone `APP_TIME_ZONE` (Standard: Europe/Berlin) — das
gilt für die aktuelle Woche, die abendlichen Check-ins und automatisch zugeordnete Läufe.

Zwei Seiten zeigen dieselbe Woche aus denselben Daten: **Today** (`/today`) ist der Bildschirm für
die Halle, **Plan → Week** (`/plan`) die Übersicht. Eine auf der einen Seite geloggte Einheit ist
auf der anderen sofort dieselbe.

### `/today` — der Start

Die App öffnet hier (auch als installierte App vom Startbildschirm).

- **Kopf:** Phase und „Week N of M", darunter groß **Today** mit dem Datum.
- **Wochenstreifen:** sieben Kacheln Mo–So mit Datum. Unter jedem Tag ein Punkt pro Einheit in der
  Farbe dessen, was sie verlangt (rot hart, blau Laufen, orange Kraft/Station); erledigte Einheiten
  sind grün, ausgelassene grau. Heute hat einen schwarzen Rahmen. **Ein Tap auf einen anderen Tag**
  zeigt dessen Einheit darunter, die Überschrift wechselt auf den Wochentag.
- **Die Einheit des gewählten Tags** als volle [Einheitenkarte](#eine-einheitenkarte) mit dem
  Knopf **Done** ([Loggen](#5-eine-einheit-loggen-und-den-fehlklick-zurücknehmen)). Ein Tag ohne
  Einheit zeigt die Ruhetag-Kachel.
- **This week:** der Wochenfortschritt (siehe unten) und **„Whole week →"** in den Plan-Tab.
- **Why this week**, **AI coach**, **Why your plan changed** und der **Ernährungshinweis** der
  Phase — siehe [Was unter der Einheit steht](#was-unter-der-einheit-steht).

Today zeigt immer die laufende Woche. Zum Blättern ist der Plan-Tab da.

### Was oben steht

Oben rechts (am Handy in der Leiste oben) steht der **Countdown** — nicht das Renndatum, sondern
wie viele Tage bleiben. Im Plan-Tab steht darunter der Umschalter **Week | Season** und dann der
**Zyklus-Streifen**: eine Linie
pro Woche in der Farbe ihrer Phase, die aktuelle Woche hervorgehoben, ein orangefarbener Punkt über jeder
Deload- und Benchmark-Woche. Anklicken springt in die Woche.

### Die Wochenansicht

- **Wochenkopf:** Phase, „Week 6 of 12" und links/rechts je ein Pfeil (‹ ›) zur vorigen bzw.
  nächsten Woche. In der ersten und letzten Woche ist der jeweilige Pfeil ausgegraut.
- **Wochenfortschritt:** ein Balken mit einem Segment pro Einheit (Ruhetage zählen nicht mit) —
  grün = erledigt, grau = ausgelassen, dunkel = offen. Darunter „2 of 5 sessions done" und, falls
  vorhanden, die Zahl der ausgelassenen und die geplanten Laufkilometer. Ein gespeichertes
  „Done" füllt das Segment sofort.
- **„Go to this week →"** erscheint rechts daneben, sobald du eine andere als die laufende Woche
  ansiehst, und bringt dich mit einem Tap zurück.
- **Why this week:** das Wochenziel — warum diese Woche so aussieht (Phase, Deload,
  Benchmark — oder das Rennen, das in ihr liegt). Der Text kommt unverändert aus der Engine. Er
  steht auf zwei Zeilen gekürzt; **More** klappt ihn ganz auf.
- **Wochenwechsel** außerdem über den Zyklus-Streifen darüber; abgeschlossene Wochen bleiben lesbar.
- **Doppeltage** sind mit AM/PM markiert.
- **Laufauswertung der Woche:** geplante Kilometer, Anteil im lockeren Bereich, und ob das im
  polarisierten Fenster der Phase liegt. Liegt es daneben, nennt die Karte den Hebel (meist: ein
  Doppeltag holt die Kilometer zurück).
- **Die Woche als Liste:** eine Zeile pro Tag — Wochentag und Datum, Titel, Typ und Dauer, rechts
  ein Statuskreis (leer = offen, grün mit Haken = erledigt, grau = ausgelassen). Links die farbige
  Leiste der Intensität. Die Zeile von heute hat einen schwarzen Rahmen.
- **Eine Zeile antippen** öffnet die Einheit als eigene Ansicht, die von unten hochfährt (am
  Desktop mittig): die volle [Einheitenkarte](#eine-einheitenkarte), schon aufgeklappt, mit Done,
  Swap und dem ⋯-Menü. Schließen über ✕, Escape oder einen Tap daneben; nach dem Loggen oder
  Verschieben schließt sie von selbst.

### Ruhetage

Die Woche zeigt **alle sieben Tage**, nicht nur die mit Training. Ein Tag ohne Einheit bekommt eine
eigene, ruhige Kachel mit Wochentag und Datum — gestrichelter Rand, nichts zum Antippen, nichts zu
loggen. Vorher endete die Liste bei den Trainingstagen, und man musste rückwärts zählen, um einen
Ruhetag von einer Einheit zu unterscheiden, die man längst geloggt hatte.

Hast du den Tag im [Setup](#8-settings--setup--tools) als festen Ruhetag gesetzt, sagt die Kachel
das („One of your fixed rest days") — sonst steht dort, dass nichts geplant ist. Diese Kachel
erscheint auf Today, wenn der gewählte Tag frei ist; in der Wochenliste des Plan-Tabs ist ein
Ruhetag eine gestrichelte Zeile „Rest day".

**Ruhetage stehen nicht im Plan, sie werden abgeleitet.** Die Engine erzeugt Einheiten nur für Tage
mit Arbeit, und das ist richtig: Die Zahl der geplanten Einheiten fließt in Compliance und
Belastung — erfundene Zeilen für die freien Tage würden beides aufblähen. Die Kachel entsteht erst
beim Anzeigen: Wird ein Tag leer, weil du seine Einheit auf einen **freien** Tag verschoben hast,
zeigt er ab sofort einen Ruhetag. Landet die Einheit dagegen auf einem **belegten** Tag, tauschen
die beiden ihre Tage ([Verschieben](#5-eine-einheit-loggen-und-den-fehlklick-zurücknehmen)) — dann
bleibt auf dem Ausgangstag die getauschte Einheit stehen und er wird gerade *kein* Ruhetag.

Bei einer vergangenen Woche steht nie „einer deiner festen Ruhetage": Feste Ruhetage sind eine
Einstellung von heute, und die Woche von damals wurde vielleicht ohne sie gebaut.

### Eine Einheitenkarte

Oben links steht **Wochentag und Datum** („MON 2 MAR"). Der Wochentag allein ist mehrdeutig, sobald
man eine Woche zurückblättert, um zu sehen, was liegen geblieben ist — das Datum ist es nicht. Es
wird aus dem Startdatum des Plans, der Wochennummer und dem Wochentag gerechnet, nicht gespeichert:
Verschiebst du das Startdatum, wandern alle Datumsangaben mit.

Bei Doppeltagen steht zusätzlich **AM** oder **PM** dahinter.

**Kompromittierte Läufe** kommen aus einem eigenen Katalog: 60 Sessions über fünf Leistungslevel
und vier Phasen, je drei pro Kombination. Was du bekommst, hängt an deinem Level — ein Beginner
läuft 800 m nach leichten Lunges, ein World-Class-Athlet 1000 m in 3:45–3:55 nach dem Pro-Schlitten
mit unter fünf Sekunden Transition. Jede zweite Woche zielt die Auswahl auf deine schwächste
Station. Ohne Ergometer bekommst du nie eine Erg-Session — die App weicht auf eine andere aus,
statt die Einheit zu streichen.

**Welche Station eine Woche bekommt.** Innerhalb jeder Phase werden die Wochen auf die Stationen
verteilt, **gewichtet nach dem, was dich die Station im Rennen kostet** — dieselben Sekunden, die
auf [`/race`](#12-race--renntag-pacing-und-ergebnis) als Stationskosten stehen. Dazu eine
**Untergrenze** (keine Station fällt ganz durch; sie würde verkümmern, und die Kosten sind bis zum
ersten geloggten Rennen nur geschätzt) und eine **Obergrenze** (höchstens das Doppelte des gleichen
Anteils — ungedeckelt nahm eine einzige teure Station neun von sechzehn Wochen). Sind alle Stationen
auf dem obersten Tier, kostet keine etwas, und die Verteilung fällt auf einen reinen Rundlauf
zurück.

**Eine Einheit trainiert selten nur eine Station.** Nur 3 der 60 Stationseinheiten trainieren genau
eine; der Rest kommt auf zwei bis acht. „Row, Lunge, Throw" ist als *Row* überschrieben und enthält
RowErg, Ausfallschritte und Wall Balls. Jede Session führt deshalb **alle** Stationen, die sie
tatsächlich trainiert — die Überschrift ist nur ihr Schwerpunkt. Die Gewichtung zählt die echten,
nicht die Überschriften; sonst würde der Farmers Carry als unterversorgt gelten, obwohl er in einem
16-Wochen-Plan achtmal vorkommt.

**Krafteinheiten zählen nicht als Stationstraining.** Sie sind da, um dich stärker zu machen. Sie
mitzuzählen würde behaupten, der Plan decke Stationen ab, die er nicht abdeckt. Dasselbe gilt für
den Intervall-Katalog — die einzige Laufeinheit ganz ohne Stationsarbeit, mit Absicht.

*Eine ehrliche Grenze:* Ein Katalog-Pool für ein Level und eine Phase enthält drei Sessions. Über
einen ganzen Zyklus folgt die Häufigkeit den Kosten deshalb nur grob: Gemessen an einem
16-Wochen-Plan liegt sie zwischen 5 und 13 Einheiten je Station. Wer das enger haben will, braucht
mehr Katalog-Sessions je Phase, nicht mehr Logik.

**Stationsarbeit** hat seit demselben Prinzip einen eigenen Katalog: noch einmal 60 Sessions über
fünf Level und vier Phasen. Isolierte Stationsarbeit trainiert Bewegungsökonomie, Kraftausdauer und
Laktattoleranz an den Geräten — ohne die muskuläre und orthopädische Rechnung, die noch ein Lauf
aufmachen würde. Genau deshalb steht sie in Wochen, in denen ein weiterer harter Lauf zu viel wäre.
Auch hier entscheidet dein Level: ein Beginner lernt in Woche 2 die Schlittenposition mit 75 kg, ein
World-Class-Athlet drückt 50 m Pro-Gewicht unter 1:15. **In keiner dieser Einheiten steckt ein
Laufmeter** — sie zählen nicht auf dein Wochenvolumen.

**Intervalle** (Schwelle und VO₂max) haben seit demselben Prinzip ihren eigenen Katalog: 86
Sessions über fünf Level und vier Phasen, vier pro Kombination — bei Elite und World Class fünf in
Base, Build und Peak. Das ist die **einzige Laufeinheit ohne jede Stationsvorbelastung**, und zwar
mit Absicht: ein Schlitten vor den Intervallen deckelt das Tempo und verwischt den
physiologischen Zielbereich. Ein Beginner läuft 3× 6 Min an der unteren Schwelle, ein
World-Class-Athlet 8× 1000 m im Renntempo bei 30 s Pause und maximal 1–2 s Split-Varianz. Nichts
davon braucht ein Gerät — die Einheit funktioniert auch ohne Gym.

**Jede dieser 86 Sessions nennt ihre eigene Pace-Zone.** Der Katalog spannt drei Intensitäten, und
sie sind nicht dieselbe Zahl:

| Vorgabe der Session | Angezeigte Zone |
|---|---|
| LT2, Schwelle, anaerobe Schwelle, 10-km-Pace | **threshold** (`tempo`) |
| VO₂max, 3-km-Pace, 5-km-Pace, 95–100 % HFmax | **intervals** (`interval`) |
| Hyrox-Renntempo | **race pace** |
| Wechselläufe, Progressionen, Steigerungen nach einem Rep | **keine** — siehe unten |

Die Pace-Kachel auf dem Block nennt die Zone mit („threshold · 4:06/km"), damit eine Zahl nicht als
etwas anderes gelesen werden kann, als sie ist. Bei **gemischten** Einheiten — 1 Min schnell /
1 Min locker, ein Progressionslauf, ein Rep plus Steigerung — steht **gar keine Zielpace**: Es gibt
keine einzelne Zahl, die sie beschreibt, und eine falsche ist schlechter als keine.

*Bis vor Kurzem erbte jede Intervall-Session eine einzige Zone von ihrem Session-Typ.* Eine
25-Minuten-Einheit an der LT2 wurde damit im Intervalltempo ausgeschrieben — bei einem Athleten mit
19:00 auf 5 km 3:37/km statt 4:06/km, also **29 Sekunden pro Kilometer zu schnell.** Das galt für
rund zwei Drittel des Katalogs. Dasselbe traf die Kalibrierung: Eine geloggte Schwellen-Einheit
verschob die Intervall-Zone — die einzige Zahl, die diese Einheit nie berührt hat. Beides zieht
jetzt an der Zone, an der die Session tatsächlich gelaufen wurde.

Alle drei Kataloge rotieren durch die Sessions einer Phase. Steht eine Station als Schwäche
fest, gehört ihr jede zweite Woche; die Wochen dazwischen rotieren weiter durch den Rest, sodass
keine Session ungenutzt liegen bleibt. Solange alle Stationen auf derselben Stufe stehen — der
Zustand jedes neuen Kontos — gibt es keine Schwäche, und es wird auch keine erfunden. Intervalle
nennen gar keine Station und rotieren deshalb immer schlicht der Reihe nach.

*Voraussetzung:* Die 206 Sessions liegen als Bibliothekseinträge in der Datenbank. Wer die App
selbst betreibt, muss `supabase/setup.sql` nach dem Update einmal laufen lassen — sonst scheitert
der Planaufbau mit einer Meldung, die genau das sagt.

**Ausnahme: die Erg-Leiter.** Zielt eine Build-Woche auf eine schwache Wall-Ball-Station, kommt
statt der Einheit aus dem Level-Katalog die **Erg-Leiter mit 100 Wall Balls**: 5 × 1000 m SkiErg
oder RowErg ohne Pause, jeder Kilometer 3–5 s/500 m schneller als der vorige, danach sofort 100
Wall Balls in geplanten Sätzen. Sie braucht ein Ergometer.


Links an jeder Einheit sitzt eine **Intensitäts-Leiste** in der Farbe dessen, was der Tag verlangt:
rot = hart, blau = aerob (Laufen), orange = Kraft und Stationen, grau = Erholung. Die Wochenform ist
damit sichtbar, bevor ein Wort gelesen ist — zwei rote Leisten heißen: harte Woche.

**Die Einheit von heute** hat einen schwarzen Rahmen und als einziges Element der Seite einen
Schatten — sie „hebt sich" vom Board ab — und trägt als einzige einen gefüllten Knopf. Eine
erledigte Einheit wird grün durchgestrichen, eine geloggte sitzt grau auf dem Board. Andere
Einheiten tragen denselben Knopf **Done**, nur ruhiger.

**Ein Knopf auf der Karte:** **Done** ([Loggen](#5-eine-einheit-loggen-und-den-fehlklick-zurücknehmen)).
Alles, was man mit einer Einheit *macht* statt sie zu trainieren — **Skip** und **Move** —, sitzt
oben rechts im **⋯-Menü**.

**Der Verlauf der Einheit** steht als dünner Balken unter der Kopfzeile: ein Abschnitt pro Block,
so breit wie der Block Schritte hat. Warm-up und Mobility sind blass grau, der Hauptteil in der
Farbe des Tages, ein Finisher rot. So sieht man vor dem Aufklappen, ob die Einheit lang locker oder
kurz und hart endet.

Zugeklappt: Titel, Typ, Dauer, RPE-Ziel. Bei Laufeinheiten zusätzlich direkt sichtbar:

- **Variante** der Woche (z. B. „Pyramid Intervals") — und ob sie auf deine Schwachstelle zielt
- **HF-Zone** und **Zielpace**
- Bei kompromittierten Läufen: **die Eröffnungspace** (+20 s/km über die ersten 400 m)

Aufgeklappt: alle Blöcke als **Abschnitte** — „Warm-up" (grau), „Main set" (in der Farbe der
Intensitäts-Leiste), „Finisher" (rot), „Mobility" (grau). Jeder Abschnitt hat eine farbige
Kopfzeile mit Station, Tier, Zielpace oder Lastfaktor rechts daneben; darunter die Schritte,
**über die ganze Einheit durchnummeriert** (1, 2, 3 … vom Warm-up bis zum letzten Block), je mit
Übung, Dosis (z. B. „3 × 8", „4 × 60 m", „rest 90s") und Gewicht rechts — gerendert auf deine
Division und deinen aktuellen Stand. Kraft-Einheiten zeigen dort zusätzlich dein importiertes
Programm als **Satz-Tabelle** (siehe [Abschnitt 9](#9-strength--eigenes-kraftprogramm));
**zugeklappt** steht stattdessen nur eine Zeile (Programmname, Übungszahl), und der Knopf heißt
**Log sets** — er öffnet die Karte mit der Satz-Tabelle. Aufgeklappt heißt er **Finish**.

Kraft- und Stationseinheiten zeigen aufgeklappt über den Blöcken zusätzlich **Name und Zweck ihrer
Variante**. Stammt die Einheit aus der [Verona-Sammlung](#workouts), steht darunter klein
„Verona plan: …" mit dem Originalnamen aus dem Tracker — bei Laufeinheiten an derselben Stelle
unter der Zonen-Erklärung.

Renntage tragen keine Vorgabe: dort steht, dass das Event die Einheit ist.

### Was unter der Einheit steht

Auf **Today**, unter der Einheit des Tages:

| Karte | Funktion |
|---|---|
| **This week** | Wochenfortschritt und „Whole week →" in den Plan-Tab. |
| **Why this week** | Das Wochenziel der Engine, auf zwei Zeilen gekürzt, mit **More**. |
| **AI coach** | Rückblick auf die letzten drei Wochen und bis zu drei Vorschläge für die kommenden Einheiten — nur mit Gemini-Key, siehe [unten](#ki-coach-gemini). |
| **Why your plan changed** | Jede automatische Anpassung im Klartext (siehe Abschnitt 6). |
| **Ernährung** | Ein kurzer, phasenabhängiger Hinweis. |

Die **Prognose (Estimated finish)** mit Ziel, Abstand und Pace-Zonen steht seit dem Umbau oben auf
[Progress](#11-progress--auswertungen) — bei den anderen Zahlen, die sagen, wo du stehst. Setup
erreichst du über das Zahnrad.

**Liegst du auf Kurs?** (auf Progress) Unter der Prognose steht deine Zielzeit und was zwischen beiden liegt — und
zwar aufgeteilt: wie viel davon **noch in den Stationen steckt** (mit der teuersten zuerst) und wie
viel **aus den Beinen kommen muss.** Steckst du bereits innerhalb des Ziels, steht dort, wie weit.

Bei einem ambitionierten Ziel kommt eine Zeile dazu: welche Pace die acht Kilometer dann noch
verlangen, *wenn jede Station schon perfekt wäre.* „Sub 50" kommt als 1:47/km zurück — das
beantwortet sich selbst, ohne dass die App jemandem sein Ziel ausreden muss.

Die Zielzeit steuert den Plan **nicht**. Sie ist der Maßstab, nicht die Vorgabe: Ein Wunschziel
würde die Trainingspaces sonst in den Verletzungsbereich schieben.
| **Coach-Feedback** | Erscheint nach dem Loggen als Overlay (siehe Abschnitt 6). |

### KI-Coach (Gemini)

Die Karte **AI coach** auf Today, unter dem Wochenstand. Sie ist nur aktiv, wenn auf dem Server
`GEMINI_API_KEY` gesetzt ist; ohne Key steht dort „Off" und sonst nichts — die App arbeitet wie
vorher. In gesperrten Wochen (Free Preview) erscheint die Karte nicht.

**Review my training** schickt eine Zusammenfassung deiner Daten an Gemini (Google): die geloggten
Einheiten der letzten 21 Tage (RPE Soll/Ist, Dauer, Erfüllungsindex, deine Notizen), ausgelassene
Einheiten, importierte Einheiten aus HyroxTraining aus demselben Zeitraum, ACWR und Belastung, Phase, Renndatum, Zielzeit, — wenn eingetragen — die
[Rennanalyse](#rennen--simulationen) und — wenn Garmin-Läufe importiert sind — deine
[Garmin-Laufdaten](#garmin-läufe-im-training): Kilometer und Pace der letzten sechs Wochen, der
Vergleich der letzten vier Wochen mit den vier davor, VO2max jetzt und vor etwa vier Wochen, Garmins
Rennprognosen und die ungeplanten Läufe der letzten 21 Tage mit geschätzter RPE. Der Coach ist
angewiesen, bei stark steigenden Wochenkilometern oder vielen ungeplanten Läufen Laufeinheiten eher
leichter als härter vorzuschlagen. Name und E-Mail gehen nicht mit. Zurück kommt:

- ein **Rückblick** in drei bis sechs Sätzen (Sprache über `AI_COACH_LANGUAGE`, Standard Deutsch),
- **bis zu drei Vorschläge** für Einheiten der laufenden und der nächsten Woche.

Ein Vorschlag ist immer eine von vier Aktionen — mehr darf das Modell nicht:

| Aktion | Was „Apply" tut |
|---|---|
| **Move** | Verschiebt die Einheit auf einen anderen Tag / eine andere Tageshälfte, genau wie der [Verschieben-Knopf](#verschieben) (belegter Platz = Tausch, wird an der Kalenderwoche gemerkt). |
| **Easier** | RPE-Ziel −1, Dauer −10 % (auf 5 min gerundet, mindestens 15 min). |
| **Harder** | RPE-Ziel +1, Dauer +10 %. |
| **Skip** | Setzt die Einheit auf „ausgelassen". |

**Die Regeln entscheidet die Engine, nicht das Modell.** Bevor ein Vorschlag überhaupt angezeigt
wird, prüft sie ihn (`src/lib/engine/suggestions.ts`). Verworfen wird unter anderem: ein Renntag;
eine schon geloggte Einheit; ein Tag, der diese Woche schon vorbei ist; „Harder" im Taper, in
einer Deload-Woche oder bei ACWR ab 1,3; eine inhaltliche Änderung an Benchmark-, Mobility- und
Ruhetagen (verschieben dürfen sie); ein Tausch mit einem Renntag oder einer geloggten Einheit; mehr
als drei Vorschläge. Was verworfen wurde, steht zugeklappt unter „… refused by the plan rules", mit
der Regel dazu. Die Zahlen eines Vorschlags („RPE 7 → 6, 60 → 55 min") rechnet die Engine, nicht
das Modell — beim Anwenden noch einmal frisch aus der Einheit, wie sie dann gerade ist.

**Nichts ändert sich, bis du tippst.** Pro Vorschlag:

- **Apply** — führt ihn aus. Die Änderung erscheint unter „Why your plan changed" mit dem Grund
  des Coaches.
- **Dismiss** — verwirft ihn, der Plan bleibt.
- **Undo** — nach Apply: stellt den alten Tag bzw. RPE und Dauer wieder her, eine ausgelassene
  Einheit kommt zurück. Geht nicht mehr, wenn die Einheit inzwischen anders geändert oder (bei
  Easier/Harder) schon geloggt wurde — dann sagt die App das.

Was du wissen solltest:

- Zweimal „Review" innerhalb von 10 Minuten liefert denselben Rückblick, statt neu zu bezahlen.
- **Easier, Harder und Skip überleben keinen Neuaufbau des Plans** (Rebase, z. B. nach geändertem
  Laufvolumen): die Woche wird neu gerechnet. Verschiebungen dagegen schon — sie laufen über
  denselben Merkzettel wie das manuelle Verschieben.
- „Heute" bestimmt der Server nach UTC; kurz nach Mitternacht kann der Coach noch den Vortag sehen.
- Datenschutz: die Daten gehen an Google. Im kostenlosen Gemini-Tarif kann Google Eingaben zur
  Verbesserung seiner Modelle nutzen, im bezahlten nicht.
- Das Modell stellt `GEMINI_MODEL` ein (Standard `gemini-3.8-flash`).

---

## 5. Eine Einheit loggen (und den Fehlklick zurücknehmen)

**Ein Knopf pro Einheit: Done.** Er öffnet von unten ein Sheet mit einer einzigen Frage — **„How
hard was it?"** —, die Skala steht schon auf dem RPE-Ziel der Einheit.

| Was war | Was du tust | Wirkung |
|---|---|---|
| Wie geplant | **Done → Save** (zwei Taps) | Geloggt wie geplant; geplante Werte werden als Ist-Werte übernommen. |
| Härter als das Ziel | **Done**, Regler nach rechts, **Save** | Wird mit deiner Zahl geloggt. Zwei Punkte oder mehr über dem Ziel: Pace/Last gehen einen Schritt zurück. |
| Leichter als das Ziel | **Done**, Regler nach links, **Save** | Wird mit deiner Zahl geloggt. Zwei Punkte oder mehr darunter, zweimal in Folge: es geht einen Schritt hoch. |
| Nicht gemacht | **⋯ → Skip this session** | Als ausgelassen protokolliert; fließt in die Compliance ein. |

Bis zu diesem Umbau trug jede Karte vier Knöpfe (As planned, Felt harder, Felt easier, Skip) — bei
fünf Einheiten zwanzig Knöpfe auf einer Seite. Was die Engine bekommt, ist dasselbe geblieben: eine
Zahl auf dem Ziel heißt „as planned", eine darüber oder darunter „harder" bzw. „easier".

**Krafteinheiten mit eigenem Programm** loggen zuerst die Sätze: **Log sets** öffnet die
Satz-Tabelle, **Finish** führt danach in dasselbe Sheet ([Abschnitt 9](#9-strength--eigenes-kraftprogramm)).

### Die Anstrengungs-Skala („How hard was it?")

Das Sheet zeigt eine **RPE-Skala von 1 bis 10**: ein Bogen mit zehn Segmenten, die große Zahl in der
Mitte, darunter der Name der Stufe (z. B. „Harder") und ein Satz, woran man sie erkennt
(„Sustainable, but you are counting the minutes."). Ein grauer Punkt am Bogen und „▲ target" unter
dem Regler zeigen das RPE-Ziel der Einheit.

- **Vorbelegt** ist das Ziel. Wer nur speichert, loggt „wie geplant".
- **Einstellen** per Schieberegler (auch mit Pfeiltasten). Bogen, Zahl und Farbe folgen sofort.
- **Vorher sichtbar, was passiert:** ein Satz nennt die Folge, bevor gespeichert wird — z. B.
  „2 above the target of 7 — the plan backs this kind of session off a step." oder „Right on the
  target of 7 — the plan holds its course." Die Schwellen sind die Engine-Standardwerte (±2).
- **„Save"** loggt die Einheit mit genau dieser Zahl; **„Cancel"**, Escape oder ein Tap neben das
  Sheet schließt es, ohne etwas zu speichern.

Das funktioniert genauso im [Demo](#16-demo--ausprobieren-ohne-konto).

### Undo

Vertippt? Direkt nach dem Speichern steht unten ein Hinweis mit der Antwort der Engine und
**Undo** daneben. Später geht es über die Karte selbst: Eine geloggte Einheit zeigt
**„Logged by mistake? · Undo"**.
Das nimmt nicht nur den Eintrag zurück, sondern auch **die Kalibrierung, die er ausgelöst hat**: Die
App spielt die verbleibenden Logs neu ein und stellt Paces, Tiers und Kraftfaktor auf den Stand ohne
diesen Tag. Ein Fehlklick verzieht also nichts dauerhaft.

Die **Form deiner Woche** — feste Wochentage für Long Run, Kraft und Ruhe — legst du auf der
[Setup-Seite](#8-settings--setup--tools) fest.

### Tauschen — wenn das Gerät nicht frei ist

Der Schlitten ist besetzt, in der Wall-Ball-Ecke steht ein Kurs, das Seil ist in Benutzung. Bisher
fiel die Einheit dann aus, und **eine ausgefallene Einheit kostet mehr als jeder Ersatz.**

Auf jedem Block, der eine Station nennt, sitzt oben rechts **Swap**. Ein Tap öffnet die Alternativen
für genau diese Station — die echte Station zuoberst (zurücktauschen ist derselbe eine Tap), darunter
die Ersatzübungen, beste zuerst.

**Jede Alternative sagt, was sie *nicht* ersetzt.** Zu jeder steht ein Satz „Behält" und ein Satz
„Kostet": Der Schlittenschub gegen die Beinpresse behält die Quadrizeps-Last und den Brand, der über
den Lauf danach entscheidet — er kostet die Ganzkörperspannung und den Puls. Ein Tausch, der seinen
Preis verschweigt, ändert lautlos, wofür die Einheit da war.

Was der Tausch tut und was nicht:

- Der getauschte Block zeigt die Ersatzübung, darunter durchgestrichen die ursprüngliche Vorgabe.
- **Laufzeilen im selben Block bleiben stehen.** Der 400-m-Lauf in einem kompromittierten Block ist
  weiter der Lauf — der besetzte Schlitten streicht nicht die halbe Einheit.
- Der Tausch gilt **pro Station, nicht pro Einheit**, und **bleibt stehen, bis du ihn zurücknimmst.**
  „In meinem Studio gibt es keinen Schlitten" ist eine Tatsache über das Studio, nicht über Dienstag.
  Ist die Ecke nur heute belegt, sind es dieselben zwei Taps zurück.
- **Der Plan ändert sich nicht.** Der Tausch ist eine Sicht auf den Plan, keine Änderung an ihm: Die
  Engine bleibt deterministisch, und der Tausch übersteht jeden Neuaufbau, weil er gar nicht Teil des
  Plans ist.
- Trainierst du zu Hause (`home_minimal`), erscheinen nur Alternativen, die ohne Studiogeräte gehen.
  Jede Station hat mindestens eine.

### Verschieben

Für eine **einzelne** Woche abweichen — ohne den Standard zu ändern — geht weiterhin über Move:

**Move** sitzt im **⋯-Menü** oben rechts auf der Karte („Move to another day"), zusammen mit Skip.
Es öffnet unter der Karte die Wochentage — Mo bis So als Reihe, mit **Cancel** zum Schließen. Der Tag, auf dem die Einheit schon liegt, ist markiert und nicht anklickbar; jeder andere
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

Verschieben gilt innerhalb der Woche; gesperrte Wochen bieten es nicht an. Im [Demo](#16-demo--ausprobieren-ohne-konto)
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

**Läufe außerhalb des Plans zählen mit.** Kommen Läufe über den
[Garmin-Import](#garmin-läufe-im-training), gehen die, die keiner geplanten Einheit zugeordnet
wurden, als zusätzliche Last in ACWR ein — beim Loggen jeder Einheit, im Nachtlauf und in der
ACWR-Kurve auf Progress gleich gerechnet. Ihre Anstrengung schätzt die Engine aus dem Puls
(Ø-Puls im Verhältnis zum höchsten Puls, den die Uhr je gemessen hat; Tabelle
`EXTERNAL_RUN_RPE_BY_HR_SHARE` in `constants.ts`):

| Ø-Puls in % des Maximalpulses | geschätzte RPE |
|---|---|
| unter 70 % | 3 |
| 70–78 % | 4 |
| 78–85 % | 5 |
| 85–89 % | 6 |
| 89–93 % | 7 |
| ab 93 % | 8 |

Ohne Puls, oder solange der gemessene Maximalpuls unter 160 liegt, gilt RPE 4 (lockerer Lauf).
Last = RPE × Minuten, wie bei geloggten Einheiten. Hast du einen Lauf von Hand als Laufeinheit
geloggt, zählt der Garmin-Lauf am selben Tag mit ähnlicher Dauer (±25 %) nicht doppelt.

**Die Mischung folgt einer Tabelle, nicht einer Reihenfolge.** Für jedes Level und jede Phase steht
fest, welchen Anteil der geplanten Minuten Laufen, Kraft, Stationsarbeit und kompromittiertes Laufen
bekommen — ein Beginner in der Basis 45/35/15/5, ein World-Class-Athlet im Peak 30/10/25/35. Die
Woche wird gegen diese Anteile aufgeteilt, und der Rest wird über die Wochen einer Phase
mitgenommen: So taucht ein 5-%-Anteil etwa jede vierte Woche wirklich auf, statt wegzurunden.
Was die Phase nennt, kommt in ihr auch mindestens einmal vor.

**Kompromittiertes Laufen gibt es ab der ersten Woche** — in der Basis als Kostprobe (5–10 %),
im Peak als Hauptgericht (30–35 %). Umgekehrt sinkt der Kraftanteil von 20–35 % in der Basis auf
10 % im Peak: Erhalt statt Aufbau.

**Die Woche ist physiologisch sortiert.** Der Planer hält beim Verteilen der Tage drei Regeln ein:
Zwischen zwei harten Ausdauertagen liegt immer ein Zone-2-Tag, ein Kraft-/Stationstag oder eine
Kalenderlücke. Krafttraining (das mit Plyometrie beginnt) liegt nie am Tag unmittelbar nach einem
harten Tag — das Nervensystem braucht 24–48 h Frische. **Und umgekehrt**: ein harter Ausdauertag
liegt nie direkt nach schwerem Krafttraining. Der Interferenz-Effekt kennt keine Richtung, mTOR-
und AMPK-Signal stören sich in beiden Reihenfolgen.

Der Planer *sucht* dabei eine Anordnung, die alle drei Regeln hält, statt sich von Tag zu Tag
durchzuhangeln — sonst verbraucht er die eine Einheit, die zum Schluss gepasst hätte, zu früh.
Nur wenn keine Anordnung regelkonform ist, wird gelockert, und dann steht der Preis als Hinweis da.

**Doppeltage:** Die anspruchsvollere Einheit kommt zuerst (Kraft/Station am Morgen), die PM-Einheit
ist immer leicht. Auf der PM-Karte steht der geforderte Abstand: **2–6 h nach der Morgeneinheit** —
darunter trainierst du auf unerholter Ermüdung, darüber ist es ein zweiter Tag.

**Ergometer-Entlastung.** Die PM-Einheit eines Doppeltags ist eine Cross-Training-Einheit: halb
Laufen, halb SkiErg, Rudergerät oder Rad. Das ist genau das Zusatzvolumen, das sonst die
Achillessehne bezahlt — gleicher Motor, ein Bruchteil des Aufpralls. Ohne Ergometer bekommst du
sie nicht.

**Die Kilometer gipfeln in der Basis, nicht im Build.** Aus deiner Peak-km-Zahl verteilt eine Kurve
das Wochenvolumen über die Phasen: **Basis 100 % · Build 90 % · Peak 80 % · Taper 40 %.** Bei 50 km
Peak sind das 50 / 45 / 40 / 20 km. Die ersten drei Wochen laufen zusätzlich mit 75 → 100 % an, damit
der Zyklus nicht auf voller Last beginnt.

Das ist bewusst *gegenläufig* zu einer reinen Laufperiodisierung. Was in einem Hyrox-Zyklus zum
Rennen hin steigt, ist nicht die Distanz, sondern die Spezifität: Der Laufanteil der
[Trainingsmischung](#4-today-und-plan--heute-und-die-trainingswoche) sinkt von 45–55 % in der Basis auf 30 % im Peak,
während kompromittiertes Laufen und Stationsarbeit übernehmen — und die bringen ihre eigene Last
mit. Die Kilometer obendrauf zu halten heißt, die Basis wegbrechen zu lassen, bevor die Form da ist.
Die Nicht-Lauf-Einheiten haben ihre eigene Kurve, die später gipfelt: Distanz früh, Stationslast spät.

**Deload alle 3–4 Wochen.** Jede vierte Woche wird auf 60 % Volumen getrimmt — quer durch alle
Phasen, auch im Peak. Zwei Wochen sind nie Deload: eine Testwoche (dafür sollst du frisch sein) und
die Woche mit der Rennsimulation (die *ist* die Belastung). Fällt der Rhythmus auf eine davon, rückt
der Deload eine Woche nach vorne und der Takt läuft von dort weiter. Der Taper braucht keinen — er
ist die Reduktion: das Wochenvolumen sinkt dort um 41–55 %, während die Intensität in kurzen
Intervallen erhalten bleibt. Die Häufigkeit bleibt auch — gekürzt wird die Dauer, nicht die Anzahl:
der lange Lauf der Rennwoche ist 35 Minuten statt 60, die Intervalle 32 statt 55.

**Wie lang ein Plan ist.** Nicht fix. Die Länge wird aus Startdatum und Renntermin gerechnet und
auf die Phasen verteilt — 9 Wochen ergeben 3/3/2/1, 13 Wochen 5/4/3/1, 17 Wochen 7/5/4/1. Zwei
Grenzen: **mindestens 4 Wochen** und **höchstens 20**. Ein Rennen in einem Jahr ergibt also keinen
52-Wochen-Plan, sondern 20 Wochen; der Rest wartet. Unter 8 Wochen fällt zuerst die Basis weg, der
Taper bleibt immer.

Neu gerechnet wird die Länge bei jedem Neuaufbau — Wochenform, Volumen, Level, Startdatum,
Verletzung, oder automatisch bei ACWR über 1,5 und nach 7 Tagen Pause. **Verschiebst du dein
Renndatum, passiert nichts von selbst:** Du baust den Plan auf [`/season`](#7-season--rennkalender-und-jahresplanung)
neu aus dem Kalender.

**Nach dem Renntag.** Ist der Renntag vorbei, ist der Plan ein Protokoll und wird als *abgeschlossen*
geführt. `/today` und `/plan` zeigen dann keinen Wochenplan mehr, sondern zwei Wege weiter:

- **Nächstes Rennen wählen** — auf `/season` eintragen und daraus bauen.
- **Übergangsblock starten** — vier Module, die aufeinander aufbauen (siehe unten). Sobald du ein
  Rennen wählst, wird der Block ersetzt.

### Der Übergangsblock

| Modul | Woche | Volumen | Inhalt |
|---|---|---|---|
| **Reset** | 1 | 15 %, RPE ≤ 3 | Tag 1–3 gar nichts. Tag 4–7 Bewegung ohne Stoß: Spinning, Schwimmen, Spaziergang, Mobility. **Kein Laufen, keine Landungen, kein Krafttraining.** |
| **Re-Introduction** | 2 | 45 %, RPE ≤ 6 | 2–3 kurze Zone-1/2-Läufe, 2 leichte Ganzkörper-Krafteinheiten (hohe Wiederholungen, kein Muskelversagen), Ergometer-Technik. Kein Long Run, keine Intervalle. |
| **Volume Reload** | 3 | 65 % | Laufvolumen normalisiert sich in Zone 2, höchstens ein moderater Reiz. Die Grundübungen kommen zurück. Gute Woche, um das Rennen auszuwerten und die Schwachstelle für den nächsten Zyklus zu benennen. |
| **Off-Season** | 4 bis X | 80 %, polarisiert | Schwere Compounds, hohes Zone-2-Volumen über Laufen und Ergometer, isolierte Stationsarbeit an dem, was das Rennen aufgedeckt hat. Gegliedert in Vierwochenzyklen: **drei Belastungswochen, eine Deload-Woche mit −40 %.** |

**In keinem Modul steht kompromittiertes Laufen** — und keine Simulation, kein Benchmark.
Rennspezifik ist die Aufgabe des nächsten Makrozyklus; dieser Block sorgt dafür, dass du intakt dort
ankommst.

**Wie lang der Block läuft**, entscheidet der Abstand zum nächsten Rennen. Der Rennblock bekommt
seine volle Anlaufstrecke (16 Wochen), alles davor ist Übergang:

| Nächstes Rennen in | Übergangsblock | Rennblock |
|---|---|---|
| 32 Wochen | 16 Wochen (Off-Season gedehnt) | 16 |
| 20 Wochen | 4 Wochen (klassischer Durchlauf) | 16 |
| 12 Wochen | 1 Woche (nur Reset) | 11 |
| **kein Rennen im Kalender** | **20 Wochen, danach verlängerbar** | — |

Nie null: Die Woche nach einem Rennen ist ein Reset, egal wie eng es wird.

**Der Übergangsblock steht auch *vor* dem ersten Rennen.** Ein Rennzyklus endet in Peak und Taper,
und beides sind Versprechen an ein Datum. Liegt das Rennen weiter weg als die 20 Wochen, die ein
Plan lang sein kann, lässt sich dafür nicht periodisieren — dann baut die App **zuerst einen
Übergangsblock** und startet den Rennzyklus, sobald das Rennen in Reichweite ist. Das gilt im
Onboarding wie beim Bauen aus dem Saisonkalender.

*Vorher wurde in diesem Fall der Rennzyklus einfach auf 20 Wochen abgeschnitten.* Bei einem Rennen
in 61 Wochen lag der Taper damit in Woche 20 — **41 Wochen zu früh** —, während oben der Countdown
zum echten Renntermin lief. Wer eine 60-Wochen-Saison angelegt hatte, sah auf `/plan` trotzdem einen
20-Wochen-Zyklus mit Peak und Taper, der nie stattfinden konnte.

**Bestehende Pläne werden automatisch umgestellt.** Der nächtliche Lauf prüft jeden aktiven Plan auf
seine Form, in beide Richtungen: Ein Rennzyklus, dessen Rennen zu weit weg ist, wird zum
Übergangsblock; ein Übergangsblock, dessen Rennen in Reichweite gekommen ist, wird zum Rennzyklus.
Du musst nichts anklicken.

**Ohne Rennen läuft der Block offen.** Die Frage „wie lang?" hat dann keine Antwort, die jemand
ausrechnen könnte — also bekommt er die 20 Wochen, die das Planformat hergibt: Reset,
Re-Introduction, Volume Reload und **17 Wochen Off-Season** in Vierwochenzyklen (Deload in Woche 7,
11, 15, 19). Läuft er aus, verlängerst du ihn mit einem Knopf — und die **Verlängerung beginnt bei
der Off-Season**, nicht bei einem weiteren Reset. Drei Tage Nichtstun gehören nach ein Rennen, nicht
nach zwanzig Belastungswochen. Auch die Volumen-Anlaufkurve entfällt dabei: Du steigst nicht neu
ein, du machst weiter.

**Ein Übergangsblock gibt sich nicht als Rennzyklus aus.** In der Kopfzeile steht *Block ends* statt
*Race day*, und am Ende *„That block is done — kein Rennen war darin"*. Technisch trägt der Plan
dafür eine Kennzeichnung (`kind`); das Feld `race_date` hält nur das Ende des Blocks.

Ein abgeschlossener Plan wird **nie neu aufgebaut**. Das ist keine Kosmetik: Die Wochen werden zum
Renntag hin gezählt, gegen ein vergangenes Datum käme ein Zwei-Wochen-Taper auf einen Tag heraus,
der schon vorbei ist — und der automatische Neuaufbau nach 7 Tagen Pause ist genau das, was die
Woche nach einem Rennen auslöst.

**Rebase statt Flickwerk.** Wenn sich etwas Grundlegendes ändert — Verletzung, Pause, neues
Laufvolumen — wird der Plan **ab heute neu gerechnet**, nicht rückwirkend verbogen. Vergangene
Wochen bleiben als Protokoll stehen.

**Coach-Feedback.** Nach dem Loggen erscheint eine Karte mit einem Erfüllungsindex und einem kurzen
Text, was die Anpassung bedeutet. Der Text ist deterministisch vorformuliert; ist ein API-Schlüssel
hinterlegt, wird er sprachlich veredelt — fällt das aus, steht der Standardtext da. **Der Plan
selbst wird nie von einem Sprachmodell verändert.**

**Alles ist protokolliert.** Jede automatische Anpassung landet mit Grund in einem Änderungs-Log,
das du auf `/progress` sehen kannst.

---

## 7. `/season` — Rennkalender und Jahresplanung

Erreichbar im Tab **Plan** über den Umschalter **Week | Season** oben; **Week** führt zurück in die
Wochenliste.

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

Erreichbar über **Setup** — am Desktop unten in der linken Spalte, am Handy über das Zahnrad oben
rechts — auf jeder Seite. Vier Gruppen, nach dem sortiert, was du
entscheidest. Dazu kommt **Strength program**: eine Zeile, die auf dein
[Kraftprogramm](#9-strength--eigenes-kraftprogramm) führt.

### Deine Trainingswoche

**Wofür du trainierst.** Ganz oben Level, Zielzeit und Division — alle drei nachträglich änderbar,
nicht mehr nur im Onboarding.

Das **Level ist die stärkste Einzelgröße im Plan**: Die Aufteilung zwischen Laufen, Kraft,
Stationsarbeit und kompromittiertem Laufen ist nach Level *und* Phase festgelegt, und alle drei
Session-Kataloge wählen danach aus. Es beschreibt, **was du heute tragen kannst.**

Die **Zielzeit** ist davon getrennt und beschreibt, **was du anstrebst.** Sie steht seit Kurzem als
eigene Zahl da. Vorher trug das Level beide Rollen — die Auswahl hieß „Level und Zielzeit", *Elite*
stand für U70 — und an dieser Stelle war zu lesen, ein eigenes Feld sei bewusst weggelassen, es
stünde als zweite Wahrheit neben der Prognose. Das war ein Fehlschluss: Prognose und Ziel sind keine
zwei Wahrheiten, sondern zwei verschiedene Dinge — die eine sagt, was du laufen wirst, das andere,
was du willst. Solange nur das Level beides trug, hatte niemand mit 1:30 und dem Ziel U70 eine
ehrliche Wahl: *Elite* liefert Einheiten, die er nicht durchhält, *Trained* zeigt ihm sein Ziel nie.

**Eine Zielzeit, zwei Stellen:** Das Feld hier und *Target time* in der Karte
[Rennen & Simulationen](#rennen--simulationen) auf `/benchmarks` sind dieselbe Zahl — was du an
einer Stelle setzt, steht an der anderen. Sie misst die Prognose auf `/progress`, das Pacing-Blatt auf
`/race` und die Rennanalyse auf `/progress`.

Die **Division** setzt jedes Gewicht im Plan — Open, Pro, Doubles, Masters, Masters Pro.

**Level oder Division ändern baut die verbleibenden Wochen neu. Nur die Zielzeit ändern nicht** —
sie ist das, woran der Plan gemessen wird, nicht das, woraus er gebaut wird. **Deine Kalibrierung
bleibt in beiden Fällen unangetastet:** Pace-Zonen und Stations-Tiers kommen aus dem, was du geloggt
hast. Ein neues Ziel ist kein Neuanfang.

*Die 5-km-Zeit steht hier bewusst nicht.* Sie ist nur der Startwert für die allererste Kalibrierung;
danach führen die [Benchmarks](#10-benchmarks--tests-eintragen) deine Zonen. Ein Regler dafür würde
mehr versprechen, als er tut.

**Wann der Plan startet.** Ganz oben das Startdatum: der Montag, an dem Woche 1 beginnt. Daneben
steht, wie viele Wochen dieser Termin bis zum Rennen übrig lässt — und ob das zur Länge deines
Plans passt.

Änderst du es, fragt die App, **ob der Plan neu gebaut werden soll**, und stellt beide Folgen
nebeneinander:

- **Neu bauen für die neue Laufzeit** — die Phasen werden auf die tatsächlich verbleibenden Wochen
  gerechnet. Vergangene Wochen bleiben als Protokoll stehen.
- **Nur den Kalender verschieben** — jede Woche behält ihren Inhalt und rutscht mit. Das kann dazu
  führen, dass der Plan nach dem Renntag endet; dann sagt die App es hinterher.

Der Grund für die Frage: Bei festem Renndatum ändert ein späterer Start die Anzahl der Wochen bis
zum Rennen. Ein Plan mit fester Länge passt danach nicht mehr auf die Strecke.

Beide Regler bauen die **verbleibenden Wochen** neu auf; vergangene Wochen bleiben als Protokoll
stehen. Ohne bestehenden Plan gelten sie für den nächsten.

**Die Form deiner Woche.** Ganz oben **Trainingstage** (3–6) und **Doppeltage** (0–3) — zusammen
ergeben sie deine Einheiten pro Woche. Direkt darunter steht, wie das zu deinem Level passt, und
zwar **live**: Jede Änderung an den Chips rechnet den Hinweis neu, bevor du speicherst.

Daneben **Kraft-Tage** (1 oder 2 pro Woche). Bei 2 wird die leichteste Einheit der Woche —
Mobility, sonst der Erholungslauf, sonst eine zweite Stationseinheit — zum zweiten Kraft-Tag; nie
eine harte Einheit, der Long Run oder die einzige Stationseinheit der Woche. Hat eine Woche keine leichte Einheit übrig (weniger Trainingstage,
Deload-, Benchmark-Woche), bleibt es bei einem; der Taper behält absichtlich einen. Unter den
Schaltern steht, in welchen Phasen der zweite nicht hineinpasst, und ob er dir einen der unter
„Laufvolumen" gesetzten Läufe nimmt. Mit fünf Trainingstagen passt er in Build und Peak nicht —
dafür braucht es sechs. Mit Doppeltagen bekommen Kraft-Vormittage wie bisher bevorzugt einen
lockeren PM-Lauf.

Darunter sieben Schalter je Zeile für **Long Run**, **Spieltag**, **Kraft**, **Ruhetage** und —
sobald du Doppeltage eingestellt hast — **Doppeltage**, Montag zuerst. Der **Spieltag** trägt die
Simulation der Woche, sonst ihren ersten Compromised Run (in Peak-Wochen mit zwei liegt nur der
erste fest). Er darf nicht auf dem Long-Run- oder einem Kraft-Tag liegen — das lehnt das Speichern
ab. Kraft-Tage und Spieltag erscheinen erst, wenn die Datenbank Migration 0031 hat. Die
Obergrenzen bewegen sich mit: Ruhetage `7 − Trainingstage`, Doppeltage genau so viele, wie du oben
gewählt hast. Nimmst du Trainingstage oder Doppeltage weg, werden zu viele Pins automatisch
gekürzt statt dich am Speichern-Knopf auflaufen zu lassen. Ohne Doppeltage erscheint die Zeile gar
nicht — ein Schalter mit Obergrenze 0 wäre ein toter Schalter.

*Harte Pins:* Diese Tage gewinnen — auch gegen die Erholungsregeln. Öffnungszeiten im Gym und ein
freier Sonntag sind Tatsachen, und ein Plan, der sie stillschweigend überstimmt, wird nicht befolgt.
Alles Übrige ordnet sich um deine Pins herum an, weiterhin regelkonform, soweit die verbleibenden
Tage es zulassen.

*Weiche Warnung:* Was ein Pin kostet, steht direkt unter den Schaltern — etwa *„Strength on Thursday
follows a hard Wednesday — plyometrics wants 24-48 h of fresh legs."* Nichts wird heimlich
korrigiert; du siehst den Preis und entscheidest.

**Doppeltage im Besonderen.** Ohne Pin verteilt die App sie selbst: zuerst auf Kraft- und
Stationstage (deren PM-Partner ist ein lockerer Lauf, also genau das fehlende aerobe Volumen), dann
auf harte Tage, und auf einen lockeren Tag zuletzt — der ist die Erholung der Woche. Ein Pin
überstimmt diese Rangfolge und nennt dir drei mögliche Kosten:

- **Der Erholungstag zwischen zwei harten Tagen.** Die Hart/Locker-Abfolge bleibt formal intakt,
  aber der Tag ist keine Erholung mehr.
- **Ein harter Tag als Gastgeber.** Die PM-Einheit wird dann Mobility statt lockerer Lauf — und
  damit entfällt dort die Ergometer-Entlastung, die am lockeren PM-Lauf hängt.
- **Ein Tag ohne Einheit.** Eine zweite Einheit braucht eine erste; der Pin verfällt mit Hinweis.

*Was ein Pin nicht kann:* deine Hart/Locker-Abfolge kippen. Die Wochentage werden verteilt,
**bevor** irgendein Doppeltag angehängt wird, und eine PM-Einheit ist immer leicht — lockerer Lauf
oder Mobility, nie hart. Ein Doppeltag verschiebt also keine einzige Morgeneinheit und kann keinen
harten Tag erzeugen.

Vier Dinge lehnt die App beim Speichern ab, statt sie zu erraten: eine Laufanzahl, die nach dem
Reduzieren der Trainingstage nicht mehr hineinpasst, ein Tag, der gleichzeitig Ruhetag
und Kraft-/Long-Run-/Spieltag ist, ein Spieltag auf dem Long-Run- oder einem Kraft-Tag, und mehr Ruhetage als deine Trainingsfrequenz übrig lässt. Passt die
Woche trotzdem nicht, gewinnt das Training den Tag zurück und sagt welchen.

**Laufvolumen.** Peak-Kilometer der Woche und Läufe pro Woche, dazu — sobald du geloggt hast — der
Abgleich mit dem, was deine letzten vier Wochen wirklich getragen haben. Die Obergrenze für Läufe
folgt deinen Trainingstagen: eine Einheit pro Woche bleibt Kraft oder Stationsarbeit.

**Wie die Peak-Kilometer wirken.** Die Woche zerfällt in zwei Teile:

- **Fest:** Kompromittierte Läufe und Intervalle sind als *Meter* geschrieben („5× 1500 m", „4 Runden
  à 400 m"). Diese Meter ändern sich nicht, wenn die Einheit länger geplant wird.
- **Beweglich:** Long Run und Easy Run laufen auf *Zeit* — nur sie können ein Volumenziel tragen.

Die App zieht die festen Meter vom Wochenziel ab und stellt die beweglichen Läufe auf den Rest ein.
**Das Wachstum ist gedeckelt** (höchstens das 1,4-fache): Ohne Deckel wuchs ein 70-Minuten-Long-Run
auf 145 Minuten, nur um eine Zahl zu erreichen.

**Erreicht die Woche das Ziel nicht, sagt sie es.** Beispiel: 50 km bei fünf Einheiten, von denen
drei Kraft, Stationsarbeit und ein kompromittierter Lauf sind — das trägt diese Zusammensetzung
nicht. Der Hinweis nennt dann den richtigen Hebel: **ein zusätzlicher Lauftag**, nicht ein längerer
Long Run. Umgekehrt gilt dasselbe, wenn die festen Meter allein schon über dem Ziel liegen.

*Bis vor Kurzem wurde das Wochenvolumen aus Dauer × Laufanteil ÷ Pace geschätzt und nie an den
geschriebenen Metern gemessen.* Eine 75-Minuten-Intervalleinheit las sich als 15,6 km, während
5× 1500 m draufstand — 7,5 km. Über die Woche waren die angezeigten Kilometer das Anderthalb- bis
Doppelte des Tatsächlichen, und der Peak-Regler stellte diese überhöhte Zahl ein. **Die angezeigten
Kilometer sind seitdem deutlich niedriger. Gelaufen wird dieselbe Strecke wie vorher** — sie wird
nur nicht mehr zu hoch ausgewiesen.

### Urlaub

Karte **Vacation**, unter der Trainingswoche. Erscheint erst, wenn die Datenbank Migration 0032 hat.

**Eintragen:** erster und letzter Tag weg (höchstens zwei Monate, nicht schon vorbei), die Art, eine
optionale Notiz (z. B. „Teneriffa"), dann **Add vacation**. Das baut — wie die anderen Regler — die
**verbleibenden Wochen** neu auf; ohne Plan gilt es für den nächsten. **Remove** nimmt einen Urlaub
wieder heraus und baut ebenfalls neu auf. Angezeigt werden Urlaube, die noch nicht vorbei sind.

| Art | Was an den Urlaubstagen geplant wird |
|---|---|
| **Keep it ticking** | Lockere Läufe und der Long Run (zusammen höchstens drei, Long Run höchstens 75 min), **ein** optionaler Schwellenlauf (3 × 8 min, RPE höchstens 6, „nur wenn du Lust hast"), Bodyweight & Mobility statt Kraft (30 min, ohne Geräte). Stationen, Spieltage, Simulation und Benchmarks werden zu lockeren Läufen oder fallen weg; keine Doppeltage. |
| **Fully off** | Nichts. |

Was sonst passiert:

- **Das Renndatum bleibt.** Der Urlaub kostet Planzeit, er schiebt das Rennen nicht.
- Die **Simulation** des Zyklus und die **Benchmark-Wochen** wandern in die nächstgelegene Woche
  ohne Urlaubstag (die Simulation innerhalb der Peak-Phase; gibt es dort keine, entfällt sie).
- Die Woche, in der du **zurückkommst**, ist nach mindestens fünf Urlaubstagen eine leichtere
  **Wiedereinstiegswoche** (wie ein Deload; im Taper nicht).
- Einheiten im Urlaub heißen „Vacation · …", die Woche trägt oben einen Hinweis mit dem Zeitraum.
- Ein **Renntag** im Urlaub bleibt stehen.
- Die nächtliche Regel „7 Tage ohne Einheit → Neuaufbau" zählt Urlaubstage **nicht** mit. Fällt
  die Belastung nach dem Urlaub stark ab, kann die nächtliche Prüfung die nächsten Wochen trotzdem
  etwas zurücknehmen (Ramp-up, Abschnitt 6).
- Der [KI-Coach](#ki-coach-gemini) macht Urlaubseinheiten nie härter.
- „Heute"/Datumsgrenzen rechnet der Server in UTC.

### Workouts

Die Gruppe erscheint erst, wenn die Datenbank Migration 0030 hat.

**Woher die Einheiten kommen.** Zwei Karten zum Antippen, dann **Speichern** — das baut wie die
Regler oben die **verbleibenden Wochen** neu auf (ohne Plan gilt es für den nächsten):

- **Standard library** — die Einheiten der App, wie bisher.
- **Verona plan** — die Einheiten deines Verona-Plans aus dem Einzeldatei-Tracker
  (`src/lib/engine/veronaWorkouts.ts`, 50 Einheiten): Schwellenläufe (4–6 × 6, 3 × 10, 2 × 15 min),
  1-km-Wiederholungen mit Wall-Ball-EMOM, Tempo-HYROX, Long Run mit 100 Wall Balls bzw. mit
  Renntempo-Finish, Easy Run mit WB-EMOM, **Strength A** (Unterkörper/Power) und **Strength B**
  (Oberkörper Zug/Druck), die zehn Stations-Varianten nach Phase, die Spieltage (u. a. Sled → Run,
  Pull + BBJ, WB-Ausdauer, Ski + BBJ 80 m, Chipper, erste/zweite Rennhälfte, Cutdown, 400/Sled/400),
  die BBJ-Formen (Economy, Capacity, Run → BBJ, BBJ → 1 km, Race Sequence, Late-Race) und die volle
  Simulation.

Was sich mit **Verona plan** ändert — und was nicht:

- Die **Woche plant weiter die Engine**: welche Tage, wie viele Einheiten, Dauer, RPE-Ziel,
  Deloads, Taper und jede Anpassung. Dein Mo–So-Rhythmus aus dem Tracker wird **nicht** 1:1
  übernommen; feste Tage setzt du oben unter „Die Form deiner Woche".
- Für jede Einheit nimmt die Engine die Verona-Einheit, die zu **Einheitentyp und Phase** passt —
  rotierend, jede zweite Woche gezielt auf deine schwächste Station bzw. eine genannte
  Schwachstelle. Hat die Sammlung für einen Platz nichts (z. B. Mobility, Benchmark, Compromised
  Run im Taper), entscheidet die Bibliothek wie bisher.
- Phasen: Foundation → Base, Endurance → Build, Specific und Race → Peak, Taper → Taper. Die Recovery-
  Phase des Trackers gibt es hier nicht (dafür Deload und Reha-Modus); einen Urlaub trägst du
  oben unter [Urlaub](#urlaub) ein.
- Paces stehen **relativ** zu deinen Zonen („Schwelle", „Renntempo −10 s/km") statt fest 4:00/km —
  sie wandern mit der Kalibrierung. Gewichte sind die Wettkampfgewichte deiner Division.
- Strength A und B nennen die Übungen, nicht Sätze und Kilos — die stehen in deinem
  [Kraftprogramm](#9-strength--eigenes-kraftprogramm). Mit **Kraft-Tage: 2** (oben) ist der erste
  Kraft-Tag der Woche immer Strength A, der zweite Strength B — wie im Tracker. Mit einem Kraft-Tag
  wechseln sie sich wochenweise ab.
- **Spieltage:** Mit dem Verona-Plan gibt es auch in der **Base-Phase** jede Woche einen Spieltag
  (abwechselnd BBJ-Technik + Lauf/Erg-Block und Ergs + Burpees, beide ohne Sled und Lunges, beide
  brauchen ein Ergometer). Er ersetzt die Einheit mit der niedrigsten Priorität; die Grenze von zwei
  harten Tagen pro Woche bleibt. Mit der Standard-Bibliothek bleibt Base frei von Spieltagen. Auf
  Samstag legst du sie mit dem **Spieltag**-Schalter oben.
- Der wadenschonende Spieltag erscheint nur, wenn deine Schwachstellen (auf `/season`) z. B.
  „Wade" oder „Achilles" nennen — wie im Tracker nur bei gereizter Wade.
- Auf der Einheitenkarte steht der Name der Verona-Einheit, ihr Nutzen und darunter
  „Verona plan: …" mit dem Originalnamen aus dem Tracker.
- Im Onboarding gibt es die Wahl nicht; neue Pläne starten mit der Standard-Bibliothek, bis du hier
  umstellst.

### Import aus HyroxTraining

Karte **Import from HyroxTraining** in derselben Gruppe. **Choose backup file** und die JSON-Datei
aus dem Tracker wählen (dort Menü → Export). Die Datei wird im Browser gelesen und nur mit den
nötigen Feldern geschickt. Übernommen wird:

| Aus dem Tracker | Landet in | Bedingung |
|---|---|---|
| Jede **abgeschlossene** Einheit | Verlauf („Imported history" auf [`/progress`](#11-progress--auswertungen)): Datum, Art, Titel, Dauer, Session-RPE, Distanz, Notiz | Datum und Art vorhanden; Entwürfe und geplante Einheiten nicht |
| **Simulationen** | [Rennen & Simulationen](#rennen--simulationen) | alle 8 Läufe und 8 Stationen gestoppt, Roxzone gestoppt oder in den Läufen enthalten |
| **Stations-Rekorde** (Ski, Push, Pull, BBJ, Row, Farmers, Lunges, Wall Balls) | die acht Stations-Benchmarks auf [`/benchmarks`](#10-benchmarks--tests-eintragen) | Wall Balls nur, wenn nach einer HYROX-Sequenz gemessen — wie der Tracker selbst gezählt hat |

Danach steht, was hinzukam und was mit welchem Grund nicht übernommen wurde (z. B. Simulationen
ohne alle Splits — die stehen dann nur im Verlauf). **Dieselbe Datei nochmal** fügt nichts doppelt
hinzu, eine neuere nur das Neue.

Was der Import **nicht** tut: Er ändert den Plan nicht, und die importierten Einheiten zählen
**nicht** in den ACWR, die Paces oder die Stations-Stufen — die Engine kalibriert weiter nur aus
dem, was du hier loggst. Lauf- und Roxzone-Summen aus dem Tracker sind keine Benchmarks und bleiben
draußen. Deine Rom-Referenz steht im Tracker im Code, nicht im Backup: trag sie selbst unter
Rennen & Simulationen als Baseline ein. Zielwerte, Plananpassungen, Urlaub und Check-ins aus dem
Tracker werden nicht übernommen — den Urlaub trägst du unter [Urlaub](#urlaub) neu ein. Der [KI-Coach](#ki-coach-gemini) sieht importierte Einheiten der
letzten 21 Tage als Teil seiner Fakten.

### Verbindungen

Strava, Garmin und Telegram als Zeilen mit ihrem Zustand: **connected**, ein *Connect*-Knopf, oder
*not configured* — Letzteres heißt, dass die Integration auf dieser Installation gar nicht
eingerichtet ist. Ein toter Knopf wäre die schlechtere Antwort.

### Deine Daten

**Export.** Ein Knopf, eine Datei: Profil, alle Pläne, jede geloggte Einheit, Benchmarks,
Rennergebnisse und deine Kraftprogramme als JSON. Die Einheiten bringen **ihre eigenen Blöcke mit**,
die Datei ist also für sich lesbar und nicht nur gegen eine Datenbank, in der dieselbe Bibliothek
noch steht.

Nicht enthalten: der Rest der Übungsbibliothek, die statischen Benchmark-Definitionen und die
Wissenspipeline. Nichts davon hast *du* getan, und alles davon kommt aus dem Repository zurück.

**Das ist deine Sicherungskopie.** Deine gesamte Trainingshistorie liegt in genau einem
Supabase-Projekt; eine zweite Kopie hält nichts.

### Dieses Gerät

**Abmelden** beendet die Sitzung in diesem Browser. Plan und alles Geloggte bleiben, wo sie sind —
mit einem neuen Link bist du wieder drin, und deine anderen Geräte bleiben angemeldet.

### Wenn etwas kaputtgeht

Verletzung melden schaltet in den Reha-Modus; im Reha-Modus steht hier der Weg zurück.

**Fehlermeldungen sagen, was schiefging.** Scheitert ein Neuaufbau des Plans — hier, auf `/plan`
oder auf `/season` —, steht der Grund vom Server im Hinweis, etwa *„Could not build the plan:
persist_plan: …"*. Antwortet der Server gar nichts Lesbares, sagt die App genau das („Something
broke on the server (500)") statt einer technischen Parser-Meldung. Der häufigste Grund für einen
Abbruch beim Speichern ist eine Datenbank, die noch nicht auf dem Stand des Codes ist: dann fehlt
eine Spalte oder ein Enum-Wert, und `supabase/setup.sql` einmal durchlaufen zu lassen behebt es.

---

## 9. `/strength` — eigenes Kraftprogramm

Gedacht für alle, die ihr Krafttraining bereits in Excel führen. Erreichbar über **Setup →
Strength program** (das Zahnrad leuchtet dabei); „← Setup" führt zurück. Einen eigenen Tab hat das
Kraftprogramm nicht mehr: Bearbeitet wird es selten, geloggt wird es in der Krafteinheit selbst.

**Import per Einfügen.** Bereich in Excel markieren, kopieren, ins Feld einfügen — die Zwischenablage
enthält tabulatorgetrennten Text, und genau den liest der Parser. Erkannt werden Wiederholungs-
bereiche („6 - 8"), Supersatz-Markierungen und Körpergewichts-Zeilen ohne Last.

**Vorschau vor dem Speichern.** Du siehst, was der Parser verstanden hat, und kannst korrigieren,
bevor irgendetwas gespeichert wird.

**Wo dein Programm in der Einheit steht.** Es tritt an die Stelle des Hauptblocks aus der
Bibliothek — Warm-up davor, Finisher und Mobility danach, genau wie die Engine die Einheit gebaut
hat. Ein Finisher ist nach dem benannt, wann er stattfindet.

**Sätze protokollieren.** **Log sets** auf der Kraft-Einheit (Today oder die Einheit aus dem
Plan-Tab) klappt sie auf: pro Satz ein Eingabefeld für Wiederholungen und Gewicht, die „Previous"-
Spalte und ein Haken. **Finish** führt danach in die Frage „How hard was it?". Leer gelassen heißt
„wie programmiert".

**Progression als Vorschlag.** Nach einem geloggten Training schlägt die App die nächste Last vor
(doppelte Progression: erst Wiederholungen ans obere Ende, dann Gewicht rauf). Der Vorschlag
**überschreibt nichts** — du bestätigst ihn oder ignorierst ihn.

---

## 10. `/benchmarks` — Tests eintragen

Erreichbar über **Progress → Log a test** (springt an den Anfang) oder **Log a race** (springt zu
den Rennen & Simulationen); die Seite heißt jetzt **Tests & races**, der Tab **Progress** leuchtet,
und „← Progress" führt zurück.

Eine Liste standardisierter Tests (z. B. 1 km Zeit, Wall Balls in 2 min). Ergebnis eintragen,
speichern — die Zielzeit-Prognose wird sofort neu gerechnet und der Verlauf auf `/progress`
fortgeschrieben. Der Plan setzt Benchmark-Wochen automatisch: Woche 1, Ende des Build-Blocks und
ein letzter Test vor dem Rennen.

**Der letzte Test liegt nie in der Rennwoche.** Bei zweiwöchigem Taper (16-Wochen-Plan) sitzt er auf
dessen erster Woche — zwei Wochen vor dem Start. Ist der Taper nur eine Woche lang (12 Wochen und
kürzer), rückt er in die letzte Peak-Woche: ein All-out-Test sieben Tage vor dem Rennen ist eine
Belastung, keine Generalprobe. Fällt er dabei auf die Woche mit der Rennsimulation, geht er noch
eine Woche zurück — zwei Rennleistungen in sieben Tagen sind eine zu viel.

### Stations-Benchmarks

Acht Karten für die Stationen in voller Renndistanz: SkiErg 1000 m, Sled Push 50 m, Sled Pull
50 m, Burpee Broad Jumps 80 m, Row 1000 m, Farmers Carry 200 m, Sandbag Lunges 100 m, Wall Balls
100 Wiederholungen (auf Zeit, nach einem Lauf oder Stationsblock). Eintragen wie jeder Benchmark;
der [Import](#import-aus-hyroxtraining) füllt sie aus dem Tracker. Die Zielzeit-Prognose rechnet sie
nicht ein, und die Rennanalyse liest sie nicht — dort zählen nur Rennen und Simulationen.

### Rennen & Simulationen

Die Karte **Races & simulations** oben auf der Seite sammelt echte Rennen und volle Simulationen
mit ihren Splits — die Grundlage der [Rennanalyse](#11-progress--auswertungen) auf `/progress`.

- **Target time** — deine Zielzeit (h:mm:ss, zwischen 40:00 und 4:00:00; dieselbe Zahl wie die
  Zielzeit unter Setup), „Set" speichert, leeres
  Feld + „Set" löscht sie. Sie steht im Profil und wird nur von der Rennanalyse gelesen: Plan und
  „Estimated finish" ändern sich dadurch **nicht**.
- **Add a race or simulation** (aufklappen): Art (Simulation/Race), Datum, Bezeichnung, dann in
  Rennreihenfolge Run 1, SkiErg, Run 2, Sled Push … Run 8, Wall Balls, dazu die Roxzone als Summe
  und die Gesamtzeit. Zeiten als `m:ss`, `h:mm:ss` oder Sekunden. Nicht gestoppte Felder bleiben
  leer. Bleibt die Gesamtzeit leer, wird sie aus den Splits addiert — das geht nur, wenn alle 17
  Felder gefüllt sind.
- **Baseline** — das Häkchen „This is my baseline" (oder später **Make baseline** in der Liste)
  markiert das Rennen, von dem aus dein Ziel gemessen wird, z. B. dein letztes echtes Rennen. Es
  gibt genau eine Baseline; eine neue löst die alte ab.
- Die Liste darunter zeigt alle Einträge, neueste zuerst; **Delete** löscht einen.

Es gibt keine Stoppuhr für Live-Splits und keinen Knopf an der Simulations-Einheit in `/plan`, der
hierher führt — die Zeiten trägst du nach der Einheit hier ein. Ein Import des JSON-Backups aus
dem Einzeldatei-Tracker gibt es nicht.

### AT-PT — Schwellentest auf dem Ergometer

Oben auf der Seite steht eine eigene Karte für den **AT-PT**: fünf Minuten auf SkiErg oder RowErg,
gehalten in einem festen Pulsband nahe der Schwelle.

- **Maximalpuls eintragen** (Feld „Max heart rate", „Set"). Er wird im Profil gespeichert und von
  sonst nichts gelesen — der Plan ändert sich dadurch nicht. Leeres Feld + „Set" löscht ihn.
- Daraus rechnet die Karte die Zielwerte: Aufwärmen bis ca. 80 %, **Halteband bei 87 % ± 3
  Schläge**, Erholungsmarke bei zwei Dritteln. Bei 195 bpm: Aufwärmen bis 156, Band 167–173,
  Erholung bis 130. Ohne Maximalpuls zeigt die Karte nur die Prozentwerte.
- Ablauf: 10 min einfahren, Puls ins Band bringen, **5:00 im Band halten** (das Tempo anpassen,
  nicht das Band), den Wattschnitt dieser fünf Minuten notieren. Dann anhalten und die Zeit stoppen,
  bis der Puls auf die Erholungsmarke gefallen ist.
- Eingetragen werden **zwei Werte**: Durchschnittswatt und Erholungszeit (mm:ss). Einer allein
  reicht auch. Beide erscheinen als eigener Verlauf auf `/progress` — Watt „higher is better",
  Erholungszeit „lower is better".
- Vergleichbar sind nur Tests auf demselben Gerät mit derselben Dämpfereinstellung. Brustgurt
  statt Handgelenksmessung: beim Ziehen am Erg misst die Uhr am Handgelenk unzuverlässig.
- Die Zielzeit-Prognose rechnet die AT-PT-Werte nicht ein; sie bleiben ein reiner
  Fortschrittsmesser.

---

## 11. `/progress` — Auswertungen

Oben zwei Knöpfe: **Log a test** und **Log a race** — beide auf [Tests & races](#10-benchmarks--tests-eintragen).

| Element | Was es zeigt |
|---|---|
| **Estimated finish** | Die Zielzeit-Prognose als Rennuhr, darunter dein **Ziel und der Abstand dahin** ([Liegst du auf Kurs?](#was-unter-der-einheit-steht)) und die Pace-Zonen Easy und Race. Stand bis zu diesem Umbau neben der Woche. |
| **ACWR now** | Belastungsverhältnis akut/chronisch |
| **Avg. weekly compliance** | Geloggte gegen geplante Einheiten |
| **Sessions logged** | Gesamtzahl |
| **Weekly compliance** | Balken pro Woche |
| **Effort: planned vs. felt** | RPE-Ziel als Linie gegen dein geloggtes RPE |
| **Training load ratio** | ACWR über die Zeit, mit den Schwellen 0,8 / 1,3 / 1,5. Die Unterzeile nennt, wie viele [ungeplante Garmin-Läufe](#garmin-läufe-im-training) mitgezählt sind. |
| **Finish-time estimate over time** | Jede Neuberechnung der Prognose |
| **Benchmarks** | Ein Verlauf pro Test |

Die ACWR-Kurve wird Tag für Tag mit **derselben** Funktion nachgerechnet, die auch die adaptive
Schicht benutzt — Diagramm und Engine können nicht auseinanderlaufen.

**Woraus die Zielzeit-Prognose gerechnet wird.** Aus denselben Zahlen wie das Pacing-Blatt auf
[`/race`](#12-race--renntag-pacing-und-ergebnis): acht Kilometer zu deiner Rennpace, plus was deine
acht Stationen kosten, plus die Roxzone deines Levels. Wo ein Rennen geloggt ist, zählen die
gemessenen Stationszeiten statt der Schätzung aus den Tiers. Prognose und Pacing-Blatt sind damit
zwei Ansichten **einer** Rechnung — die Zielzeit, die auf `/race` vorbelegt ist, verlangt genau die
Pace, aus der sie gebaut wurde.

Die Benchmarks bewegen jeweils das, wovon sie sprechen: der Wall-Ball-Test die Wall-Ball-Station,
der 1-km-Test die Laufannahme (anteilig — ein frisch gelaufener Test ist kein Rennkilometer).
Gegen eine im Rennen gemessene Stationszeit kommt ein Gym-Test nicht an.

### Imported history

Nur wenn du aus HyroxTraining [importiert](#import-aus-hyroxtraining) hast: Anzahl und Zeitraum der
importierten Einheiten, ihre Arten, und zwei Balken je Kalenderwoche (Einheiten, Stunden aus den
geloggten Dauern; die letzten 20 Wochen mit Einträgen). Reiner Verlauf — fließt nicht in ACWR oder
Plan.

### Running — Lauffortschritt aus Garmin (`/progress/running`)

Erreichbar über den Knopf **Running from Garmin →** unter „Log a test / Log a race". Oben links
„← Progress" zurück. Die Seite zeigt nur Daten, die über den Garmin-Import
([Abschnitt 13](#garmin-import-für-das-lauf-dashboard)) angekommen sind; rechts oben steht, wann
zuletzt synchronisiert wurde („synced TT.MM.JJJJ"). Ohne importierte Läufe sagt die Seite das,
statt leere Diagramme zu zeigen.

| Element | Was es zeigt |
|---|---|
| **This week** | Kilometer der laufenden Woche (Montag bis Sonntag, nach dem lokalen Datum der Uhr). |
| **Avg. km / week (4 wk)** | Schnitt der letzten vier *vollen* Wochen, darunter der Unterschied zu den vier Wochen davor. Die laufende Woche zählt nicht mit. |
| **Avg. pace (4 wk)** | Pace über alle Läufe der letzten vier vollen Wochen, nach Distanz gewichtet (Gesamtzeit ÷ Gesamtstrecke), darunter schneller/langsamer als die vier Wochen davor. |
| **Runs (4 wk)** | Anzahl Läufe in denselben vier Wochen; darunter der längste Lauf der letzten 12 Wochen. |
| **Weekly distance** | Kilometer je Woche, die letzten 12 Wochen. |
| **Average pace per week** | Gewichtete Pace je Woche (nur Wochen mit Läufen). Niedriger = schneller. |
| **Aerobic efficiency** | Meter pro Herzschlag je Woche: Strecke ÷ (Minuten × Ø-Puls), nur Läufe mit Pulsdaten. Steigt der Wert bei ähnlichem Training, läufst du bei gleichem Puls schneller. |
| **VO2max** | Garmins VO2max-Schätzung, nur Tage mit neu berechnetem Wert (fortgeschriebene Tage werden nicht gespeichert). |
| **Race predictions** | Garmins Prognose für 5 km, 10 km, Halbmarathon und Marathon zum neuesten Stand, darunter die Veränderung seit der ältesten gespeicherten Prognose (bis ca. 200 Tage zurück). |
| **Recent runs** | Die letzten 15 Läufe: Datum, Name, km, Zeit (nicht am Handy), Pace, Ø-Puls. Laufband-Läufe sind mit „· treadmill" markiert. |

Gezählt werden alle Garmin-Lauftypen (Straße, Laufband, Trail, Bahn). Laufband-Pace kommt von der
Uhr und ist entsprechend ungenauer. Was die Läufe im Plan bewirken (Einheiten abhaken, Belastung,
KI-Coach), steht unter [Garmin-Läufe im Training](#garmin-läufe-im-training). In **Recent runs**
trägt ein Lauf, der eine geplante Einheit abgehakt hat, den Vermerk „· logged to plan".

### Race readiness

Direkt unter den Kennzahlen, gerechnet aus den Einträgen unter
[Rennen & Simulationen](#rennen--simulationen) (`src/lib/engine/raceAnalysis.ts`; nichts davon
wird gespeichert, alles wird bei jedem Aufruf neu gerechnet). Ohne Zielzeit oder ohne Einträge
sagt der Bereich, was fehlt.

| Element | Was es zeigt |
|---|---|
| **Target / Latest / Gap to target** | Zielzeit, Gesamtzeit des neuesten Eintrags (ohne Baseline) und der Abstand. |
| **Readiness** | Wie weit du von der Baseline zum Ziel gekommen bist, gemittelt über alle zehn Segmente (Laufen, acht Stationen, Roxzone). Erscheint erst, wenn eine Baseline gesetzt ist und jedes Segment Daten hat; sonst steht da, wie viele Segmente fehlen. |
| **Segments** | Pro Segment Baseline, aktueller Wert, Ziel-Split, Abstand und Status: *on target* (am oder unter dem Ziel), *close* (bis 5 % darüber), *needs work*. „Aktuell" ist der neueste Eintrag, der dieses Segment gestoppt hat. Darunter die drei Segmente, die relativ am weitesten zurückliegen. |
| **Pace lost after the burpee broad jumps** | Lauf 5 (direkt nach den BBJ) gegen den Schnitt der Läufe 1–4, in s/km, neuester Eintrag und Baseline. |
| **Fade over the race** | Läufe 5–8 gegen Läufe 1–4, in s/km. |
| **Finish times** | Alle Gesamtzeiten über die Zeit, mit der Zielzeit als Linie (ab zwei Einträgen). |

**Ziel-Splits:** Die Zielzeit wird so auf die Segmente verteilt, wie deine Baseline sie verteilt
hat — war bei dir Wall Balls die längste Station, bleibt sie es im Ziel. Ohne vollständig
gestoppte Baseline nimmt die App eine typische Open-Verteilung (`DEFAULT_SEGMENT_SHARES` in
`constants.ts`). Die Rennanalyse fließt nicht in den Plan ein; der [KI-Coach](#ki-coach-gemini)
bekommt sie als Fakten mit.

---

## 12. `/race` — Renntag: Pacing und Ergebnis

Zwei Blicke auf dasselbe Rennen: nach vorne die Zielzeit, aufgeteilt in die Minuten, aus denen sie
besteht — nach hinten das Rennen, das gelaufen wurde, und was die App daraus lernt.

### Das Pacing-Blatt

Oben steht ein Feld für die **Zielzeit** — vorbelegt mit dem Ziel aus deinem
[Setup](#8-settings--setup--tools). Daraus rechnet die App die siebzehn Abschnitte eines
Hyrox-Rennens: acht Läufe, acht Roxzone-Wechsel und acht Stationen, in Rennreihenfolge, jeweils mit
Teilzeit und aufgelaufener Uhrzeit.

*Kurzzeitig war hier die Prognose vorbelegt statt des Ziels.* Das zerlegte die Zeit, die du ohnehin
laufen wirst — die Lücke unten konnte damit gar nichts anderes als null anzeigen.

**Die Reihenfolge des Abzugs ist die eigentliche Aussage.** Stationen und Roxzone werden zuerst
abgezogen — sie sind am Renntag, was sie sind; niemand schiebt den Schlitten schneller, weil die Uhr
es verlangt. Was übrig bleibt, ist das Laufbudget, und daraus fällt die einzige Zahl, die man mit an
den Start nimmt: **die geforderte Pace pro Kilometer.**

Die Stationszeiten kommen aus deinen Tiers und deiner Division, nach einem geloggten Rennen aus den
gemessenen Zeiten. Die Roxzone wird aus deinem Level geschätzt (Einsteiger 60 s pro Wechsel, World
Class 25 s).

**Die acht Läufe sind nicht gleich schnell.** Niemand läuft ein Hyrox in einer Pace: Lauf 1 geht
frisch raus, Lauf 8 auf Beinen, die durch acht Stationen sind — dazwischen liegen rund zwölf
Prozent. Das Blatt teilt das Laufbudget deshalb entlang einer Ermüdungskurve auf, statt achtmal
dieselbe Zahl hinzuschreiben. Ein Ziel von 1:20 kommt so heraus:

| Lauf | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Split | 4:49 | 4:55 | 5:01 | 5:06 | 5:10 | 5:14 | 5:21 | 5:24 |

Die Kurve **verteilt um, sie addiert nicht.** Ihr Mittel ist exakt 1, denn deine Rennpace ist bereits
die Pace, die du *im Rennen inklusive Ermüdung* hältst — eine Kurve, die oben drauf käme, würde
dieselbe Ermüdung zweimal zählen und jede Prognose der App ein zweites Mal verlangsamen. Die
Gesamtzeit ändert sich dadurch nicht, das Blatt endet weiter auf die Sekunde genau auf der
Zielzeit; die genannte Pace pro Kilometer ist das Mittel der acht.

Unter den Kennzahlen steht ein Satz zur **Lücke**: verlangt die Zielzeit eine Pace, die schneller
ist als deine aktuelle Rennpace, nennt er den Rückstand über die acht Kilometer; reicht die Pace
bereits, sagt er, dass jetzt die Stationen entscheiden. Sind Stationen und Roxzone zusammen schon
länger als die Zielzeit, sagt die App das — statt eine unmögliche Pace auszurechnen.

### Was jede Station kostet

Statt „Tier 1 bis 3" steht hier eine Zeit: **wie viele Sekunden dich eine Station gegenüber der
Version von dir kostet, die sie beherrscht.** Sortiert, teuerste zuerst, mit Balken und mit der
Summe über alle acht — die Zahl, die sagt, wie viel in der Halle noch zu holen ist. Solange kein
Rennen geloggt ist, sind das Schätzungen aus den Tiers; danach echte Messwerte. Dieselben Kosten
erscheinen als Kachel `+m:ss` neben den teuren Stationen im Pacing-Blatt.

### Ein Rennergebnis eintragen

Ganz unten öffnet **„Log a race"** ein Formular: Renndatum, **Endzeit**, acht Laufsplits und acht
Stationszeiten. Pflicht ist nur die Endzeit; jeder weitere Split macht das Bild schärfer. Zeiten als
`mm:ss` oder `h:mm:ss`.

Beim Speichern:

- Die **Roxzone** wird abgeleitet, wenn sie nicht dabeisteht: Endzeit minus Läufe minus Stationen.
- Die **Stationstiers werden neu gesetzt**, aus Zeiten, die unter Rennbedingungen gemessen wurden.
  Das ist die beste Kalibrierung, die die App je bekommt: sie steuert danach die Sessionauswahl und
  die Gewichtung deiner schwächsten Station. Die Rückmeldung nennt, wie viele Stationen dadurch neu
  eingestuft wurden.
- Zusätzlich bleiben die **gemessenen Sekunden** stehen, Station für Station. Ein Tier von 1 bis 3
  wirft weg, was die Uhr gesagt hat; die Prognose und das Pacing-Blatt rechnen ab jetzt mit den
  echten Zeiten. Wer nur drei Stationen einträgt, behält für die anderen fünf, was zuletzt bekannt
  war.
- Die **Zielzeit-Prognose wird sofort neu gerechnet** — sie soll nicht auf die nächste geloggte
  Einheit warten, um zu merken, dass gerade ein Rennen stattgefunden hat.
- Die **Pace-Zonen bleiben unangetastet.** Rennpace unter Stationsermüdung ist nicht dieselbe Zahl
  wie ein frischer 1-km-Test; sie dorthin zu schreiben würde jeden lockeren Lauf aus dem falschen
  Grund verlangsamen. Die Benchmarks führen die Zonen, das Rennen führt die Stationen.
- Ergeben Läufe und Stationen zusammen **mehr als die Endzeit**, wird der Eintrag abgelehnt, mit dem
  Hinweis, was nicht zusammenpasst.

Die letzten zehn Rennen stehen als Liste über dem Formular, mit Endzeit und Roxzone. Gespeichert
wird das Ergebnis dort, wo auch die [Rennen & Simulationen](#rennen--simulationen) von
`/benchmarks` liegen: Es erscheint dort in der Liste (als *race*) und zählt in der Rennanalyse auf
`/progress`. Sind alle acht Läufe gestoppt, stehen sie als Splits mit; fehlt einer, nur die
Stationen. Auf `/race` selbst lässt sich ein Ergebnis **nicht ändern** — löschen und als Baseline
markieren geht in der Liste auf `/benchmarks`.

---

## 13. Verbindungen: Strava, Garmin, Telegram

**Strava / Garmin.** Einmal verbinden; danach werden Läufe automatisch der passenden geplanten
Einheit zugeordnet und geloggt. Die tatsächlich gelaufene Pace fließt direkt in die
Pace-Kalibrierung. Neue Aktivitäten kommen per Webhook an — kein Polling, keine manuelle Eingabe.

Automatisch zugeordnet werden nur Läufe mit gültigem Startzeitpunkt nach dem Planstart, in der
aktuellen Planwoche und im passenden Tag-/AM-PM-Slot. Alte oder nicht passende Aktivitäten werden
nicht auf eine andere offene Einheit umgebucht. Nicht zugeordnete Läufe kannst du manuell loggen.

**Garmin-Einrichtung:** Zusätzlich zu Client-ID und Client-Secret ist `GARMIN_WEBHOOK_SECRET`
erforderlich. Die Push-URL wird mit `?token=<Secret>` registriert (alternativ Header
`x-garmin-webhook-secret`). Ohne oder mit falschem Secret antwortet der Endpunkt mit 401, auch
bei der Erreichbarkeitsprüfung. URL samt Token nicht teilen oder in öffentliche Logs übernehmen.
Pro Push sind höchstens 20 Aktivitäten erlaubt; Datenbankfehler werden nicht mehr still bestätigt.

**Telegram.** Abends kommt ein Check-in mit vier Knöpfen (As planned, Felt harder, Felt easier, Skip — in der App
entspricht das Done mit der Skala auf, über oder unter dem Ziel bzw. Skip im ⋯-Menü). Antippen loggt
die Einheit, ohne die App zu öffnen. Ohne Telegram gibt es stattdessen eine E-Mail.

### Garmin-Import für das Lauf-Dashboard

Unabhängig von der offiziellen Garmin-Verbindung oben gibt es einen Import-Endpunkt
`POST /api/garmin/import`, der Läufe, VO2max-Werte und Rennprognosen für
[`/progress/running`](#running--lauffortschritt-aus-garmin-progressrunning) speichert. Gedacht ist er
für einen Sync von außen — etwa eine geplante Claude-Aufgabe, die Garmin über den Garmin-Connector
liest und die Daten in dessen Format weiterschickt (`activities`, `vo2max`, `race_predictions`).
In der App selbst gibt es dafür **keinen Knopf**: Ohne eingerichteten Sync bleibt die Seite leer.

- **Einrichtung:** `GARMIN_IMPORT_SECRET` setzen; Aufrufe senden es als
  `Authorization: Bearer <Secret>`. Ohne Secret antwortet der Endpunkt mit 503, mit falschem mit 401.
- Gibt es in der Datenbank mehr als ein Profil, muss `GARMIN_IMPORT_PROFILE_ID` sagen, welches
  gemeint ist (sonst 409).
- Doppelt gesendete Aktivitäten werden aktualisiert, nicht doppelt angelegt. Nicht-Lauf-Aktivitäten
  und Läufe unter 400 m oder 2 Minuten werden übersprungen. Höchstens 500 Aktivitäten pro Aufruf.
- Der Export unter Setup enthält die importierten Läufe und Fitnesswerte (`garmin_runs`,
  `garmin_fitness`).
- Die Antwort nennt unter `logged_to_plan`, wie viele Läufe eine geplante Einheit abgehakt haben.
  Klappt das Zuordnen nicht (etwa ohne Migration 0037), sind die Läufe trotzdem gespeichert und
  die Antwort enthält `auto_log_error`.

### Garmin-Läufe im Training

Was mit jedem importierten Lauf passiert:

1. **Passt er zu einer geplanten Laufeinheit, wird sie abgehakt.** Gleiche Regeln wie bei Strava:
   Laufeinheit (Easy, Intervalle, Compromised) der **aktuellen** Planwoche, gleicher Tag, gleiche
   Tageshälfte (Start vor 12 Uhr = vormittags). Geloggt werden echte Dauer, Strecke und Pace — die
   Pace fließt in die Kalibrierung der Pace-Zonen. Als Anstrengung wird das **RPE-Ziel** der
   Einheit eingetragen, nicht der Puls; fühlte es sich anders an, korrigierst du das in der App
   wie bei jedem Log. Eine Einheit, die du schon selbst geloggt hast, bleibt unangetastet.
2. **Sonst zählt er als ungeplanter Lauf in die Belastung** (ACWR), mit aus dem Puls geschätzter
   Anstrengung — siehe [Läufe außerhalb des Plans](#6-wie-sich-der-plan-anpasst). Er hakt nichts
   ab und verschiebt nichts; der Plan reagiert nur über die üblichen ACWR-Regeln (Trim, Deload).
3. **Der KI-Coach sieht die Laufdaten** (Wochenkilometer, Pace-Trend, VO2max, Prognosen,
   ungeplante Läufe), siehe [KI-Coach](#ki-coach-gemini).

Abgehakt wird nur, was in der laufenden Woche liegt. Ein Lauf vom Sonntagabend, der erst am Montag
importiert wird, zählt deshalb nur als ungeplanter Lauf; die Sonntags-Einheit bleibt offen und
lässt sich von Hand loggen.

---

## 14. Automatische Abläufe im Hintergrund

| Wann | Was passiert |
|---|---|
| Täglich abends | Check-in an alle mit einer heute noch offenen Einheit (Telegram, sonst E-Mail) |
| Nächtlich | Makro-Guardrails: ACWR-Prüfung, Auto-Deload, Rebase, Reha-Übergänge. Eingetragene [Urlaubstage](#urlaub) zählen nicht als Tage ohne Einheit. |
| Sonntagabend | Wochenrückblick: Compliance, Belastung, was nächste Woche ansteht. Mit `GEMINI_API_KEY` hängt der Rückblick des [KI-Coaches](#ki-coach-gemini) an, plus der Hinweis, wie viele Vorschläge auf `/today` warten — angewendet wird dabei nichts. |

Diese Läufe sind mit einem Betreiber-Secret geschützt und lassen sich nicht von außen auslösen.

---

## 15. Eine App für einen Athleten

### Offline in der Halle

Die App lässt sich **auf dem Handy installieren** („Zum Startbildschirm hinzufügen") und startet dann
direkt auf `/today`.

**Was du schon einmal geöffnet hast, bleibt lesbar — auch ohne Empfang.** Eine Seite wird beim
Aufruf mitgespeichert; im Keller bekommst du die zuletzt geladene Fassung. Eine Seite, die du noch
nie geöffnet hast, sagt das („No signal"), statt leer zu bleiben.

Solange kein Netz da ist, steht oben ein **Hinweisband**. Das ist der wichtigere Teil: Eine
Seite aus dem Cache sieht aus wie eine frische, und eine Trainingswoche, die stillschweigend den
Stand von gestern zeigt, wäre schlimmer als gar kein Offline-Modus.

**Loggen braucht Empfang — mit Absicht.** Beim Loggen läuft die Kalibrierung auf dem Server. Eine
Warteschlange, die später nachspielt, würde Einheiten in der falschen Reihenfolge verrechnen und
Pace-Zonen und Tiers um Beträge verschieben, die niemand angefordert hat. Ein Log ohne Netz sagt
das und bleibt ungetippt — es kann die zwanzig Minuten bis zum Ausgang warten.

**Abmelden räumt den Cache mit ab.** Die gespeicherten Seiten sind fertig gerendertes HTML mit
deinen Einheiten darin; sonst hieße „abmelden" nur „abmelden, außer für alles, was schon da ist".


Diese App wird von genau einer Person für ihr eigenes Training benutzt. Was nur dazu da war, sie an
andere zu verkaufen, ist entfernt:

- **Keine Bezahlung, keine Paywall.** Früher war Woche 1 frei und der Rest gesperrt, bis der
  Rennzyklus freigeschaltet wurde. Stripe, die Freischaltung und die Sperre sind raus — jede Woche
  ist vollständig da.
- **Keine Startseite mit Pitch, keine SEO-Landingpages.** `/` führt direkt auf `/today`; wer nicht
  angemeldet ist, landet von dort im Onboarding.
- **Keine Betriebs-Kennzahlen.** `/api/admin/kpis` maß Dinge wie „Anteil der Logs mit echtem RPE"
  über alle Profile hinweg — bei einem Athleten ist das keine Kennzahl.

Was bewusst **bleibt**: die Anmeldung per Magic Link (du nutzt Handy *und* PC), die Zeilen-Sicherheit
in der Datenbank (die einzige Schicht zwischen einem geleakten Schlüssel und deinen Daten), das
Betreiber-Secret für die Cron-Endpunkte (die sind öffentliches HTTP, egal wie viele Nutzer es gibt)
und die fünf Level mit ihren Katalogen — du bist heute ein Level, aber nicht für immer.

---

## 16. `/demo` — ausprobieren ohne Konto

Ein kompletter Durchlauf mit Beispieldaten: Plan erzeugen, eine Einheit loggen, die Feedback-Karte
und den Anpassungs-Feed sehen. Dieselbe Engine wie in der echten App, nur mit einer
Beispiel-Bibliothek statt der Datenbank — geeignet, um Varianten, Doppeltage und die adaptive
Schicht zu zeigen.

---

## 17. Betreiber-Oberflächen

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

---

## 18. Begriffe

| Begriff | Bedeutung |
|---|---|
| **Phase** | Base, Build, Peak oder Taper — die vier Abschnitte eines Rennzyklus. |
| **Block** | Ein Baustein einer Einheit: Warm-up, Hauptteil, Finisher. |
| **Makrozyklus** | Ein kompletter Rennzyklus innerhalb der Saison. |
| **Deload** | Entlastungswoche. Im Jahresplan −35 %, innerhalb des Wochenplans −40 % — die beiden Ebenen führen ihre eigene Zahl, absichtlich. |
| **ACWR** | Verhältnis der Belastung der letzten 7 zu den letzten 28 Tagen. |
| **RPE** | Subjektives Anstrengungsempfinden, 1–10. |
| **Kompromittiertes Laufen** | Laufen unter Vorermüdung — das Gefühl des echten Rennens. Die Session ist **level- und phasenabhängig**: 60 Vorgaben über fünf Level und vier Phasen, siehe [Abschnitt 4](#4-today-und-plan--heute-und-die-trainingswoche). |
| **Polarisiert** | 75–85 % der Laufdistanz locker, der Rest wirklich hart. Gemessen an der **Distanz je Zone**, nicht an der Zahl der Einheiten. |
| **Tier** | Leistungsstufe 1–3 pro Station; steuert Gewichte und Vorgaben. Ein geloggtes Rennen setzt sie neu, siehe [Abschnitt 12](#12-race--renntag-pacing-und-ergebnis). |
| **Roxzone** | Der Weg zwischen Laufende und Station. Achtmal im Rennen, und in Summe eine der größten stillen Zeitreserven — im Pacing-Blatt eigene Zeilen. |
| **Rebase** | Neuberechnung des Plans ab heute statt nachträglicher Änderung. |
| **Variante** | Eine konkrete Ausprägung einer Kerneinheit (14 Lauf-, 5 Kraftformen). Kompromittiertes Laufen, Stationsarbeit und Intervalle kommen aus eigenen Katalogen nach Level und Phase (60 / 60 / 86 Sessions). |
| **Baseline** | Das eine Rennen (oder die Simulation), von dem aus die Zielzeit gemessen wird; bestimmt die Form der Ziel-Splits. |
| **Readiness** | Anteil des Wegs von der Baseline zum Ziel, gemittelt über zehn Segmente, 0–100 %. |
| **Wiedereinstiegswoche** | Die leichtere Woche nach mindestens fünf Urlaubstagen — wie ein Deload. |
| **Workout-Sammlung** | Woher der Inhalt der Einheiten kommt: Standard-Bibliothek oder Verona-Plan (Setup → Workouts). Die Wochenstruktur rechnet in beiden Fällen die Engine. |
| **Post-BBJ-Verlust** | Wie viel langsamer Lauf 5 nach den Burpee Broad Jumps war als die Läufe davor, in s/km. |

---

## 19. Änderungsprotokoll

Neueste zuerst. Jede Zeile nennt die Funktion und den Abschnitt, in dem sie beschrieben ist.

| Änderung | Abschnitt |
|---|---|
| **Garmin-Läufe im Training:** importierte Läufe haken passende geplante Laufeinheiten der laufenden Woche ab (echte Pace → Pace-Zonen); alle anderen Läufe zählen mit aus dem Puls geschätzter Anstrengung in die Belastung (ACWR); der KI-Coach bekommt Wochenkilometer, Pace, VO2max, Prognosen und ungeplante Läufe. „· logged to plan" in Recent runs | [6](#6-wie-sich-der-plan-anpasst), [4](#ki-coach-gemini), [11](#running--lauffortschritt-aus-garmin-progressrunning), [13](#garmin-läufe-im-training) |
| **Balkendiagramme:** Der erste Balken überdeckt die Beschriftung der senkrechten Achse nicht mehr (Weekly distance, Weekly compliance, Imported history) | [11](#11-progress--auswertungen) |
| **Lauf-Dashboard aus Garmin** (`/progress/running`, über Progress → Running from Garmin): Wochenkilometer, Pace- und Effizienz-Trend, VO2max, Rennprognosen und die letzten Läufe. Daten kommen über den neuen Import-Endpunkt `/api/garmin/import`; reine Anzeige, der Plan bleibt unberührt | [2](#2-seitenübersicht), [11](#running--lauffortschritt-aus-garmin-progressrunning), [13](#garmin-import-für-das-lauf-dashboard) |
| **Neue Struktur:** vier Tabs statt sechs — Today, Plan, Progress, Race. **Today** ist der neue Start mit Wochenstreifen und der Einheit des Tages; **Plan** zeigt die Woche als Liste (eine Zeile pro Tag, Antippen öffnet die Einheit) und die Saison über „Week \| Season"; Tests & Rennen tragen sich über Progress ein, das Kraftprogramm über Setup. **Loggen** mit einem Knopf: „Done" fragt im Sheet nach der Anstrengung (vorbelegt mit dem Ziel), Skip und Move sitzen im ⋯-Menü, nach dem Speichern bietet ein Hinweis Undo. Die Prognose steht jetzt auf Progress. Jede Einheit zeigt ihren Verlauf als Balken | [2](#2-seitenübersicht), [4](#4-today-und-plan--heute-und-die-trainingswoche), [5](#5-eine-einheit-loggen-und-den-fehlklick-zurücknehmen), [11](#11-progress--auswertungen) |
| **Schnellere Seitenwechsel:** jeder Bereich zeigt beim Tippen sofort Platzhalter mit stehender Navigation; ein vor weniger als 30 s besuchter Bereich kommt ohne Ladezeit zurück; die Seiten fragen die Datenbank in weniger Runden ab, und der Server läuft jetzt in Frankfurt neben der Datenbank statt in den USA | [Seitenwechsel](#seitenwechsel) |
| **Neues Design wie HyroxTraining („Box Whiteboard"):** heller Whiteboard-Grund, Barlow-Schriften, Markerfarben mit je einer Bedeutung (Laufen jetzt blau, hart rot); Navigation am Desktop in einer Aluminium-Spalte links, am Handy als Tab-Leiste unten mit Setup-Zahnrad oben; die heutige Einheit hebt sich mit Schatten ab, Erledigtes wird grün durchgestrichen | [2](#2-seitenübersicht), [4](#eine-einheitenkarte), [8](#8-settings--setup--tools) |
| **Zusammengeführt:** die Härtung vom 04.09. — „heute" in der Trainingszeitzone, Rückfrage vor Reha-Modus und Neuaufbau, ein Log wird mit Sätzen und Status in einem Schritt gespeichert (doppeltes Loggen legt nichts doppelt an), der Nachtlauf passt jede Woche nur einmal an, Garmin-Webhook mit Secret | [4](#4-today-und-plan--heute-und-die-trainingswoche), [13](#13-verbindungen-strava-garmin-telegram) |
| **Zusammengeführt:** die Arbeit vom 23.–30.08. (Datum auf jeder Karte, Ruhetage in der Woche, Level/Division/Zielzeit änderbar, Startdatum, Doppeltage festlegbar, `/race` mit Pacing-Blatt, Übergangsblock, Stationen tauschen, Export, Offline, Kataloge nach Level) liegt jetzt auf derselben Version wie Rennanalyse, KI-Coach, Verona-Plan, Kraft-Tage, Spieltag und Urlaub | [4](#4-today-und-plan--heute-und-die-trainingswoche), [8](#8-settings--setup--tools), [12](#12-race--renntag-pacing-und-ergebnis) |
| **Eine Zielzeit:** Setup und *Target time* auf `/benchmarks` schreiben dieselbe Zahl; ein auf `/race` geloggtes Rennen erscheint unter Rennen & Simulationen und in der Rennanalyse | [8](#8-settings--setup--tools), [10](#rennen--simulationen), [12](#12-race--renntag-pacing-und-ergebnis) |
| **Erg-Leiter bleibt:** Stationseinheiten kommen aus dem Level-Katalog; zielt eine Build-Woche auf schwache Wall Balls, kommt die Erg-Leiter mit 100 Wall Balls | [4](#4-today-und-plan--heute-und-die-trainingswoche) |
| **Zweiter Kraft-Tag** nimmt jetzt auch eine zweite Stationseinheit, wenn kein leichter Platz frei ist | [8](#deine-trainingswoche) |
| **Neues Layout auf `/plan`:** Wochenkopf mit ‹ › zur vorigen/nächsten Woche, „Week N of M", Fortschrittsbalken „x of y sessions done", „Go to this week →" und das Wochenziel als „Coach note"; Blöcke als farbige Abschnitte mit durchnummerierten Schritten | [4](#die-wochenansicht), [4](#eine-einheitenkarte) |
| **Anstrengungs-Skala:** „Felt harder/easier" öffnen eine RPE-Skala 1–10 (vorbelegt mit Ziel ±2), die vor dem Speichern sagt, was der Plan daraus macht — auch im Demo | [5](#die-anstrengungs-skala-how-hard-was-it) |
| **Satz-Tabelle** für Kraft-Einheiten: Spalten Set · Previous · kg · Reps · ✓, „Previous" zeigt das letzte Training, ✓ übernimmt die Zeile | [9](#9-strength--eigenes-kraftprogramm) |
| **Urlaub eintragen** (Setup → Vacation): „Keep it ticking" oder „Fully off"; Simulation und Benchmarks wandern aus dem Urlaub, danach eine Wiedereinstiegswoche; Urlaubstage lösen keinen Pausen-Neuaufbau aus | [8](#urlaub) |
| **Kraft-Tage pro Woche (1 oder 2)** und fester **Spieltag** unter „Form deiner Woche"; mit dem Verona-Plan Strength A und B in derselben Woche und ein Spieltag auch in der Base-Phase | [8](#deine-trainingswoche) |
| **Verona-Plan als Workout-Sammlung** (Setup → Workouts): 50 Einheiten aus dem Tracker, von der Engine nach Typ, Phase und Schwachstelle eingeplant; Wechsel baut die restlichen Wochen neu | [8](#workouts) |
| **Import aus HyroxTraining** (JSON-Backup): Verlauf, Simulationen mit Splits, Stations-Rekorde; doppelter Import fügt nichts doppelt hinzu. Neu: „Imported history" auf `/progress`, acht Stations-Benchmarks | [8](#import-aus-hyroxtraining), [10](#stations-benchmarks), [11](#imported-history) |
| Kraft- und Stationseinheiten nennen aufgeklappt Name und Zweck ihrer Variante | [4](#eine-einheitenkarte) |
| Behoben: Pläne mit Compromised-Run-Einheit ließen sich nicht speichern (Onboarding, Neuaufbau nach Setup-Änderung) | [3](#3-onboarding--den-plan-erzeugen) |
| **KI-Coach (Gemini)** auf `/plan`: Rückblick auf drei Wochen und bis zu drei Vorschläge (Move/Easier/Harder/Skip), von der Engine geprüft, erst per „Apply" wirksam, mit Undo; Rückblick auch im Sonntags-Review | [4](#ki-coach-gemini), [14](#14-automatische-abläufe-im-hintergrund) |
| **Rennen & Simulationen** mit allen Splits und Zielzeit auf `/benchmarks`; **Race readiness** auf `/progress`: Ziel-Splits aus der Baseline, Abstand je Segment, Readiness, Pace-Verlust nach den BBJ, Fade | [10](#rennen--simulationen), [11](#11-progress--auswertungen) |
| Benchmark **AT-PT**: Schwellentest auf dem Erg mit Pulsband aus dem eigenen Maximalpuls (im Profil gespeichert), Wattschnitt und Erholungszeit als zwei Verläufe | [10](#10-benchmarks--tests-eintragen) |
| Neue Stationsvariante im Build: Erg-Leiter (5 × 1000 m, jeder schneller) direkt in 100 Wall Balls; trifft eine schwache Wall-Ball-Station | [4](#4-today-und-plan--heute-und-die-trainingswoche) |
| **Fehler behoben:** Das Wochenlaufvolumen wurde aus der Dauer geschätzt statt aus den geschriebenen Metern und lag um das 1,5- bis 2-fache zu hoch; der Peak-Regler stellte diese überhöhte Zahl ein. Jetzt zählen die vorgeschriebenen Meter, feste und bewegliche Läufe werden getrennt, und eine nicht erreichbare Vorgabe wird benannt statt still verfehlt | [8](#8-settings--setup--tools) |
| Jede Katalog-Einheit führt jetzt **alle** Stationen, die sie trainiert, nicht nur ihre Überschrift — 57 von 60 Stationseinheiten trainieren mehrere. Die Gewichtung rechnet damit; Kraft- und Intervalleinheiten zählen bewusst nicht als Stationstraining | [4](#4-today-und-plan--heute-und-die-trainingswoche) |
| Stationen werden nicht mehr blind rotiert: die Wochen einer Phase gehen gewichtet nach Rennkosten an die Stationen, mit Unter- und Obergrenze | [4](#4-today-und-plan--heute-und-die-trainingswoche) |
| **Fehler behoben:** Beim Loggen einer Stationseinheit wurde das Tier der Station aus der Wochenrotation verschoben statt das der tatsächlich trainierten — die stimmten in etwa einer von vier Wochen überein | [4](#4-today-und-plan--heute-und-die-trainingswoche) |
| Offline nutzbar und aufs Handy installierbar: bereits geöffnete Seiten bleiben ohne Empfang lesbar, mit Hinweisband; Loggen braucht bewusst weiter Netz; Abmelden löscht den Cache | [15](#15-eine-app-für-einen-athleten) |
| Datenexport im Setup: alles Geloggte als eine JSON-Datei, mit den Blöcken der Einheiten darin — die Sicherungskopie für ein Supabase-Projekt, das sonst allein dasteht | [8](#8-settings--setup--tools) |
| Auf Einzelnutzung zugeschnitten: Stripe, Paywall und Wochensperre entfernt (jede Woche ist vollständig da), Pitch-Startseite und SEO-Landingpages entfernt (`/` führt auf `/plan`), Betriebs-Kennzahlen entfernt | [15](#15-eine-app-für-einen-athleten) |
| **Fehler behoben:** Bei einem Rennen, das weiter als 20 Wochen entfernt ist, wurde der Rennzyklus abgeschnitten und taperte Wochen bis Monate zu früh. Solche Pläne sind jetzt Übergangsblöcke, der Rennzyklus startet in Reichweite — bestehende Pläne stellt der nächtliche Lauf selbst um | [6](#6-wie-sich-der-plan-anpasst) |
| **Fehler behoben:** Ein Übergangsblock wurde bei jedem nächtlichen Neuaufbau still zu einem Rennzyklus, der auf sein eigenes Blockende hin taperte | [6](#6-wie-sich-der-plan-anpasst) |
| **Fehler behoben:** Von Hand verschobene Einheiten gingen beim nächsten Neuaufbau verloren — sie wurden unter der falschen Kalenderwoche abgelegt (Erstellungsdatum statt Startdatum des Plans) und passten danach auf keine Woche | [5](#5-eine-einheit-loggen-und-den-fehlklick-zurücknehmen) |
| Ruhetage bekommen eine eigene Kachel: die Woche zeigt alle sieben Tage, feste Ruhetage sind als solche benannt. Die Woche liest sich jetzt auch nach einem Verschieben von Montag bis Sonntag | [4](#4-today-und-plan--heute-und-die-trainingswoche) |
| **Fehler behoben:** Bei importiertem Kraftprogramm stand der Finisher direkt nach dem Warm-up und die eigentliche Arbeit ganz unten — das eigene Programm wurde ans Ende gehängt statt an die Stelle des Bibliotheksblocks | [9](#9-strength--eigenes-kraftprogramm) |
| Wochentag und **Datum** auf jeder Einheitenkarte; die HF-Zone der Karte folgt jetzt ebenfalls der Zone der Session statt der des Session-Typs | [4](#4-today-und-plan--heute-und-die-trainingswoche) |
| **Fehler behoben:** Schwellen- und Renntempo-Intervalle zeigten die Intervall-Pace (bei 19:00-5k-Niveau 29 s/km zu schnell) und kalibrierten beim Loggen die falsche Zone. Jede der 86 Sessions nennt jetzt ihre eigene Zone; gemischte Einheiten zeigen bewusst keine | [4](#4-today-und-plan--heute-und-die-trainingswoche) |
| Stationen tauschen, wenn das Gerät nicht frei ist: 2–3 Alternativen je Station, jede mit „Behält" und „Kostet". Gilt pro Station, bleibt bis zum Zurücktauschen, ändert den Plan nicht | [5](#5-eine-einheit-loggen-und-den-fehlklick-zurücknehmen) |
| Das Pacing-Blatt teilt die acht Läufe entlang einer Ermüdungskurve auf (Lauf 1 schneller als Lauf 8) statt achtmal derselben Pace. Verteilt nur um — die Prognose ändert sich dadurch nicht | [12](#12-race--renntag-pacing-und-ergebnis) |
| Zielzeit als eigene Zahl, getrennt vom Level (Level = was du tragen kannst, Ziel = was du anstrebst). Auf `/plan` steht der Abstand zum Ziel, aufgeteilt in Stationen und Beine; das Pacing-Blatt öffnet auf dem Ziel statt auf der Prognose. Nur die Zielzeit zu ändern baut keine Woche neu | [4](#4-today-und-plan--heute-und-die-trainingswoche), [8](#8-settings--setup--tools), [12](#12-race--renntag-pacing-und-ergebnis) |
| Zielzeit-Prognose läuft auf demselben Rennmodell wie das Pacing-Blatt (Stationen und Roxzone statt einer Divisionskonstante, gemessene Rennsplits wo vorhanden). Die Prognosen werden dadurch realistischer und rund zehn Minuten langsamer; die Pro-Referenzzeiten waren zu optimistisch und kosten jetzt die Minuten, die die schwereren Lasten wirklich kosten | [11](#11-progress--auswertungen), [12](#12-race--renntag-pacing-und-ergebnis) |
| Neue Seite `/race`: Pacing-Blatt aus der Zielzeit (17 Abschnitte, Stationen zuerst abgezogen), Stationskosten in Sekunden statt Tiers, und ein Rennergebnis mit Laufsplits und Stationszeiten, das die Tiers neu kalibriert | [12](#12-race--renntag-pacing-und-ergebnis) |
| Ohne Rennen läuft der Übergangsblock offen (20 Wochen, Verlängerung ab Off-Season statt neuem Reset) und wird nicht mehr als Rennzyklus angezeigt | [6](#6-wie-sich-der-plan-anpasst) |
| Nach dem Renntag: Plan wird abgeschlossen statt weiter angepasst; Übergangsblock in vier Modulen (Reset → Re-Introduction → Volume Reload → Off-Season), Länge aus dem Abstand zum nächsten Rennen | [6](#6-wie-sich-der-plan-anpasst) |
| Laufvolumen gipfelt jetzt in der Basis und fällt bis zum Rennen (100/90/80/40 % statt 85/100/90/50 %) | [6](#6-wie-sich-der-plan-anpasst) |
| Level (Zielzeit) und Division nachträglich änderbar; der Plan wird neu gebaut, Pace-Zonen und Tiers bleiben erhalten | [8](#8-settings--setup--tools) |
| Startdatum des Plans wählbar (Onboarding und Setup, mit Frage nach Neuaufbau); die laufende Woche wird aus dem Startdatum abgeleitet statt aus einem Status, der nie weitergeschaltet wurde | [3](#3-onboarding--den-plan-erzeugen), [8](#8-settings--setup--tools) |
| Doppeltage lassen sich auf feste Wochentage pinnen (Setup → Form deiner Woche), mit Hinweis auf ihre Kosten | [8](#8-settings--setup--tools) |
| Der letzte Benchmark-Test liegt nie in der Rennwoche: bei kurzem Taper rückt er in die letzte Peak-Woche | [10](#10-benchmarks--tests-eintragen) |
| Trainingsmischung nach Level und Phase als Vorgabe (Anteile statt fester Reihenfolge); kompromittiertes Laufen ab der Basis; Deload alle 3–4 Wochen in allen Phasen; Taper senkt auch Kraft und Stationen; Interferenzregel in beide Richtungen; AM/PM-Abstand auf der Karte; Ergometer-Entlastung als echte Einheit | [4](#4-today-und-plan--heute-und-die-trainingswoche), [6](#6-wie-sich-der-plan-anpasst) |
| Abmelden auf `/settings` („Dieses Gerät"); nach der Anmeldung mit bestehendem Plan geht es direkt auf `/plan` statt ins Onboarding-Formular | [3](#3-onboarding--den-plan-erzeugen), [8](#8-settings--setup--tools) |
| Schwellen- und VO₂max-Intervalle: 86 level- und phasenspezifische Sessions, bewusst ohne Stationsvorbelastung | [4](#4-today-und-plan--heute-und-die-trainingswoche) |
| Stationsarbeit: 60 level- und phasenspezifische Sessions ohne einen einzigen Laufmeter; Rotation nutzt jetzt alle drei Sessions einer Phase | [4](#4-today-und-plan--heute-und-die-trainingswoche) |
| Kompromittierte Läufe werden wieder gespeichert (sie brauchen den neuen Bibliothek-Seed aus `setup.sql`) | [4](#4-today-und-plan--heute-und-die-trainingswoche) |
| Fehler beim Planaufbau zeigen den echten Grund statt „Unexpected end of JSON input" | [8](#8-settings--setup--tools) |
| Kompromittiertes Laufen: 60 level- und phasenspezifische Sessions statt vier allgemeiner Varianten | [4](#4-today-und-plan--heute-und-die-trainingswoche) |
| Trainingstage und Doppeltage sind nach dem Onboarding änderbar (Setup → Form deiner Woche), mit live mitrechnender Frequenzberatung | [8](#8-settings--setup--tools) |
| Setup & Tools ist eine eigene Seite (`/settings`), erreichbar über „Setup" rechts oben; Verbindungen zeigen ihren Zustand | [8](#8-settings--setup--tools) |
| Von Hand verschobene Einheiten überstehen einen Neuaufbau des Plans (gemerkt an der Kalenderwoche) | [5](#5-eine-einheit-loggen-und-den-fehlklick-zurücknehmen) |
| Feste Wochentage für Long Run, Kraft und Ruhetage planweit definierbar; harte Pins mit Hinweis auf ihre Kosten | [5](#5-eine-einheit-loggen-und-den-fehlklick-zurücknehmen) |
| Fünf Leistungslevel (bis World Class, sub 60) mit Einheiten-Soll; Wochenplaner hält Abstandsregeln ein (keine zwei harten Tage in Folge, Kraft nie nach hartem Tag); 16 Wochen = 5/5/4/2; Erg-Hinweis; Kohlenhydrat-Periodisierung | [3](#3-onboarding--den-plan-erzeugen), [6](#6-wie-sich-der-plan-anpasst) |
| Kraft-Einheiten: das importierte Programm klappt mit der Karte zu — zugeklappt bleibt eine Programmzeile | [4](#4-today-und-plan--heute-und-die-trainingswoche), [9](#9-strength--eigenes-kraftprogramm) |
| Einheitliche Rückkehr zur Wochenansicht: gemeinsame Kopfzeile auf allen eingeloggten Seiten (Logo → `/plan`), Rückweg auch auf der Betreiberseite | [2](#2-seitenübersicht) |
| `/season` überarbeitet: das Jahr als Blickfang, Blöcke als aufklappbare Zeilen, Kalender auf vier Monate mit Aufklapp-Option, Editor nach unten. Einheitliche Kopfzeile mit `/plan` | [7](#7-season--rennkalender-und-jahresplanung) |
| `/plan` überarbeitet: Countdown statt Renndatum, Zyklus-Streifen, Intensitäts-Leiste je Einheit, die heutige Einheit als einziger Blickfang, Setup zusammengeklappt. Neue Farb- und Schriftwelt in der ganzen App | [4](#4-today-und-plan--heute-und-die-trainingswoche) |
| Einheiten per Knopf auf einen anderen Wochentag verschieben; ein belegter Tag tauscht die beiden Einheiten | [5](#5-eine-einheit-loggen-und-den-fehlklick-zurücknehmen) |
| Rennkalender mit Haupt-/Nebenrennen wirkt bis in die einzelnen Trainingstage; Kalenderansicht auf `/season`; Plan direkt aus dem Kalender bauen | [7](#7-season--rennkalender-und-jahresplanung) |
| Trainingsstruktur nachgeschärft: max. zwei harte Tage, eine Simulation pro Zyklus, Plyometrie und Griffkraft als Finisher, Frequenzberatung nach Level | [3](#3-onboarding--den-plan-erzeugen), [4](#4-today-und-plan--heute-und-die-trainingswoche) |
| 11 Stationsvarianten nach Phase | [18](#18-begriffe) |
| 14 Varianten der vier Kernlaufeinheiten, rotierend, jede zweite Woche auf die Schwachstelle | [4](#4-today-und-plan--heute-und-die-trainingswoche) |
| Laufvolumen selbst steuern: Peak-km pro Zyklus und Läufe pro Woche | [4](#4-today-und-plan--heute-und-die-trainingswoche) |
| Laufarchitektur: HF-Zonen, Paces, polarisierte Fenster, Eröffnungspuffer nach der Station | [4](#4-today-und-plan--heute-und-die-trainingswoche), [18](#18-begriffe) |
| Eigenes Kraftprogramm aus Excel importieren, Sätze protokollieren, Progression als Vorschlag | [9](#9-strength--eigenes-kraftprogramm) |
| Quick-Log-Knöpfe umbenannt: „Felt harder / Felt easier" beschreiben, wie es *war* | [5](#5-eine-einheit-loggen-und-den-fehlklick-zurücknehmen) |
| Doppeltage (AM/PM) | [3](#3-onboarding--den-plan-erzeugen), [4](#4-today-und-plan--heute-und-die-trainingswoche) |
| AI-Zusammenfassungen statt PDFs einspeisbar | [17](#17-betreiber-oberflächen) |
| Jahresperiodisierung mit Makrozyklen, Deloads und Mehrrennen-Logik | [7](#7-season--rennkalender-und-jahresplanung) |
| Wissenspipeline für eigene PDFs (Vorschläge mit Freigabe) | [17](#17-betreiber-oberflächen) |
| Einzelne Tage zurücksetzen — Undo nimmt auch die Kalibrierung zurück | [5](#5-eine-einheit-loggen-und-den-fehlklick-zurücknehmen) |
