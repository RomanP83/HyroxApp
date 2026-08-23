import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { splitPhases } from "@/lib/engine";

// Phase D1 (§7): exact-match SEO pages for the unoccupied DACH keyword
// "Hyrox Trainingsplan N Wochen". Content is generated from the REAL engine
// (splitPhases), so the pages stay truthful to the product — no duplicated
// hand-written plan tables that drift.

const WEEKS_BY_SLUG: Record<string, number> = {
  "hyrox-trainingsplan-8-wochen": 8,
  "hyrox-trainingsplan-12-wochen": 12,
  "hyrox-trainingsplan-16-wochen": 16,
};

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(WEEKS_BY_SLUG).map((slug) => ({ slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const weeks = WEEKS_BY_SLUG[params.slug];
  if (!weeks) return {};
  return {
    title: `Hyrox Trainingsplan ${weeks} Wochen — mit Phasenstruktur & Adaption`,
    description: `So ist ein ${weeks}-Wochen-Hyrox-Trainingsplan richtig aufgebaut: Base, Build, Peak und Taper mit Deloads — und warum ein Plan sich nach jedem Training anpassen sollte.`,
    alternates: { canonical: `/de/${params.slug}` },
  };
}

const PHASE_LABEL: Record<string, string> = {
  base: "Base — aerobe Grundlage & Stationstechnik",
  build: "Build — Compromised Running & schwerere Stationslast",
  peak: "Peak — Simulationen & Race-Pace",
  taper: "Taper — Volumen runter, frisch ankommen",
};

const FAQ = (weeks: number) => [
  {
    q: `Reichen ${weeks} Wochen Vorbereitung für Hyrox?`,
    a:
      weeks >= 12
        ? `Ja — ${weeks} Wochen sind ein voller Zyklus mit ausreichend Base- und Build-Zeit. Entscheidend ist die Phasenstruktur mit fest eingeplanten Deloads, nicht das reine Volumen.`
        : `Ja, wenn der Plan die Phasen richtig setzt: bei ${weeks} Wochen wird die Base kürzer, Peak und Taper bleiben unangetastet — der Taper ist nie verhandelbar.`,
  },
  {
    q: "Was ist Compromised Running?",
    a: "Laufen auf vorermüdeten Beinen — der Wechsel zwischen 1.000-m-Läufen und Stationen ist der Kern von Hyrox. Ein ernstzunehmender Plan trainiert das als eigenen Session-Typ mit steigender Frequenz von Base zu Peak.",
  },
  {
    q: "Was passiert, wenn ich eine Einheit verpasse?",
    a: "Nichts Dramatisches — ein guter Plan kennt keinen Nachhol-Stau. Bei uns entfällt die niedrigst-priorisierte Einheit, die Last wird überwacht (ACWR), und nach längerer Pause wird der Plan ab heute neu aufgebaut.",
  },
  {
    q: "Brauche ich eine Smartwatch?",
    a: "Nein. Die Anpassung läuft über dein Feedback nach jeder Einheit (ein Tap oder RPE) — Adaption wie bei running.COACH, aber ohne Wearable-Pflicht.",
  },
];

export default function SeoPage({ params }: { params: { slug: string } }) {
  const weeks = WEEKS_BY_SLUG[params.slug];
  if (!weeks) notFound();

  const split = splitPhases(weeks);
  const faq = FAQ(weeks);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <main className="space-y-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="flex items-center justify-between">
        <Link href="/de" className="text-sm text-ash hover:text-chalk">
          ← Übersicht
        </Link>
        <Link href="/onboarding" className="btn-primary">
          Meinen Plan erstellen
        </Link>
      </header>

      <section className="space-y-4">
        <h1 className="max-w-3xl text-3xl font-extrabold leading-tight sm:text-4xl">
          Hyrox Trainingsplan {weeks} Wochen: so ist er richtig aufgebaut
        </h1>
        <p className="max-w-2xl text-lg text-ash">
          {weeks} Wochen bis zum Rennen sind kein Grund für einen Random-WOD-Feed. Ein Plan, der
          trägt, hat eine sichtbare Phasenstruktur, konkrete Lasten je Division — und passt sich
          an, wenn dein Leben dazwischenkommt.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Die Phasen bei {weeks} Wochen Vorlauf</h2>
        <p className="max-w-2xl text-ash">
          So teilt unsere Engine {weeks} Wochen auf — rückwärts vom Renntag geplant, mit Deload
          in jeder 4. Base-/Build-Woche und Benchmarks in Woche 1, am Build-Ende und zum
          Taper-Start:
        </p>
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-edge text-ash">
                <th className="py-2 pr-4">Phase</th>
                <th className="py-2 pr-4">Wochen</th>
                <th className="py-2">Fokus</th>
              </tr>
            </thead>
            <tbody>
              {split.map((p) => (
                <tr key={p.phase_type} className="border-b border-edge/50 last:border-0">
                  <td className="py-2 pr-4 font-semibold capitalize">{p.phase_type}</td>
                  <td className="py-2 pr-4">{p.weeks}</td>
                  <td className="py-2 text-ash">{PHASE_LABEL[p.phase_type]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-ash">
          Der Taper ist nie verhandelbar — auch bei kurzen Zyklen bleibt die letzte Woche zum
          Frischwerden reserviert.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-bold">Warum ein statischer PDF-Plan nicht reicht</h2>
        <p className="max-w-2xl text-ash">
          Jeder Plan kollidiert irgendwann mit der Realität: eine verpasste Woche, ein Infekt,
          eine Einheit, die viel härter war als gedacht. Ein statisches PDF kann darauf nicht
          reagieren — unsere Engine rekalibriert nach jeder gelogten Einheit Stations-Tiers,
          Laufpaces und deine Zielzeit-Prognose, mit einer verständlichen Begründung für jede
          Änderung. Genau das unterscheidet einen Trainingsplan von einer Workout-Sammlung.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Häufige Fragen</h2>
        <div className="space-y-3">
          {faq.map((f) => (
            <div key={f.q} className="card">
              <h3 className="mb-1 font-semibold">{f.q}</h3>
              <p className="text-sm text-ash">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Dein {weeks}-Wochen-Plan, auf dich zugeschnitten</h2>
          <p className="text-sm text-ash">
            Renndatum, Division, 5-km-Zeit, Trainingstage — daraus entsteht dein Plan. Woche 1
            ist gratis einsehbar.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/demo" className="btn-ghost">
            Erst die Demo ansehen
          </Link>
          <Link href="/onboarding" className="btn-primary">
            Plan erstellen →
          </Link>
        </div>
      </section>
    </main>
  );
}
