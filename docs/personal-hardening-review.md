# Persönlicher Betrieb: Umsetzung und Prüfstand

Stand: 4. September 2026. Basis: `66f3ab1df71b878e3e361f9a706ac7907e1f6d48`.

## Umgesetzt

1. Kalenderbasierter Wochenfortschritt mit konfigurierbarer Trainingszeitzone. Nach Zyklusende
   sind alle Wochen abgeschlossen; Check-ins und Makro-Anpassungen bearbeiten sie nicht erneut.
2. Atomare, idempotente Makro-Skalierung je Plan/Woche/Direktive. Ein Rebase-Wrapper serialisiert
   wiederholte Neuaufbauten desselben Quellplans und speichert den Audit-Eintrag gemeinsam.
3. ACWR bleibt während der ersten 28 Beobachtungstage neutral. Der Makro-Cron berechnet die
   Lastfenster auch ohne neuen Log vor jeder Entscheidung neu.
4. Next.js 15.5.25; PostCSS im Lockfile 8.5.28, einschließlich der zuvor veralteten Next-Unterabhängigkeit.
   Vitest 3.2.7. Cookies und Routenparameter sind auf die asynchronen Next-15-APIs umgestellt.
5. Garmin-Webhook mit verpflichtendem Shared Secret, Payload-Prüfung und maximal 20 Aktivitäten.
   Fehler bei Datenbankverarbeitung werden nicht still bestätigt. Laufzuordnung ist auf den
   passenden Tag-/AM-PM-Slot der aktuellen Woche begrenzt.
6. Session-Log, Kraftsätze und Sessionstatus werden gemeinsam in einer Datenbanktransaktion
   geschrieben. Doppelte Logs sind No-ops. Web, Telegram und Wearables verwenden dieselbe RPC.
7. Startadresse führt zum Plan; Paywall, Kauf-/Abo-Oberfläche und Stripe-Endpunkte sind entfernt.
   Reha-Aktivierung und Wiederaufbau verlangen Bestätigung. Authentifizierung und RLS bleiben.

## Prüfergebnisse

- TypeScript-Prüfung (`tsc --noEmit`): bestanden.
- `git diff --check`: bestanden.
- 17 direkte Regression-Assertions gegen die tatsächlichen TypeScript-Module: bestanden
  (ACWR, Zeitzone, Wochenwechsel, Zyklusende, Garmin-Authentifizierung).
- Isolierte PostgreSQL-Tests mit PGlite gegen Migrationen 0027/0028: bestanden. Geprüft wurden
  doppelte Makro-Skalierung, Rollback bei ungültigen Kraftsätzen, Eigentümerprüfung, doppelte
  Session-Logs und fehlende RPC-Ausführungsrechte für anonyme Zugriffe. Der Rebase-Wrapper wurde
  mit einem Stub der bestehenden `persist_plan`-Funktion auf Wiederholbarkeit geprüft.
- Exportierter Patch wurde mit `git apply --check` auf einem sauberen Checkout des Basiscommits geprüft.
- Vollständige Vitest-Suite, ESLint, Next-Build und Playwright: lokal blockiert. Windows verweigert
  die Pfadauflösung über `C:\Users\roman` mit `EPERM`, bevor diese Prüfungen die App ausführen.
- Abschließender npm-Audit: nicht nachgewiesen; der Audit-Dienst lieferte 503 bzw. Timeouts.
  Eine Aussage „keine verbleibenden Sicherheitslücken“ wird daher nicht getroffen.

Die gezielten Prüfungen ersetzen keinen erfolgreichen vollständigen CI-/Browserlauf.
Es erfolgte kein Test gegen eine produktive Supabase-Datenbank oder eine echte Garmin-Push-Konfiguration.
Kalibrierung und Feedback nach dem Log bleiben separate Verarbeitungsschritte; sie sind nicht
Teil der atomaren Log-/Status-Transaktion. Öffentliche Demo-/Informationsseiten bleiben vorhanden.

## Vor dem Einsatz

1. Vollständige CI mit unterstütztem Node ausführen: `npm ci`, Typecheck, Tests, Lint, Build und E2E.
2. Datenbank sichern. Migrationen `0027_macro_idempotency.sql` und
   `0028_transactional_session_logging.sql` vor dem App-Deployment anwenden. Kein Reset der Live-Datenbank.
3. `APP_TIME_ZONE` setzen (Standard `Europe/Berlin`). Bei Garmin ein langes zufälliges
   `GARMIN_WEBHOOK_SECRET` konfigurieren und die registrierte Push-URL entsprechend anpassen.
   Die Shared-Secret-Prüfung ist keine Garmin-Payload-Signaturprüfung.
4. Nicht mehr benötigte `STRIPE_*`- und `PERSONAL_MODE`-Variablen entfernen.
5. Für tatsächlichen Single-User-Betrieb nach Anlage des eigenen Kontos neue Registrierungen in
   Supabase deaktivieren. Diese externe Einstellung wurde nicht verändert.

Die neuen SQL-Funktionen sind ebenfalls in `supabase/setup.sql` enthalten. Die aktuelle Bedienung
und Update-Reihenfolge stehen in `anleitung.md` und `personal-setup.md`.
