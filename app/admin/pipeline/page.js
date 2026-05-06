"use client";

import { useEffect, useState, useCallback } from "react";

// ─── Constants ───────────────────────────────────────────────────────────────

const STAGES = [
  "candidate",
  "shortlisted",
  "contacted",
  "responded",
  "site_visit",
  "approved",
  "declined",
  "archived",
];

const DECLINE_CATEGORIES = [
  "No interest",
  "Insurance liability",
  "Capacity conflict",
  "Cost prohibitive",
  "No response after 3 attempts",
  "Other",
];

const SURFACE_OPTIONS = [
  { value: "1", label: "1 — Poor" },
  { value: "2", label: "2 — Fair" },
  { value: "3", label: "3 — Good" },
  { value: "4", label: "4 — Very Good" },
  { value: "5", label: "5 — Excellent" },
];

const EMPTY_SITE_VISIT = {
  actualAcres: "",
  surfaceCondition: "",
  perimeterDescription: "",
  restroomsOnSite: false,
  electricalAccess: false,
  securityAvailable: false,
  nearestHospital: "",
  photoLinks: "",
  additionalNotes: "",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusLabel(s) {
  return s === "site_visit" ? "Site Visit" : s.charAt(0).toUpperCase() + s.slice(1);
}

function relativeTime(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (days >= 1)  return `${days}d ago`;
  if (hours >= 1) return `${hours}h ago`;
  if (mins >= 1)  return `${mins}m ago`;
  return "just now";
}

function isPastDue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScorePill({ score }) {
  if (score == null)
    return <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums bg-gray-100 text-gray-400">—</span>;
  const color =
    score >= 70 ? "bg-green-50 text-green-700" :
    score >= 40 ? "bg-yellow-50 text-yellow-700" :
                  "bg-red-50 text-red-700";
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${color}`}>
      {score}
    </span>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`badge-${status === "site_visit" ? "site-visit" : status}`}>
      {statusLabel(status)}
    </span>
  );
}

function KanbanCard({ venue, onClick }) {
  const pastDue = isPastDue(venue.follow_up_due_at);
  const lastOutreach = venue.last_outreach_at ? relativeTime(venue.last_outreach_at) : null;

  return (
    <button
      onClick={() => onClick(venue)}
      className="w-full text-left bg-white border border-gray-200 rounded-xl p-3 shadow-sm hover:shadow-md hover:border-brand-300 transition-all group"
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <span className="font-medium text-gray-900 text-sm truncate flex-1 leading-tight">
          {venue.name}
        </span>
        <ScorePill score={venue.composite_score} />
      </div>

      {(venue.city || venue.state) && (
        <p className="text-xs text-gray-500 mb-1.5">
          {[venue.city, venue.state].filter(Boolean).join(", ")}
        </p>
      )}

      {venue.owner_email && (
        <p className="text-xs text-ink-subtle truncate mb-1.5">{venue.owner_email}</p>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        {lastOutreach && (
          <span className="text-[10px] text-gray-400">Contacted {lastOutreach}</span>
        )}
        {pastDue && (
          <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
            Follow up
          </span>
        )}
      </div>
    </button>
  );
}

function KanbanColumn({ stage, venues, onCardClick }) {
  return (
    <div className="flex flex-col min-w-[220px] max-w-[220px] bg-gray-50 rounded-xl border border-gray-200">
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200">
        <span className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle">
          {statusLabel(stage)}
        </span>
        <span className="inline-flex items-center justify-center rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold min-w-[18px] h-[18px] px-1 tabular-nums">
          {venues.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 p-2 overflow-y-auto max-h-[calc(100vh-200px)]">
        {venues.map((v) => (
          <KanbanCard key={v.id} venue={v} onClick={onCardClick} />
        ))}
        {venues.length === 0 && (
          <p className="text-[11px] text-gray-400 text-center py-4">No venues</p>
        )}
      </div>
    </div>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

function Drawer({ venue, onClose, onAdvance, advancing, advanceError, onReload }) {
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineReason,   setDeclineReason]   = useState("");
  const [declineCategory, setDeclineCategory] = useState("");
  const [showSiteVisit,   setShowSiteVisit]   = useState(false);
  const [siteVisitForm,   setSiteVisitForm]   = useState(EMPTY_SITE_VISIT);
  const [savingSiteVisit, setSavingSiteVisit] = useState(false);
  const [siteVisitError,  setSiteVisitError]  = useState(null);
  const [siteVisitSaved,  setSiteVisitSaved]  = useState(false);

  // Email draft/send state
  const [showEmail,       setShowEmail]       = useState(false);
  const [eventType,       setEventType]       = useState("teen driver safety training event");
  const [orgName,         setOrgName]         = useState("Atlanta Region SCCA — Tire Rack Street Survival");
  const [drafting,        setDrafting]        = useState(false);
  const [draft,           setDraft]           = useState(null);
  const [draftError,      setDraftError]      = useState(null);
  const [sending,         setSending]         = useState(false);
  const [emailSent,       setEmailSent]       = useState(false);

  const status = venue.status;
  const pastDue = isPastDue(venue.follow_up_due_at);

  async function draftEmail() {
    setDrafting(true);
    setDraftError(null);
    try {
      const res  = await fetch(`/api/admin/venues/${venue.id}/draft-outreach`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ eventType, orgName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Drafting failed.");
      setDraft(data);
    } catch (e) {
      setDraftError(e.message);
    } finally {
      setDrafting(false);
    }
  }

  async function sendEmail() {
    if (!draft || !venue.owner_email) return;
    setSending(true);
    setDraftError(null);
    try {
      const res  = await fetch(`/api/admin/outreach/${draft.outreachId}/send`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ to: venue.owner_email, subject: draft.subject, body: draft.body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed.");
      setEmailSent(true);
      // Advance to contacted if still candidate/shortlisted
      if (["candidate", "shortlisted"].includes(status)) {
        await fetch(`/api/admin/pipeline/${venue.id}/advance`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ status: "contacted" }),
        });
        if (onReload) onReload();
      }
    } catch (e) {
      setDraftError(e.message);
    } finally {
      setSending(false);
    }
  }

  async function submitSiteVisit() {
    setSavingSiteVisit(true);
    setSiteVisitError(null);
    try {
      const body = {
        ...siteVisitForm,
        actualAcres: siteVisitForm.actualAcres !== "" ? Number(siteVisitForm.actualAcres) : null,
        surfaceCondition: siteVisitForm.surfaceCondition !== "" ? Number(siteVisitForm.surfaceCondition) : null,
        photoLinks: siteVisitForm.photoLinks
          ? siteVisitForm.photoLinks.split("\n").map((l) => l.trim()).filter(Boolean)
          : [],
      };
      const res  = await fetch(`/api/admin/pipeline/${venue.id}/site-visit`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed.");
      setSiteVisitSaved(true);
    } catch (e) {
      setSiteVisitError(e.message);
    } finally {
      setSavingSiteVisit(false);
    }
  }

  function handleDecline() {
    if (!declineReason.trim() || !declineCategory) return;
    onAdvance("declined", { declineReason, declineCategory });
    setShowDeclineForm(false);
  }

  const mapsUrl = venue.google_place_id
    ? `https://www.google.com/maps/place/?q=place_id:${venue.google_place_id}`
    : venue.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([venue.address, venue.city, venue.state].filter(Boolean).join(", "))}`
    : null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Drawer panel */}
      <div className="fixed right-0 top-0 h-full w-[360px] bg-white shadow-xl z-50 flex flex-col">
        {/* Sticky header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3 bg-white sticky top-0">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-900 truncate leading-tight">{venue.name}</h2>
            <div className="mt-1">
              <StatusBadge status={status} />
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none flex-shrink-0 mt-0.5"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Follow-up alert */}
          {pastDue && (
            <div className="notice-error" role="alert">
              Follow-up overdue since {new Date(venue.follow_up_due_at).toLocaleDateString()}.
            </div>
          )}

          {/* Advance error */}
          {advanceError && (
            <div className="notice-error" role="alert">{advanceError}</div>
          )}

          {/* Quick-action buttons */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle">Actions</p>

            {status === "candidate" && (
              <button
                onClick={() => onAdvance("shortlisted")}
                disabled={advancing}
                className="btn btn-outline w-full justify-center text-sm"
              >
                {advancing ? <Spinner /> : "Advance to Shortlisted"}
              </button>
            )}

            {status === "shortlisted" && (
              <button
                onClick={() => onAdvance("contacted")}
                disabled={advancing}
                className="btn btn-outline w-full justify-center text-sm"
              >
                {advancing ? <Spinner /> : "Advance to Contacted"}
              </button>
            )}

            {status === "contacted" && (
              <button
                onClick={() => onAdvance("responded")}
                disabled={advancing}
                className="btn btn-outline w-full justify-center text-sm"
              >
                {advancing ? <Spinner /> : "Mark Responded"}
              </button>
            )}

            {status === "responded" && !showDeclineForm && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => onAdvance("site_visit")}
                  disabled={advancing}
                  className="btn btn-primary w-full justify-center text-sm"
                >
                  {advancing ? <Spinner /> : "Schedule Site Visit"}
                </button>
                <button
                  onClick={() => setShowDeclineForm(true)}
                  className="btn btn-danger-outline w-full justify-center text-sm"
                >
                  Decline
                </button>
              </div>
            )}

            {status === "site_visit" && !showDeclineForm && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => onAdvance("approved")}
                  disabled={advancing}
                  className="btn btn-primary w-full justify-center text-sm"
                >
                  {advancing ? <Spinner /> : "Approve"}
                </button>
                <button
                  onClick={() => setShowDeclineForm(true)}
                  className="btn btn-danger-outline w-full justify-center text-sm"
                >
                  Decline
                </button>
              </div>
            )}

            {/* Decline inline form */}
            {showDeclineForm && (
              <div className="border border-red-200 rounded-xl p-3 bg-red-50 space-y-3">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-red-700">Decline venue</p>
                <div>
                  <label className="label text-xs">Category</label>
                  <select
                    className="input text-sm"
                    value={declineCategory}
                    onChange={(e) => setDeclineCategory(e.target.value)}
                  >
                    <option value="">Select a reason…</option>
                    {DECLINE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label text-xs">Notes</label>
                  <textarea
                    className="input text-sm resize-none"
                    rows={3}
                    placeholder="Additional context…"
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleDecline}
                    disabled={advancing || !declineReason.trim() || !declineCategory}
                    className="btn btn-danger-outline flex-1 text-sm"
                  >
                    {advancing ? <Spinner /> : "Confirm Decline"}
                  </button>
                  <button
                    onClick={() => { setShowDeclineForm(false); setDeclineReason(""); setDeclineCategory(""); }}
                    className="btn btn-outline text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Site visit checklist */}
          {status === "site_visit" && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowSiteVisit((p) => !p)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 text-left hover:bg-gray-100 transition-colors"
              >
                <span className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle">
                  Site Visit Checklist
                </span>
                <span className="text-gray-400 text-xs">{showSiteVisit ? "▲" : "▼"}</span>
              </button>

              {showSiteVisit && (
                <div className="px-4 py-4 space-y-4">
                  {siteVisitSaved && (
                    <div className="notice-success text-sm">Checklist saved.</div>
                  )}
                  {siteVisitError && (
                    <div className="notice-error text-sm" role="alert">{siteVisitError}</div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label text-xs">Actual acres</label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        className="input text-sm"
                        value={siteVisitForm.actualAcres}
                        onChange={(e) => setSiteVisitForm((f) => ({ ...f, actualAcres: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="label text-xs">Surface condition</label>
                      <select
                        className="input text-sm"
                        value={siteVisitForm.surfaceCondition}
                        onChange={(e) => setSiteVisitForm((f) => ({ ...f, surfaceCondition: e.target.value }))}
                      >
                        <option value="">—</option>
                        {SURFACE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="label text-xs">Perimeter description</label>
                    <input
                      className="input text-sm"
                      value={siteVisitForm.perimeterDescription}
                      onChange={(e) => setSiteVisitForm((f) => ({ ...f, perimeterDescription: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    {[
                      { key: "restroomsOnSite",   label: "Restrooms on site" },
                      { key: "electricalAccess",  label: "Electrical access" },
                      { key: "securityAvailable", label: "Security available" },
                    ].map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-brand-500 focus:ring-brand-300"
                          checked={siteVisitForm[key]}
                          onChange={(e) => setSiteVisitForm((f) => ({ ...f, [key]: e.target.checked }))}
                        />
                        <span className="text-sm text-gray-700">{label}</span>
                      </label>
                    ))}
                  </div>

                  <div>
                    <label className="label text-xs">Nearest hospital</label>
                    <input
                      className="input text-sm"
                      value={siteVisitForm.nearestHospital}
                      onChange={(e) => setSiteVisitForm((f) => ({ ...f, nearestHospital: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label className="label text-xs">Photo links (one URL per line)</label>
                    <textarea
                      className="input text-sm resize-none"
                      rows={3}
                      placeholder="https://…"
                      value={siteVisitForm.photoLinks}
                      onChange={(e) => setSiteVisitForm((f) => ({ ...f, photoLinks: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label className="label text-xs">Additional notes</label>
                    <textarea
                      className="input text-sm resize-none"
                      rows={3}
                      value={siteVisitForm.additionalNotes}
                      onChange={(e) => setSiteVisitForm((f) => ({ ...f, additionalNotes: e.target.value }))}
                    />
                  </div>

                  <button
                    onClick={submitSiteVisit}
                    disabled={savingSiteVisit}
                    className="btn btn-primary w-full justify-center text-sm"
                  >
                    {savingSiteVisit ? <><Spinner /> Saving…</> : "Save checklist"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Owner info */}
          {(venue.owner_name || venue.owner_email || venue.owner_phone) && (
            <div>
              <p className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle mb-2">Owner / Contact</p>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 space-y-1.5 text-sm">
                {venue.owner_name && (
                  <p className="font-medium text-gray-900">{venue.owner_name}</p>
                )}
                {venue.owner_email && (
                  <p>
                    <a href={`mailto:${venue.owner_email}`} className="text-brand-600 hover:underline text-xs">
                      {venue.owner_email}
                    </a>
                  </p>
                )}
                {venue.owner_phone && (
                  <p className="text-xs text-gray-600">{venue.owner_phone}</p>
                )}
              </div>
            </div>
          )}

          {/* Email outreach */}
          {!["declined", "archived"].includes(status) && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => { setShowEmail((p) => !p); setDraft(null); setDraftError(null); setEmailSent(false); }}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 text-left hover:bg-gray-100 transition-colors"
              >
                <span className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle">
                  Draft Inquiry Email
                </span>
                <span className="text-gray-400 text-xs">{showEmail ? "▲" : "▼"}</span>
              </button>

              {showEmail && (
                <div className="px-4 py-4 space-y-3">
                  {emailSent ? (
                    <div className="notice-success text-sm">Email sent — venue marked as Contacted.</div>
                  ) : !draft ? (
                    <>
                      {draftError && <div className="notice-error text-sm" role="alert">{draftError}</div>}
                      <div>
                        <label className="label text-xs">Event type</label>
                        <input className="input text-sm" value={eventType} onChange={(e) => setEventType(e.target.value)} />
                      </div>
                      <div>
                        <label className="label text-xs">Organization name</label>
                        <input className="input text-sm" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
                      </div>
                      {!venue.owner_email && (
                        <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                          No owner email on file — add it in the Venues list before sending.
                        </p>
                      )}
                      <button
                        onClick={draftEmail}
                        disabled={drafting}
                        className="btn btn-primary w-full justify-center text-sm"
                      >
                        {drafting ? <><Spinner /> Drafting…</> : "Draft with AI"}
                      </button>
                    </>
                  ) : (
                    <>
                      {draftError && <div className="notice-error text-sm" role="alert">{draftError}</div>}
                      <div>
                        <label className="label text-xs">Subject</label>
                        <input
                          className="input text-sm"
                          value={draft.subject}
                          onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="label text-xs">Body</label>
                        <textarea
                          className="input text-sm resize-none"
                          rows={10}
                          value={draft.body}
                          onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setDraft(null); setDraftError(null); }}
                          className="btn btn-outline text-sm flex-1"
                        >
                          Re-draft
                        </button>
                        <button
                          onClick={sendEmail}
                          disabled={sending || !venue.owner_email}
                          title={!venue.owner_email ? "No owner email on file" : ""}
                          className="btn btn-primary text-sm flex-1 justify-center"
                        >
                          {sending ? <><Spinner /> Sending…</> : venue.owner_email ? `Send to ${venue.owner_email}` : "No owner email"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Score */}
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle mb-2">Assessment</p>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex items-center gap-6">
              <div>
                <span className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle block mb-0.5">
                  Score
                </span>
                {venue.composite_score != null ? (
                  <span className={`text-2xl font-bold tabular-nums ${
                    venue.composite_score >= 70 ? "text-green-700" :
                    venue.composite_score >= 40 ? "text-yellow-700" :
                    "text-red-700"
                  }`}>
                    {venue.composite_score}
                  </span>
                ) : (
                  <span className="text-2xl font-bold text-gray-300">—</span>
                )}
              </div>
              {venue.last_assessed_at && (
                <div>
                  <span className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle block mb-0.5">
                    Assessed
                  </span>
                  <span className="text-xs text-gray-600 tabular-nums">
                    {new Date(venue.last_assessed_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Last outreach */}
          {venue.last_outreach_at && (
            <div>
              <p className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle mb-1">Last Outreach</p>
              <p className="text-xs text-gray-600 tabular-nums">
                {new Date(venue.last_outreach_at).toLocaleDateString()} — {relativeTime(venue.last_outreach_at)}
              </p>
            </div>
          )}

          {/* Google Maps link */}
          {mapsUrl && (
            <div>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-brand-600 hover:underline font-medium"
              >
                View on Google Maps ↗
              </a>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span className="w-4 h-4 border-2 border-brand-200 border-t-brand-500 rounded-full animate-spin inline-block" />
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const [data,           setData]           = useState(null);  // { columns, followUpAlerts }
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [selectedVenue,  setSelectedVenue]  = useState(null);
  const [advancing,      setAdvancing]      = useState(false);
  const [advanceError,   setAdvanceError]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/admin/pipeline");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load pipeline.");
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function advanceVenue(status, extra = {}) {
    if (!selectedVenue) return;
    setAdvancing(true);
    setAdvanceError(null);
    try {
      const res  = await fetch(`/api/admin/pipeline/${selectedVenue.id}/advance`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ status, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Advance failed.");
      await load();
      // Update the selected venue with the returned row (or find it in refreshed data)
      setSelectedVenue(json.venue ?? null);
    } catch (e) {
      setAdvanceError(e.message);
    } finally {
      setAdvancing(false);
    }
  }

  const totalCount = data
    ? STAGES.reduce((sum, s) => sum + (data.columns?.[s]?.length ?? 0), 0)
    : 0;

  const alerts = data?.followUpAlerts ?? [];

  return (
    // Override the parent padding with negative margin + full bleed scroll container
    <div className="-mx-6 -my-8">
      <div className="px-6 pt-8">
        {/* Page header */}
        <div className="flex items-baseline gap-3 mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
          {!loading && data && (
            <span className="text-sm text-ink-muted tabular-nums">{totalCount} venues</span>
          )}
        </div>

        {/* Follow-up alerts banner */}
        {alerts.length > 0 && (
          <div className="notice-warn mb-5" role="alert">
            <p className="font-semibold mb-1">
              {alerts.length} venue{alerts.length !== 1 ? "s" : ""} overdue for follow-up
            </p>
            <ul className="list-disc list-inside space-y-0.5">
              {alerts.map((v) => (
                <li key={v.id} className="text-xs">
                  <button
                    onClick={() => setSelectedVenue(v)}
                    className="underline underline-offset-2 hover:text-yellow-900 font-medium"
                  >
                    {v.name}
                  </button>
                  {" — last contacted "}
                  {v.last_outreach_at ? relativeTime(v.last_outreach_at) : "unknown"}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="notice-error mb-5" role="alert">{error}</div>
        )}
      </div>

      {/* Kanban board — horizontally scrollable */}
      {loading ? (
        <div className="flex justify-center py-24">
          <div className="w-8 h-8 border-2 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
        </div>
      ) : data ? (
        <div className="overflow-x-auto pb-8">
          <div className="flex gap-3 px-6 min-w-max">
            {STAGES.map((stage) => (
              <KanbanColumn
                key={stage}
                stage={stage}
                venues={data.columns?.[stage] ?? []}
                onCardClick={(v) => { setSelectedVenue(v); setAdvanceError(null); }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* Side drawer */}
      {selectedVenue && (
        <Drawer
          venue={selectedVenue}
          onClose={() => { setSelectedVenue(null); setAdvanceError(null); }}
          onAdvance={advanceVenue}
          advancing={advancing}
          advanceError={advanceError}
          onReload={load}
        />
      )}
    </div>
  );
}
