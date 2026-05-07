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

const NOTE_TYPES = [
  { value: "general",        label: "General" },
  { value: "site_visit",     label: "Site visit" },
  { value: "owner_contact",  label: "Owner contact" },
  { value: "decline_reason", label: "Decline reason" },
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

function KanbanCard({ venue, onClick, onDragStart, onDragEnd, isDragging, isInFlight }) {
  const pastDue = isPastDue(venue.follow_up_due_at);
  const lastOutreach = venue.last_outreach_at ? relativeTime(venue.last_outreach_at) : null;
  const ownerIdentified = Boolean(venue.owner_email || venue.owner_phone);

  return (
    <button
      onClick={() => onClick(venue)}
      draggable={!isInFlight}
      onDragStart={(e) => onDragStart?.(e, venue)}
      onDragEnd={(e) => onDragEnd?.(e, venue)}
      className={`w-full text-left bg-white border border-gray-200 rounded-xl p-3 shadow-sm hover:shadow-md hover:border-brand-300 transition-all group ${
        isDragging ? "opacity-40" : ""
      } ${isInFlight ? "cursor-wait pointer-events-none" : "cursor-grab active:cursor-grabbing"}`}
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
        {ownerIdentified && (
          <span
            className="inline-flex items-center rounded-full bg-green-50 text-green-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            title="Owner contact info on file"
          >
            Owner ✓
          </span>
        )}
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

function KanbanColumn({
  stage,
  venues,
  onCardClick,
  onCardDragStart,
  onCardDragEnd,
  draggingId,
  inFlightId,
  isDropTarget,
  isInvalidTarget,
  onDragOver,
  onDragLeave,
  onDrop,
}) {
  const ringClass = isInvalidTarget
    ? "ring-2 ring-red-300 bg-red-50"
    : isDropTarget
    ? "ring-2 ring-brand-400 bg-brand-50"
    : "";

  return (
    <div
      className={`flex flex-col min-w-[220px] max-w-[220px] bg-gray-50 rounded-xl border border-gray-200 transition-all ${ringClass}`}
      onDragOver={(e) => onDragOver?.(e, stage)}
      onDragLeave={(e) => onDragLeave?.(e, stage)}
      onDrop={(e) => onDrop?.(e, stage)}
    >
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
          <KanbanCard
            key={v.id}
            venue={v}
            onClick={onCardClick}
            onDragStart={onCardDragStart}
            onDragEnd={onCardDragEnd}
            isDragging={draggingId === v.id}
            isInFlight={inFlightId === v.id}
          />
        ))}
        {venues.length === 0 && (
          <p className="text-[11px] text-gray-400 text-center py-4">No venues</p>
        )}
      </div>
    </div>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

function Drawer({ venue, onClose, onAdvance, advancing, advanceError, onReload, initialDeclineOpen }) {
  const [showDeclineForm, setShowDeclineForm] = useState(Boolean(initialDeclineOpen));
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
  // Tracks which kind of draft is currently loaded in `draft` so the send
  // success message and re-draft action can be worded correctly.
  const [draftKind,       setDraftKind]       = useState("outreach"); // "outreach" | "follow_up"

  // Notes state
  const [notes,           setNotes]           = useState([]);
  const [notesLoading,    setNotesLoading]    = useState(false);
  const [notesError,      setNotesError]      = useState(null);
  const [noteBody,        setNoteBody]        = useState("");
  const [noteType,        setNoteType]        = useState("general");
  const [savingNote,      setSavingNote]      = useState(false);

  const status = venue.status;
  const pastDue = isPastDue(venue.follow_up_due_at);

  // Follow-up button visibility: contacted venue, prior outreach exists,
  // last sent > 7 days ago, and no response_received_at on that outreach.
  // The pipeline endpoint exposes last_outreach_at as MAX(sent_at), and
  // follow_up_due_at is null only when no future-dated follow-up is queued
  // AND the latest outreach has no response — same condition the alert
  // banner uses on the page.
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const followUpEligible =
    status === "contacted" &&
    venue.last_outreach_at != null &&
    Date.now() - new Date(venue.last_outreach_at).getTime() > SEVEN_DAYS_MS &&
    venue.follow_up_due_at == null;

  // Load notes when the venue changes
  useEffect(() => {
    let cancelled = false;
    async function loadNotes() {
      setNotesLoading(true);
      setNotesError(null);
      try {
        const res  = await fetch(`/api/admin/venues/${venue.id}/notes`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load notes.");
        if (!cancelled) setNotes(json.notes ?? []);
      } catch (e) {
        if (!cancelled) setNotesError(e.message);
      } finally {
        if (!cancelled) setNotesLoading(false);
      }
    }
    loadNotes();
    return () => { cancelled = true; };
  }, [venue.id]);

  async function submitNote() {
    if (!noteBody.trim() || savingNote) return;
    setSavingNote(true);
    setNotesError(null);
    try {
      const res  = await fetch(`/api/admin/venues/${venue.id}/notes`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ body: noteBody.trim(), note_type: noteType }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save note.");
      setNotes((prev) => [json.note, ...prev]);
      setNoteBody("");
      setNoteType("general");
    } catch (e) {
      setNotesError(e.message);
    } finally {
      setSavingNote(false);
    }
  }

  async function draftEmail() {
    setDrafting(true);
    setDraftError(null);
    setDraftKind("outreach");
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

  // Draft a short follow-up nudge — only valid when followUpEligible is true.
  // The endpoint inserts its own venue_outreach row and returns the same
  // { subject, body, outreachId } shape as draft-outreach, so the existing
  // sendEmail() can deliver it via /api/admin/outreach/[id]/send.
  async function draftFollowUp() {
    setShowEmail(true);
    setEmailSent(false);
    setDrafting(true);
    setDraftError(null);
    setDraftKind("follow_up");
    try {
      const res  = await fetch(`/api/admin/venues/${venue.id}/follow-up-draft`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ eventType, orgName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Follow-up drafting failed.");
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
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => onAdvance("responded")}
                  disabled={advancing}
                  className="btn btn-outline w-full justify-center text-sm"
                >
                  {advancing ? <Spinner /> : "Mark Responded"}
                </button>
                {/* Phase 5: one-click follow-up nudge for overdue contacted venues */}
                {followUpEligible && (
                  <button
                    onClick={draftFollowUp}
                    disabled={drafting}
                    title="Draft a short check-in email referencing the original outreach"
                    className="btn btn-outline border-amber-400 text-amber-700 hover:bg-amber-50 w-full justify-center text-sm"
                  >
                    {drafting && draftKind === "follow_up"
                      ? <><Spinner /> Drafting follow-up…</>
                      : "Send follow-up"}
                  </button>
                )}
              </div>
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
                    <div className="notice-success text-sm">
                      {draftKind === "follow_up"
                        ? "Follow-up sent."
                        : "Email sent — venue marked as Contacted."}
                    </div>
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

          {/* Notes */}
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle mb-2">Notes</p>

            <div className="space-y-2 mb-3">
              <textarea
                className="input text-sm resize-none"
                rows={3}
                placeholder="Add a note…"
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <select
                  className="input text-sm flex-1"
                  value={noteType}
                  onChange={(e) => setNoteType(e.target.value)}
                >
                  {NOTE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <button
                  onClick={submitNote}
                  disabled={savingNote || !noteBody.trim()}
                  className="btn btn-primary text-sm"
                >
                  {savingNote ? <><Spinner /> Saving…</> : "Add note"}
                </button>
              </div>
              {notesError && (
                <div className="notice-error text-sm" role="alert">{notesError}</div>
              )}
            </div>

            {notesLoading ? (
              <p className="text-xs text-gray-400">Loading notes…</p>
            ) : notes.length === 0 ? (
              <p className="text-xs text-gray-400">No notes yet.</p>
            ) : (
              <ul className="space-y-2">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle">
                        {n.note_type ? n.note_type.replace(/_/g, " ") : "general"}
                      </span>
                      {n.created_at && (
                        <span className="text-[10px] text-gray-400 tabular-nums">
                          {relativeTime(n.created_at)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-700 whitespace-pre-wrap">{n.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-4">
            <a
              href={`/admin/venues/${venue.id}/timeline`}
              className="text-xs text-brand-600 hover:underline font-medium"
            >
              View full timeline ↗
            </a>
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-brand-600 hover:underline font-medium"
              >
                Google Maps ↗
              </a>
            )}
          </div>
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
  const [drawerDeclineOpen, setDrawerDeclineOpen] = useState(false);

  // Drag-and-drop state
  const [draggingVenue,  setDraggingVenue]  = useState(null); // { id, status }
  const [dragOverStage,  setDragOverStage]  = useState(null);
  const [inFlightId,     setInFlightId]     = useState(null);
  const [dragError,      setDragError]      = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/admin/pipeline");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load pipeline.");
      setData(json);
      return json;
    } catch (e) {
      setError(e.message);
      return null;
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

      // Reload pipeline data, then keep the drawer open by re-selecting the
      // updated venue. Prefer the fresh list row (it includes computed fields
      // like last_outreach_at / follow_up_due_at); fall back to the API row,
      // and finally to the previous selection merged with the new status so
      // the drawer never closes on success.
      const refreshed = await load();
      const id = selectedVenue.id;
      const fromList = refreshed?.columns
        ? Object.values(refreshed.columns).flat().find((v) => v.id === id)
        : null;
      setSelectedVenue(
        fromList ?? json.venue ?? { ...selectedVenue, status }
      );
    } catch (e) {
      setAdvanceError(e.message);
    } finally {
      setAdvancing(false);
    }
  }

  // ─── Drag-and-drop handlers ────────────────────────────────────────────────

  function handleCardDragStart(e, venue) {
    if (inFlightId === venue.id) {
      e.preventDefault();
      return;
    }
    setDraggingVenue({ id: venue.id, status: venue.status });
    setDragError(null);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      // Some browsers need data set to initiate the drag.
      try { e.dataTransfer.setData("text/plain", String(venue.id)); } catch {}
    }
  }

  function handleCardDragEnd() {
    setDraggingVenue(null);
    setDragOverStage(null);
  }

  function handleColumnDragOver(e, stage) {
    if (!draggingVenue) return;
    if (!STAGES.includes(stage)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    if (dragOverStage !== stage) setDragOverStage(stage);
  }

  function handleColumnDragLeave(e, stage) {
    // Only clear if leaving the column entirely (not entering a child).
    if (e.currentTarget.contains(e.relatedTarget)) return;
    if (dragOverStage === stage) setDragOverStage(null);
  }

  async function handleColumnDrop(e, stage) {
    e.preventDefault();
    const dragged = draggingVenue;
    setDragOverStage(null);
    setDraggingVenue(null);

    if (!dragged) return;
    if (!STAGES.includes(stage)) return;
    if (dragged.status === stage) return; // no-op on same column
    if (inFlightId === dragged.id) return; // already advancing

    // Find the full venue row for the drawer / decline modal seed.
    const venueRow = data?.columns
      ? Object.values(data.columns).flat().find((v) => v.id === dragged.id)
      : null;

    // Drag-to-declined surfaces the existing decline form (category + notes)
    // rather than silently setting the status.
    if (stage === "declined") {
      if (venueRow) {
        setSelectedVenue(venueRow);
        setAdvanceError(null);
        setDrawerDeclineOpen(true);
      }
      return;
    }

    // Otherwise advance via the existing endpoint, which accepts an explicit
    // target status (not just next-stage), so skip-stage drags work directly.
    setInFlightId(dragged.id);
    setDragError(null);
    try {
      const res  = await fetch(`/api/admin/pipeline/${dragged.id}/advance`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ status: stage }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Advance failed.");
      const refreshed = await load();
      // If the drawer is open on this same venue, keep it in sync.
      if (selectedVenue?.id === dragged.id) {
        const fromList = refreshed?.columns
          ? Object.values(refreshed.columns).flat().find((v) => v.id === dragged.id)
          : null;
        setSelectedVenue(fromList ?? json.venue ?? { ...selectedVenue, status: stage });
      }
    } catch (err) {
      // On failure the local data is unchanged (we refetch only on success),
      // so the card naturally "snaps back" to its original column.
      setDragError(err.message);
    } finally {
      setInFlightId(null);
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
        {dragError && (
          <div className="notice-error mb-5" role="alert">{dragError}</div>
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
                onCardClick={(v) => { setSelectedVenue(v); setAdvanceError(null); setDrawerDeclineOpen(false); }}
                onCardDragStart={handleCardDragStart}
                onCardDragEnd={handleCardDragEnd}
                draggingId={draggingVenue?.id ?? null}
                inFlightId={inFlightId}
                isDropTarget={
                  dragOverStage === stage &&
                  draggingVenue != null &&
                  draggingVenue.status !== stage
                }
                isInvalidTarget={
                  dragOverStage === stage &&
                  draggingVenue != null &&
                  draggingVenue.status === stage
                }
                onDragOver={handleColumnDragOver}
                onDragLeave={handleColumnDragLeave}
                onDrop={handleColumnDrop}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* Side drawer */}
      {selectedVenue && (
        <Drawer
          key={selectedVenue.id + (drawerDeclineOpen ? ":decline" : "")}
          venue={selectedVenue}
          onClose={() => { setSelectedVenue(null); setAdvanceError(null); setDrawerDeclineOpen(false); }}
          onAdvance={advanceVenue}
          advancing={advancing}
          advanceError={advanceError}
          onReload={load}
          initialDeclineOpen={drawerDeclineOpen}
        />
      )}
    </div>
  );
}
