const STEPS = [
  {
    n: "01",
    label: "Search",
    desc: "Enter a city and radius. Google Maps surfaces parking lots, fairgrounds, and stadiums nearby.",
  },
  {
    n: "02",
    label: "Score",
    desc: "Claude analyzes a satellite image of each lot: estimated acres, surface type, obstacles, and a 0–100 suitability score. No site visit needed.",
  },
  {
    n: "03",
    label: "Identify the owner",
    desc: "Auto-fill from Google Places. Link to the county assessor's parcel search for any US state.",
  },
  {
    n: "04",
    label: "Draft and send",
    desc: "Claude writes a personalized inquiry email. Edit it, send it, and the response is tracked automatically.",
  },
  {
    n: "05",
    label: "Pipeline",
    desc: "Track every venue from candidate to approved. Follow-up alerts fire when a contacted venue goes quiet for 7 days.",
  },
];

const STATS = [
  "8 pipeline statuses",
  "AI scoring in seconds",
  "Works in all 50 states",
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-prose px-6 py-20 text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Find the right lot.<br />Skip the cold calls.
        </h1>
        <p className="text-lg text-ink-muted mb-3 leading-relaxed">
          VenueScout helps event organizers find large paved lots, score them
          automatically using satellite imagery, identify the owner, and send
          a personalized inquiry — all in one place.
        </p>
        <p className="text-sm text-ink-subtle mb-8">
          Built for TRSS and autocross organizers. Find parking lots, score them
          with satellite AI, reach out to the owner — all tracked in one place.
        </p>
        <div className="flex items-center justify-center gap-4">
          <a href="/admin" className="btn btn-primary px-6 py-2.5 text-base">
            Go to dashboard
          </a>
          <a href="/auth/signin" className="btn btn-outline px-6 py-2.5 text-base">
            Sign in
          </a>
        </div>
      </section>

      {/* Stats bar */}
      <div className="border-y border-gray-200 bg-white">
        <div className="mx-auto max-w-admin px-6 py-4 flex items-center justify-center gap-0 divide-x divide-gray-200">
          {STATS.map((stat) => (
            <span key={stat} className="px-8 text-sm font-medium text-ink-muted tabular-nums">
              {stat}
            </span>
          ))}
        </div>
      </div>

      {/* How it works */}
      <section className="mx-auto max-w-prose px-6 py-16">
        <div className="text-[10px] uppercase tracking-widest font-semibold text-brand-600 mb-6 text-center">
          How it works
        </div>
        <ol className="space-y-6">
          {STEPS.map(({ n, label, desc }) => (
            <li key={n} className="flex gap-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <span className="shrink-0 text-2xl font-bold tabular-nums text-brand-200 leading-none pt-0.5">
                {n}
              </span>
              <div>
                <div className="text-sm font-semibold text-gray-900 mb-1">{label}</div>
                <p className="text-sm text-ink-muted leading-relaxed">{desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-admin px-6 py-5 text-center text-xs text-ink-subtle">
          VenueScout &middot; Built for Tire Rack Street Survival organizers &middot; {new Date().getFullYear()}
        </div>
      </footer>
    </>
  );
}
