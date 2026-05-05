export default function HomePage() {
  return (
    <div className="mx-auto max-w-prose px-6 py-20 text-center">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">
        Find the right lot.<br />Skip the cold calls.
      </h1>
      <p className="text-lg text-ink-muted mb-8 leading-relaxed">
        VenueScout helps event organizers find large paved lots, score them
        automatically using satellite imagery, identify the owner, and send
        a personalized inquiry — all in one place.
      </p>
      <div className="flex items-center justify-center gap-4">
        <a href="/admin" className="btn-primary px-6 py-2.5 text-base">
          Go to dashboard
        </a>
        <a href="/auth/signin" className="btn-outline px-6 py-2.5 text-base">
          Sign in
        </a>
      </div>
      <div className="mt-16 grid grid-cols-3 gap-6 text-left">
        {[
          { label: "Search", desc: "Enter a city or radius. Surface large lots, fairgrounds, and stadiums from mapping data." },
          { label: "Score", desc: "AI analyzes satellite imagery to estimate usable area, surface type, and obstacle density." },
          { label: "Reach out", desc: "Identify the owner, draft a personalized inquiry with AI, and track every response." },
        ].map(({ label, desc }) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-[10px] uppercase tracking-widest font-semibold text-brand-600 mb-2">{label}</div>
            <p className="text-sm text-ink-muted leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
