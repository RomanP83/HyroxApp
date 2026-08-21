import Link from "next/link";

const painQuotes = [
  "“Week 3 brutal, week 4 trivial — no red thread.”",
  "“Same workouts for everyone, whatever your race date.”",
  "“Miss one session and the whole plan falls apart.”",
  "“No weights, no reps — just a vague list.”",
];

const phases = [
  { name: "Base", color: "#3ecf8e", desc: "Aerobic foundation & station technique" },
  { name: "Build", color: "#ffb020", desc: "Compromised running, heavier stations" },
  { name: "Peak", color: "#ff5a1f", desc: "Full simulations, race-pace sharpening" },
  { name: "Taper", color: "#6ea8fe", desc: "Cut volume, arrive fresh" },
];

export default function Home() {
  return (
    <main className="space-y-16">
      <header className="flex items-center justify-between">
        <span className="text-lg font-bold tracking-tight">
          Hyrox<span className="text-accent">·</span>Hub
        </span>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/de" className="text-muted hover:text-ink">
            🇩🇪 Deutsch
          </Link>
          <Link href="/demo" className="text-muted hover:text-ink">
            Live demo
          </Link>
          <Link href="/onboarding" className="btn-primary">
            Build my plan
          </Link>
        </nav>
      </header>

      {/* Hero — PP1 */}
      <section className="space-y-6 pt-8 text-center">
        <span className="pill mx-auto">Your plan to race day · not a random WOD feed</span>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">
          A 12-week Hyrox plan built backward from <em className="text-accent not-italic">your</em>{" "}
          race — that adapts after every session.
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted">
          Visible phases, explicit weights and paces per division, and an engine that recalibrates
          every time you log a session. running.COACH-style adaptation for Hyrox — no wearable
          required.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/demo" className="btn-primary">
            See a real plan generate →
          </Link>
          <Link href="/onboarding" className="btn-ghost">
            Start onboarding
          </Link>
        </div>
      </section>

      {/* Pain points — the audience's own words */}
      <section className="grid gap-3 sm:grid-cols-2">
        {painQuotes.map((q) => (
          <div key={q} className="card text-muted">
            {q}
          </div>
        ))}
      </section>

      {/* Phase structure — PP1 make periodisation visible */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Progression you can actually see</h2>
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

      {/* Differentiators mapped to pain points */}
      <section className="grid gap-4 sm:grid-cols-3">
        <Feature title="Adapts after every session" body="Log one tap. Tiers, paces and your finish-time estimate recalibrate — with a one-line reason, never a black box." />
        <Feature title="Explicit loads, per division" body="Every set carries weights, distances and reps for Open and Pro. The missing numbers were the literal cancellation reason elsewhere." />
        <Feature title="Missed a session? Fine." body="No make-up pile-up. Guardrails watch your load (ACWR), auto-deload when you're cooked, and rebase after a break." />
      </section>

      <footer className="border-t border-line pt-6 text-sm text-muted">
        One-time price per race cycle. Built solo, in public. ·{" "}
        <Link href="/demo" className="text-accent hover:underline">
          Try the engine
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
