"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

// ─── Constants ────────────────────────────────────────────────────────────────

const NOTE_TYPES = [
  { value: "general",       label: "General" },
  { value: "site_visit",    label: "Site Visit" },
  { value: "owner_contact", label: "Owner Contact" },
  { value: "decline_reason", label: "Decline Reason" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-US", {
    month:   "short",
    day:     "numeric",
    year:    "numeric",
    hour:    "numeric",
    minute:  "2-digit",
  });
}

// ─── Timeline dot color by item type ─────────────────────────────────────────

function dotClass(type) {
  if (type === "assessment") return "bg-brand-500";
  if (type === "note")       return "bg-blue-500";
  return "bg-gray-400";
}

function typeLabel(type) {
  if (type === "assessment") return "ASSESSMENT";
  if (type === "note")       return "NOTE";
  return "OUTREACH";
}

function typeLabelColor(type) {
  if (type === "assessment") return "text-brand-600";
  if (type === "note")       return "text-blue-600";
  return "text-gray-500";
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span className="w-4 h-4 border-2 border-brand-200 border-t-brand-500 rounded-full animate-spin inline-block" />
  );
}

// ─── Timeline item content ────────────────────────────────────────────────────

function AssessmentContent({ item }) {
  const score = item.suitability_score;
  return (
    <div className="space-y-1">
      <p className="text-sm text-gray-800 font-medium">
        {item.model || "Claude"} —{" "}
        Score:{" "}
        <span className={`font-bold tabular-nums ${
          score >= 70 ? "text-green-700" :
          score >= 40 ? "text-yellow-700" :
          "text-red-700"
        }`}>
          {score ?? "—"}/100
        </span>
        {item.confidence && (
          <span className="ml-2 text-xs text-ink-subtle">({item.confidence})</span>
        )}
      </p>
      {item.assessment_notes && (
        <p className="text-sm text-gray-600 italic leading-relaxed">
          {item.assessment_notes}
        </p>
      )}
    </div>
  );
}

function NoteContent({ item }) {
  const typeObj = NOTE_TYPES.find((t) => t.value === item.note_type);
  return (
    <div className="space-y-1">
      {item.note_type && item.note_type !== "general" && (
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          [{typeObj?.label ?? item.note_type}]
        </p>
      )}
      <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
        {item.body}
      </p>
    </div>
  );
}

function OutreachContent({ item }) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-gray-800">
        <span className="font-medium capitalize">{item.channel}</span>
        {item.subject && (
          <span className="text-gray-600"> — {item.subject}</span>
        )}
      </p>
      <p className="text-xs text-ink-subtle">
        {item.sent_at ? `Sent ${fmtDateTime(item.sent_at)}` : "Draft"}
      </p>
      {item.response_received_at && (
        <p className="text-xs text-green-700 font-medium">
          Response logged {fmtDateTime(item.response_received_at)}
        </p>
      )}
    </div>
  );
}

// ─── Add note form ────────────────────────────────────────────────────────────

function AddNoteForm({ venueId, onAdded }) {
  const [body,      setBody]      = useState("");
  const [noteType,  setNoteType]  = useState("general");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState(null);

  async function submit() {
    if (!body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res  = await fetch(`/api/admin/venues/${venueId}/notes`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ body: body.trim(), note_type: noteType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add note.");
      setBody("");
      setNoteType("general");
      onAdded();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-blue-200 rounded-xl bg-blue-50 p-4 mb-8 space-y-3">
      <p className="text-[10px] uppercase tracking-widest font-semibold text-blue-600">
        Add Note
      </p>
      {error && (
        <div className="notice-error text-xs" role="alert">{error}</div>
      )}
      <div>
        <label className="label text-xs">Type</label>
        <select
          className="input text-sm"
          value={noteType}
          onChange={(e) => setNoteType(e.target.value)}
        >
          {NOTE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label text-xs">Note</label>
        <textarea
          className="input text-sm resize-none"
          rows={3}
          placeholder="Add a note…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <button
        onClick={submit}
        disabled={saving || !body.trim()}
        className="btn btn-primary text-sm"
      >
        {saving ? <><Spinner /> Adding…</> : "Add note"}
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TimelinePage() {
  const params  = useParams();
  const id      = params?.id;

  const [items,   setItems]   = useState([]);
  const [venue,   setVenue]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/admin/venues/${id}/timeline`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load timeline.");
      setItems(data.timeline ?? []);
      setVenue(data.venue ?? null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-2xl mx-auto">
      {/* Back link */}
      <div className="mb-6">
        <Link href="/admin" className="text-sm text-brand-600 hover:underline font-medium">
          ← Back to Venues
        </Link>
      </div>

      {/* Page heading */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          {venue ? venue.name : "Timeline"}
        </h1>
        {venue && (
          <p className="text-sm text-ink-muted mt-0.5">
            {[venue.city, venue.state].filter(Boolean).join(", ")}
            {venue.status && (
              <span className={`ml-2 badge-${venue.status === "site_visit" ? "site-visit" : venue.status}`}>
                {venue.status === "site_visit" ? "Site Visit" :
                  venue.status.charAt(0).toUpperCase() + venue.status.slice(1)}
              </span>
            )}
          </p>
        )}
      </div>

      {error && (
        <div className="notice-error mb-6" role="alert">{error}</div>
      )}

      {/* Add note form */}
      {!loading && !error && id && (
        <AddNoteForm venueId={id} onAdded={load} />
      )}

      {/* Timeline */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-12 text-center">
          <p className="font-semibold text-gray-700 mb-1">No activity yet</p>
          <p className="text-sm text-ink-muted">
            Notes, AI assessments, and outreach will appear here.
          </p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-3.5 top-0 bottom-0 w-px bg-gray-200" aria-hidden="true" />

          <ol className="space-y-6">
            {items.map((item, i) => (
              <li key={`${item.type}-${item.id}-${i}`} className="relative flex gap-4">
                {/* Dot */}
                <div className={`relative z-10 flex-shrink-0 w-7 h-7 rounded-full border-2 border-white shadow-sm flex items-center justify-center ${dotClass(item.type)}`}>
                  <span className="sr-only">{typeLabel(item.type)}</span>
                </div>

                {/* Card */}
                <div className="flex-1 min-w-0 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
                  {/* Date + type label row */}
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <span className={`text-[10px] uppercase tracking-widest font-semibold ${typeLabelColor(item.type)}`}>
                      {typeLabel(item.type)}
                    </span>
                    <span className="text-xs text-ink-subtle tabular-nums whitespace-nowrap">
                      {fmtDateTime(item.date)}
                    </span>
                  </div>

                  {/* Content */}
                  {item.type === "assessment" && <AssessmentContent item={item} />}
                  {item.type === "note"       && <NoteContent       item={item} />}
                  {item.type === "outreach"   && <OutreachContent   item={item} />}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
