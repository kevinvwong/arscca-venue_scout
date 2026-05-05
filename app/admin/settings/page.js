"use client";

const API_BASE_URL =
  "https://arscca-venue-scout-kevinvwongs-projects.vercel.app/api/v1/approved-venues";

function SectionHeading({ children }) {
  return (
    <p className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle mb-3">
      {children}
    </p>
  );
}

function CodeBlock({ children }) {
  return (
    <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-sm overflow-x-auto whitespace-pre-wrap">
      {children}
    </pre>
  );
}

export default function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Settings</h1>
        <p className="text-sm text-ink-muted">
          API integration and external system configuration.
        </p>
      </div>

      {/* API Integration */}
      <section className="border border-gray-200 rounded-xl bg-white p-6 shadow-sm space-y-5">
        <SectionHeading>API Integration</SectionHeading>
        <p className="text-sm text-gray-700">
          Use this API to pull approved venues into external systems like arscca-VMS.
          Only venues with status <span className="font-mono text-xs bg-gray-100 rounded px-1">approved</span> are
          returned. Authentication uses a shared API key passed as a request header.
        </p>

        <div>
          <p className="label mb-1.5">API Endpoint</p>
          <CodeBlock>{API_BASE_URL}</CodeBlock>
        </div>

        <div>
          <p className="label mb-1.5">Authentication</p>
          <p className="text-sm text-ink-muted mb-2">
            Set <span className="font-mono text-xs bg-gray-100 rounded px-1">VENUESCOUT_API_KEY</span> in
            your Vercel project environment variables. The key is passed as a request header.
          </p>
          <CodeBlock>{`GET /api/v1/approved-venues
Header: x-api-key: YOUR_API_KEY
Optional: ?state=GA`}</CodeBlock>
        </div>

        <div>
          <p className="label mb-1.5">Example curl command</p>
          <CodeBlock>{`curl -H "x-api-key: YOUR_API_KEY" \\
  "${API_BASE_URL}?state=GA"`}</CodeBlock>
        </div>

        <div>
          <p className="label mb-1.5">Response shape</p>
          <CodeBlock>{`{
  "venues": [ { "id": 1, "name": "...", "composite_score": 82, ... } ],
  "count": 3,
  "generatedAt": "2026-05-05T12:00:00.000Z"
}`}</CodeBlock>
        </div>
      </section>

      {/* arscca-VMS Setup */}
      <section className="border border-gray-200 rounded-xl bg-white p-6 shadow-sm space-y-5">
        <SectionHeading>arscca-VMS Setup</SectionHeading>
        <p className="text-sm text-gray-700">
          Follow these steps to connect arscca-VMS to VenueScout so the event creation
          form can offer a "Select from approved venues" dropdown.
        </p>
        <ol className="space-y-4 text-sm text-gray-700 list-none">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center">
              1
            </span>
            <span>
              In the arscca-VMS Vercel project, add environment variable:
              <CodeBlock>{`VENUESCOUT_API_URL=${API_BASE_URL}`}</CodeBlock>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center">
              2
            </span>
            <span>
              Add environment variable:
              <CodeBlock>{`VENUESCOUT_API_KEY=your-shared-secret`}</CodeBlock>
              Use the same value set for <span className="font-mono text-xs bg-gray-100 rounded px-1">VENUESCOUT_API_KEY</span>{" "}
              in this VenueScout project.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center">
              3
            </span>
            <span>
              The event creation form in arscca-VMS will show a "Select from approved venues"
              dropdown, pre-populated with venues returned by this API.
            </span>
          </li>
        </ol>
      </section>

      {/* Export Formats */}
      <section className="border border-gray-200 rounded-xl bg-white p-6 shadow-sm space-y-4">
        <SectionHeading>Export Formats</SectionHeading>
        <p className="text-sm text-gray-700">
          Download a full snapshot of the approved venue library for offline use or import into
          other tools.
        </p>
        <div>
          <a
            href="/api/admin/library?export=1"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline text-sm inline-flex items-center gap-1.5"
          >
            Export all approved venues (JSON) ↗
          </a>
          <p className="text-xs text-ink-subtle mt-1.5">
            Admin access required. Opens the raw JSON export in a new tab.
          </p>
        </div>
      </section>
    </div>
  );
}
