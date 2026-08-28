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
12. [`/race` — Renntag: Pacing und Ergebnis](#12-race--renntag-pacing-und-ergebnis)
13. [Verbindungen: Strava, Garmin, Telegram](#13-verbindungen-strava-garmin-telegram)
14. [Automatische Abläufe im Hintergrund](#14-automatische-abläufe-im-hintergrund)
15. [Bezahlung und was frei ist](#15-bezahlung-und-was-frei-ist)
16. [`/demo` — ausprobieren ohne Konto](#16-demo--ausprobieren-ohne-konto)
17. [Betreiber-Oberflächen](#17-betreiber-oberflächen)
18. [Begriffe](#18-begriffe)
19. [Änderungsprotokoll](#19-änderungsprotokoll)

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
| `/` | Startseite, Pitch, Einstieg | ja |
| `/demo` | Kompletter Durchlauf mit Beispieldaten | ja |
| `/onboarding` | Profil anlegen, Plan erzeugen | Login nötig (Magic Link) |
| `/plan` | Die aktuelle Trainingswoche | nein |
| `/season` | Rennkalender und Jahresplanung | nein |
| `/strength` | Eigene Kraftprogramme, Sätze protokollieren | nein |
| `/benchmarks` | Testergebnisse eintragen | nein |
| `/progress` | Verlauf und Auswertungen | nein |
| `/race` | Renntag: Pacing-Blatt, Stationskosten, Rennergebnis | nein |
| `/settings` | Setup & Tools: Wochenform, Laufvolumen, Verbindungen, Verletzung | nein |
| `/de/…` | Deutsche Landingpages (8/12/16 Wochen) | ja |
| `/admin/knowledge` | Betreiber: Wissensquellen einspeisen | Betreiber-Secret |

Alle eingeloggten Seiten teilen sich **eine Kopfzeile**: das Logo führt immer zurück auf `/plan`
(die Wochenansicht), daneben stehen die sechs Bereiche als Tabs, der aktuelle ist markiert. Auch die
Betreiberseite `/admin/knowledge` hat oben links einen Rückweg in die App.

---

## 3. Onboarding — den Plan erzeugen

**Anmeldung** läuft über einen Magic Link: E-Mail eingeben, Link im Postfach klicken. Kein Passwort.

**Auf mehreren Geräten.** Handy und PC können gleichzeitig angemeldet sein — die Sitzung liegt als
Cookie im jeweiligen Browser. Wichtig: **Der Link funktioniert nur in dem Browser, der ihn
angefordert hat.** Am PC anfordern und die Mail am Handy öffnen geht nicht; fordere den Link auf
jedem Gerät neu an. Die Anmeldeseite sagt das auch.

**Hast du schon einen Plan, landest du nach der Anmeldung direkt auf `/plan`.** Das Formular unten
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

## 4. `/plan` — die Trainingswoche

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

### Ruhetage

Die Woche zeigt **alle sieben Tage**, nicht nur die mit Training. Ein Tag ohne Einheit bekommt eine
eigene, ruhige Kachel mit Wochentag und Datum — gestrichelter Rand, nichts zum Antippen, nichts zu
loggen. Vorher endete die Liste bei den Trainingstagen, und man musste rückwärts zählen, um einen
Ruhetag von einer Einheit zu unterscheiden, die man längst geloggt hatte.

Hast du den Tag im [Setup](#8-settings--setup--tools) als festen Ruhetag gesetzt, sagt die Kachel
das („One of your fixed rest days") — sonst steht dort, dass nichts geplant ist.

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
| **Estimated finish** | Die Zielzeit-Prognose als Rennuhr, darunter dein **Ziel und der Abstand dahin**, dann Pace-Zonen und ACWR. Die eine Zahl, für die das ganze System existiert. |
| **Why your plan changed** | Jede automatische Anpassung im Klartext (siehe Abschnitt 6). |
| **Ernährung** | Ein kurzer, phasenabhängiger Hinweis. |
| **Setup & tools** | Ein Link auf die [eigene Setup-Seite](#8-settings--setup--tools). |

**Liegst du auf Kurs?** Unter der Prognose steht deine Zielzeit und was zwischen beiden liegt — und
zwar aufgeteilt: wie viel davon **noch in den Stationen steckt** (mit der teuersten zuerst) und wie
viel **aus den Beinen kommen muss.** Steckst du bereits innerhalb des Ziels, steht dort, wie weit.

Bei einem ambitionierten Ziel kommt eine Zeile dazu: welche Pace die acht Kilometer dann noch
verlangen, *wenn jede Station schon perfekt wäre.* „Sub 50" kommt als 1:47/km zurück — das
beantwortet sich selbst, ohne dass die App jemandem sein Ziel ausreden muss.

Die Zielzeit steuert den Plan **nicht**. Sie ist der Maßstab, nicht die Vorgabe: Ein Wunschziel
würde die Trainingspaces sonst in den Verletzungsbereich schieben.
| **Coach-Feedback** | Erscheint nach dem Loggen als Overlay (siehe Abschnitt 6). |

---

## 5. Eine Einheit loggen (und den Fehlklick zurücknehmen)

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

Verschieben gilt innerhalb der Woche; gesperrte Wochen bieten es nicht an. Im [Demo](#16-demo--ausprobieren-ohne-konto)
funktioniert es genauso, nur ohne Konto.

---

## 6. Wie sich der Plan anpasst

Zwei Schichten, klar getrennt:

**Schicht 1 — nach jeder Einheit (Mikro).** Aus deiner Rückmeldung werden Pace-Zonen, Stations-Tiers
und der Kraftfaktor in kleinen Schritten nachgeführt (±5 s/km, ±5 % Last), gedeckelt auf ±3 % pro
Woche, damit nichts davonläuft.

**Schicht 2 — nachts (Makro).** Ein Hintergrundlauf prüft die Belastungsentwicklung:

| Signal | Reaktion |
|---|---|
| ACWR über 1,3 | Restwoche wird auf 85 % getrimmt |
| ACWR über 1,5 | Automatischer Deload |
| Dauerhaft hohe RPE (14 Tage) | Automatischer Deload |
| ACWR unter 0,8 | Sanfter Wiedereinstieg |
| 7 Tage inaktiv | Plan wird ab heute neu aufgebaut |

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
[Trainingsmischung](#4-plan--die-trainingswoche) sinkt von 45–55 % in der Basis auf 30 % im Peak,
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
geführt. `/plan` zeigt dann keinen Wochenplan mehr, sondern zwei Wege weiter:

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

Darunter sieben Schalter je Zeile für **Long Run**, **Kraft**, **Ruhetage** und — sobald du
Doppeltage eingestellt hast — **Doppeltage**, Montag zuerst. Die Obergrenzen bewegen sich mit:
Ruhetage `7 − Trainingstage`, Doppeltage genau so viele, wie du oben gewählt hast. Nimmst du
Trainingstage oder Doppeltage weg, werden zu viele Pins automatisch gekürzt statt dich am
Speichern-Knopf auflaufen zu lassen. Ohne Doppeltage erscheint die Zeile gar nicht — ein Schalter
mit Obergrenze 0 wäre ein toter Schalter.

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

Gedacht für alle, die ihr Krafttraining bereits in Excel führen.

**Import per Einfügen.** Bereich in Excel markieren, kopieren, ins Feld einfügen — die Zwischenablage
enthält tabulatorgetrennten Text, und genau den liest der Parser. Erkannt werden Wiederholungs-
bereiche („6 - 8"), Supersatz-Markierungen und Körpergewichts-Zeilen ohne Last.

**Vorschau vor dem Speichern.** Du siehst, was der Parser verstanden hat, und kannst korrigieren,
bevor irgendetwas gespeichert wird.

**Wo dein Programm in der Einheit steht.** Es tritt an die Stelle des Hauptblocks aus der
Bibliothek — Warm-up davor, Finisher und Mobility danach, genau wie die Engine die Einheit gebaut
hat. Ein Finisher ist nach dem benannt, wann er stattfindet.

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
ein letzter Test vor dem Rennen.

**Der letzte Test liegt nie in der Rennwoche.** Bei zweiwöchigem Taper (16-Wochen-Plan) sitzt er auf
dessen erster Woche — zwei Wochen vor dem Start. Ist der Taper nur eine Woche lang (12 Wochen und
kürzer), rückt er in die letzte Peak-Woche: ein All-out-Test sieben Tage vor dem Rennen ist eine
Belastung, keine Generalprobe. Fällt er dabei auf die Woche mit der Rennsimulation, geht er noch
eine Woche zurück — zwei Rennleistungen in sieben Tagen sind eine zu viel.

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

**Woraus die Zielzeit-Prognose gerechnet wird.** Aus denselben Zahlen wie das Pacing-Blatt auf
[`/race`](#12-race--renntag-pacing-und-ergebnis): acht Kilometer zu deiner Rennpace, plus was deine
acht Stationen kosten, plus die Roxzone deines Levels. Wo ein Rennen geloggt ist, zählen die
gemessenen Stationszeiten statt der Schätzung aus den Tiers. Prognose und Pacing-Blatt sind damit
zwei Ansichten **einer** Rechnung — die Zielzeit, die auf `/race` vorbelegt ist, verlangt genau die
Pace, aus der sie gebaut wurde.

Die Benchmarks bewegen jeweils das, wovon sie sprechen: der Wall-Ball-Test die Wall-Ball-Station,
der 1-km-Test die Laufannahme (anteilig — ein frisch gelaufener Test ist kein Rennkilometer).
Gegen eine im Rennen gemessene Stationszeit kommt ein Gym-Test nicht an.

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

Die letzten zehn Rennen stehen als Liste über dem Formular, mit Endzeit und Roxzone. Ein
gespeichertes Ergebnis lässt sich in der Oberfläche derzeit **nicht ändern und nicht löschen** — ein
Tippfehler bleibt stehen, bis er in der Datenbank korrigiert wird.

---

## 13. Verbindungen: Strava, Garmin, Telegram

**Strava / Garmin.** Einmal verbinden; danach werden Läufe automatisch der passenden geplanten
Einheit zugeordnet und geloggt. Die tatsächlich gelaufene Pace fließt direkt in die
Pace-Kalibrierung. Neue Aktivitäten kommen per Webhook an — kein Polling, keine manuelle Eingabe.

**Telegram.** Abends kommt ein Check-in mit vier Knöpfen (dieselben wie in der App). Antippen loggt
die Einheit, ohne die App zu öffnen. Ohne Telegram gibt es stattdessen eine E-Mail.

---

## 14. Automatische Abläufe im Hintergrund

| Wann | Was passiert |
|---|---|
| Täglich abends | Check-in an alle mit einer heute noch offenen Einheit (Telegram, sonst E-Mail) |
| Nächtlich | Makro-Guardrails: ACWR-Prüfung, Auto-Deload, Rebase, Reha-Übergänge |
| Sonntagabend | Wochenrückblick: Compliance, Belastung, was nächste Woche ansteht |

Diese Läufe sind mit einem Betreiber-Secret geschützt und lassen sich nicht von außen auslösen.

---

## 15. Bezahlung und was frei ist

**Woche 1 ist dauerhaft kostenlos** — vollständig, mit allen Blöcken, Gewichten und Paces. Ab Woche 2
ist der Plan gesperrt, bis der Rennzyklus freigeschaltet ist (einmalig oder als Abo).

Die Sperre ist keine Anzeigefrage: gesperrte Wochen werden **gar nicht erst an den Browser
ausgeliefert**. Ein Rebase behält eine bestehende Freischaltung — ein bezahlter Rennzyklus bleibt
bezahlt.

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

### `/api/admin/kpis`

Kennzahlen zum Betrieb, mit demselben Secret abrufbar.

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
| **Kompromittiertes Laufen** | Laufen unter Vorermüdung — das Gefühl des echten Rennens. Die Session ist **level- und phasenabhängig**: 60 Vorgaben über fünf Level und vier Phasen, siehe [Abschnitt 4](#4-plan--die-trainingswoche). |
| **Polarisiert** | 75–85 % der Laufdistanz locker, der Rest wirklich hart. Gemessen an der **Distanz je Zone**, nicht an der Zahl der Einheiten. |
| **Tier** | Leistungsstufe 1–3 pro Station; steuert Gewichte und Vorgaben. Ein geloggtes Rennen setzt sie neu, siehe [Abschnitt 12](#12-race--renntag-pacing-und-ergebnis). |
| **Roxzone** | Der Weg zwischen Laufende und Station. Achtmal im Rennen, und in Summe eine der größten stillen Zeitreserven — im Pacing-Blatt eigene Zeilen. |
| **Rebase** | Neuberechnung des Plans ab heute statt nachträglicher Änderung. |
| **Variante** | Eine konkrete Ausprägung einer Kerneinheit (14 Lauf-, 5 Kraftformen). Kompromittiertes Laufen, Stationsarbeit und Intervalle kommen aus eigenen Katalogen nach Level und Phase (60 / 60 / 86 Sessions). |

---

## 19. Änderungsprotokoll

Neueste zuerst. Jede Zeile nennt die Funktion und den Abschnitt, in dem sie beschrieben ist.

| Änderung | Abschnitt |
|---|---|
| **Fehler behoben:** Von Hand verschobene Einheiten gingen beim nächsten Neuaufbau verloren — sie wurden unter der falschen Kalenderwoche abgelegt (Erstellungsdatum statt Startdatum des Plans) und passten danach auf keine Woche | [5](#5-eine-einheit-loggen-und-den-fehlklick-zurücknehmen) |
| Ruhetage bekommen eine eigene Kachel: die Woche zeigt alle sieben Tage, feste Ruhetage sind als solche benannt. Die Woche liest sich jetzt auch nach einem Verschieben von Montag bis Sonntag | [4](#4-plan--die-trainingswoche) |
| **Fehler behoben:** Bei importiertem Kraftprogramm stand der Finisher direkt nach dem Warm-up und die eigentliche Arbeit ganz unten — das eigene Programm wurde ans Ende gehängt statt an die Stelle des Bibliotheksblocks | [9](#9-strength--eigenes-kraftprogramm) |
| Wochentag und **Datum** auf jeder Einheitenkarte; die HF-Zone der Karte folgt jetzt ebenfalls der Zone der Session statt der des Session-Typs | [4](#4-plan--die-trainingswoche) |
| **Fehler behoben:** Schwellen- und Renntempo-Intervalle zeigten die Intervall-Pace (bei 19:00-5k-Niveau 29 s/km zu schnell) und kalibrierten beim Loggen die falsche Zone. Jede der 86 Sessions nennt jetzt ihre eigene Zone; gemischte Einheiten zeigen bewusst keine | [4](#4-plan--die-trainingswoche) |
| Stationen tauschen, wenn das Gerät nicht frei ist: 2–3 Alternativen je Station, jede mit „Behält" und „Kostet". Gilt pro Station, bleibt bis zum Zurücktauschen, ändert den Plan nicht | [5](#5-eine-einheit-loggen-und-den-fehlklick-zurücknehmen) |
| Das Pacing-Blatt teilt die acht Läufe entlang einer Ermüdungskurve auf (Lauf 1 schneller als Lauf 8) statt achtmal derselben Pace. Verteilt nur um — die Prognose ändert sich dadurch nicht | [12](#12-race--renntag-pacing-und-ergebnis) |
| Zielzeit als eigene Zahl, getrennt vom Level (Level = was du tragen kannst, Ziel = was du anstrebst). Auf `/plan` steht der Abstand zum Ziel, aufgeteilt in Stationen und Beine; das Pacing-Blatt öffnet auf dem Ziel statt auf der Prognose. Nur die Zielzeit zu ändern baut keine Woche neu | [4](#4-plan--die-trainingswoche), [8](#8-settings--setup--tools), [12](#12-race--renntag-pacing-und-ergebnis) |
| Zielzeit-Prognose läuft auf demselben Rennmodell wie das Pacing-Blatt (Stationen und Roxzone statt einer Divisionskonstante, gemessene Rennsplits wo vorhanden). Die Prognosen werden dadurch realistischer und rund zehn Minuten langsamer; die Pro-Referenzzeiten waren zu optimistisch und kosten jetzt die Minuten, die die schwereren Lasten wirklich kosten | [11](#11-progress--auswertungen), [12](#12-race--renntag-pacing-und-ergebnis) |
| Neue Seite `/race`: Pacing-Blatt aus der Zielzeit (17 Abschnitte, Stationen zuerst abgezogen), Stationskosten in Sekunden statt Tiers, und ein Rennergebnis mit Laufsplits und Stationszeiten, das die Tiers neu kalibriert | [12](#12-race--renntag-pacing-und-ergebnis) |
| Ohne Rennen läuft der Übergangsblock offen (20 Wochen, Verlängerung ab Off-Season statt neuem Reset) und wird nicht mehr als Rennzyklus angezeigt | [6](#6-wie-sich-der-plan-anpasst) |
| Nach dem Renntag: Plan wird abgeschlossen statt weiter angepasst; Übergangsblock in vier Modulen (Reset → Re-Introduction → Volume Reload → Off-Season), Länge aus dem Abstand zum nächsten Rennen | [6](#6-wie-sich-der-plan-anpasst) |
| Laufvolumen gipfelt jetzt in der Basis und fällt bis zum Rennen (100/90/80/40 % statt 85/100/90/50 %) | [6](#6-wie-sich-der-plan-anpasst) |
| Level (Zielzeit) und Division nachträglich änderbar; der Plan wird neu gebaut, Pace-Zonen und Tiers bleiben erhalten | [8](#8-settings--setup--tools) |
| Startdatum des Plans wählbar (Onboarding und Setup, mit Frage nach Neuaufbau); die laufende Woche wird aus dem Startdatum abgeleitet statt aus einem Status, der nie weitergeschaltet wurde | [3](#3-onboarding--den-plan-erzeugen), [8](#8-settings--setup--tools) |
| Doppeltage lassen sich auf feste Wochentage pinnen (Setup → Form deiner Woche), mit Hinweis auf ihre Kosten | [8](#8-settings--setup--tools) |
| Der letzte Benchmark-Test liegt nie in der Rennwoche: bei kurzem Taper rückt er in die letzte Peak-Woche | [10](#10-benchmarks--tests-eintragen) |
| Trainingsmischung nach Level und Phase als Vorgabe (Anteile statt fester Reihenfolge); kompromittiertes Laufen ab der Basis; Deload alle 3–4 Wochen in allen Phasen; Taper senkt auch Kraft und Stationen; Interferenzregel in beide Richtungen; AM/PM-Abstand auf der Karte; Ergometer-Entlastung als echte Einheit | [4](#4-plan--die-trainingswoche), [6](#6-wie-sich-der-plan-anpasst) |
| Abmelden auf `/settings` („Dieses Gerät"); nach der Anmeldung mit bestehendem Plan geht es direkt auf `/plan` statt ins Onboarding-Formular | [3](#3-onboarding--den-plan-erzeugen), [8](#8-settings--setup--tools) |
| Schwellen- und VO₂max-Intervalle: 86 level- und phasenspezifische Sessions, bewusst ohne Stationsvorbelastung | [4](#4-plan--die-trainingswoche) |
| Stationsarbeit: 60 level- und phasenspezifische Sessions ohne einen einzigen Laufmeter; Rotation nutzt jetzt alle drei Sessions einer Phase | [4](#4-plan--die-trainingswoche) |
| Kompromittierte Läufe werden wieder gespeichert (sie brauchen den neuen Bibliothek-Seed aus `setup.sql`) | [4](#4-plan--die-trainingswoche) |
| Fehler beim Planaufbau zeigen den echten Grund statt „Unexpected end of JSON input" | [8](#8-settings--setup--tools) |
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
| 11 Stationsvarianten nach Phase | [18](#18-begriffe) |
| 14 Varianten der vier Kernlaufeinheiten, rotierend, jede zweite Woche auf die Schwachstelle | [4](#4-plan--die-trainingswoche) |
| Laufvolumen selbst steuern: Peak-km pro Zyklus und Läufe pro Woche | [4](#4-plan--die-trainingswoche) |
| Laufarchitektur: HF-Zonen, Paces, polarisierte Fenster, Eröffnungspuffer nach der Station | [4](#4-plan--die-trainingswoche), [18](#18-begriffe) |
| Eigenes Kraftprogramm aus Excel importieren, Sätze protokollieren, Progression als Vorschlag | [9](#9-strength--eigenes-kraftprogramm) |
| Quick-Log-Knöpfe umbenannt: „Felt harder / Felt easier" beschreiben, wie es *war* | [5](#5-eine-einheit-loggen-und-den-fehlklick-zurücknehmen) |
| Doppeltage (AM/PM) | [3](#3-onboarding--den-plan-erzeugen), [4](#4-plan--die-trainingswoche) |
| AI-Zusammenfassungen statt PDFs einspeisbar | [17](#17-betreiber-oberflächen) |
| Jahresperiodisierung mit Makrozyklen, Deloads und Mehrrennen-Logik | [7](#7-season--rennkalender-und-jahresplanung) |
| Wissenspipeline für eigene PDFs (Vorschläge mit Freigabe) | [17](#17-betreiber-oberflächen) |
| Einzelne Tage zurücksetzen — Undo nimmt auch die Kalibrierung zurück | [5](#5-eine-einheit-loggen-und-den-fehlklick-zurücknehmen) |
