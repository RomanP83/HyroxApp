import type { Metadata } from "next";
import Link from "next/link";

// Phase D1 (§7): the DACH SEO channel. Users search "Hyrox Trainingsplan",
// not "Periodisierung" — the copy mirrors the English landing but speaks the
// audience's language, literally.
export const metadata: Metadata = {
  title: "Hyrox Trainingsplan bis zu deinem Rennen — passt sich nach jedem Training an",
  description:
    "Dein Hyrox Trainingsplan, rückwärts von deinem Renndatum geplant: sichtbare Phasen, konkrete Gewichte je Division und eine Engine, die sich nach jeder Einheit anpasst. Kein Random-WOD-Feed.",
  alternates: {
    canonical: "/de",
    languages: { en: "/", de: "/de" },
  },
};

const painQuotes = [
  `„Woche 3 brutal, Woche 4 trivial — kein roter Faden.“`,
  `„Dieselben Workouts für alle, egal wann dein Rennen ist.“`,
  `„Eine Einheit verpasst und der ganze Plan kippt.“`,
  `„Keine Gewichte, keine Reps — nur eine vage Liste.“`,
];

const phases = [
  { name: "Base", color: "#3ecf8e", desc: "Aerobe Grundlage & Stationstechnik" },
  { name: "Build", color: "#ffb020", desc: "Compromised Running, schwerere Stationen" },
  { name: "Peak", color: "#ff5a1f", desc: "Volle Simulationen, Race-Pace-Schliff" },
  { name: "Taper", color: "#6ea8fe", desc: "Volumen runter, frisch ankommen" },
];

const seoPages = [
  { slug: "hyrox-trainingsplan-8-wochen", label: "8-Wochen-Plan" },
  { slug: "hyrox-trainingsplan-12-wochen", label: "12-Wochen-Plan" },
  { slug: "hyrox-trainingsplan-16-wochen", label: "16-Wochen-Plan" },
];

export default function GermanHome() {
  return (
    <main className="space-y-16">
      <header className="flex items-center justify-between">
        <span className="text-lg font-bold tracking-tight">
          Hyrox<span className="text-accent">·</span>Hub
        </span>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/" className="text-muted hover:text-ink">
            🇬🇧 English
          </Link>
          <Link href="/demo" className="text-muted hover:text-ink">
            Live-Demo
          </Link>
          <Link href="/onboarding" className="btn-primary">
            Plan erstellen
          </Link>
        </nav>
      </header>

      <section className="space-y-6 pt-8 text-center">
        <span className="pill mx-auto">Dein Plan bis zum Renntag · kein Random-WOD-Feed</span>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">
          Ein Hyrox Trainingsplan, rückwärts von <em className="text-accent not-italic">deinem</em>{" "}
          Rennen geplant — der sich nach jedem Training anpasst.
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted">
          Sichtbare Phasen, konkrete Gewichte und Paces je Division, und eine Engine, die nach
          jeder gelogten Einheit rekalibriert. Adaption wie bei running.COACH — für Hyrox, ohne
          Wearable-Pflicht.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/demo" className="btn-primary">
            Sieh zu, wie ein echter Plan entsteht →
          </Link>
          <Link href="/onboarding" className="btn-ghost">
            Onboarding starten
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {painQuotes.map((q) => (
          <div key={q} className="card text-muted">
            {q}
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Progression, die du wirklich siehst</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          {phases.map((p) => (
            <div key={p.name} className="card">
              <div className="mb-2 h-1.5 w-full rounded-full" style={{ background: p.color }} />
              <div className="font-semibold">{p.name}</div>
              <div className="text-sm text-muted">{p.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Feature
          title="Passt sich nach jeder Einheit an"
          body="Ein Tap loggt die Session. Tiers, Paces und deine Zielzeit-Prognose rekalibrieren — mit einer Ein-Satz-Begründung, nie als Blackbox."
        />
        <Feature
          title="Konkrete Lasten, je Division"
          body="Jeder Satz mit Gewichten, Distanzen und Reps für Open und Pro. Fehlende Zahlen waren anderswo wörtlich der Kündigungsgrund."
        />
        <Feature
          title="Einheit verpasst? Kein Drama."
          body="Kein Nachhol-Stau. Guardrails überwachen deine Last (ACWR), legen automatisch Deloads ein und rebasen nach einer Pause."
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-bold">Wie viele Wochen bis zu deinem Rennen?</h2>
        <div className="flex flex-wrap gap-3">
          {seoPages.map((p) => (
            <Link key={p.slug} href={`/de/${p.slug}`} className="btn-ghost">
              {p.label} →
            </Link>
          ))}
        </div>
      </section>

      <footer className="border-t border-line pt-6 text-sm text-muted">
        Einmalpreis pro Race-Cycle. Solo gebaut, in public. ·{" "}
        <Link href="/demo" className="text-accent hover:underline">
          Engine ausprobieren
        </Link>
      </footer>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="card">
      <h3 className="mb-1 font-semibold">{title}</h3>
      <p className="text-sm text-muted">{body}</p>
    </div>
  );
}
