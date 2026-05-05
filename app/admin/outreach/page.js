"use client";

import { useEffect, useState, useCallback } from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day:   "numeric",
    year:  "numeric",
  });
}

function isPast(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function channelLabel(channel) {
  if (channel === "email")     return "Email";
  if (channel === "phone")     return "Phone";
  if (channel === "in_person") return "In-person";
  return channel;
}

function venueBadge(status) {
  const map = {
    candidate:   "badge-candidate",
    shortlisted: "badge-shortlisted",
    contacted:   "badge-contacted",
    responded:   "badge-responded",
    site_visit:  "badge-site-visit",
    approved:    "badge-approved",
    declined:    "badge-declined",
    archived:    "badge-archived",
  };
  const cls = map[status] ?? "badge-candidate";
  const label = status === "site_visit" ? "Site Visit" : status.charAt(0).toUpperCase() + status.slice(1);
  return <span className={cls}>{label}</span>;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span className="w-4 h-4 border-2 border-brand-200 border-t-brand-500 rounded-full animate-spin inline-block" />
  );
}

function FilterTabs({ filter, setFilter, outreach }) {
  const sentCount   = outreach.filter((o) => o.sent_at).length;
  const draftCount  = outreach.filter((o) => !o.sent_at).length;
  const respCount   = outreach.filter((o) => o.response_received_at).length;

  // Overdue: sent, no response, follow_up_due_at in past
  const overdueCount = outreach.filter(
    (o) => o.sent_at && !o.response_received_at && isPast(o.follow_up_due_at)
  ).length;

  const tabs = [
    { key: "all",       label: "All",       count: outreach.length },
    { key: "sent",      label: "Sent",      count: sentCount,  alert: overdueCount },
    { key: "drafts",    label: "Drafts",    count: draftCount },
    { key: "responded", label: "Responded", count: respCount },
  ];

  return (
    <div className="flex gap-1 border-b border-gray-200">
      {tabs.map(({ key, label, count, alert }) => (
        <button
          key={key}
          onClick={() => setFilter(key)}
          className={`relative px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            filter === key
              ? "border-brand-500 text-brand-700"
              : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
          }`}
        >
          {label}
          <span className={`ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
            filter === key ? "bg-brand-100 text-brand-700" : "bg-gray-100 text-gray-500"
          }`}>
            {count}
          </span>
          {alert > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[9px] font-bold px-1 tabular-nums">
              {alert}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function LogForm({ venues, onSubmit, onCancel, submitting, error }) {
  const [form, setForm] = useState({
    venue_id: "",
    channel:  "phone",
    notes:    "",
    sent_at:  todayIso(),
  });

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit(form);
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6">
      <h3 className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle mb-4">
        Log Manual Contact
      </h3>
      {error && (
        <div className="notice-error mb-3" role="alert">{error}</div>
      )}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Venue</label>
            <select
              className="input"
              value={form.venue_id}
              onChange={(e) => set("venue_id", e.target.value)}
              required
            >
              <option value="">Select a venue…</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}{v.city ? ` — ${v.city}` : ""}{v.state ? `, ${v.state}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Channel</label>
            <select
              className="input"
              value={form.channel}
              onChange={(e) => set("channel", e.target.value)}
            >
              <option value="phone">Phone</option>
              <option value="in_person">In-person</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea
            className="input resize-none"
            rows={3}
            placeholder="What was discussed…"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>

        <div className="w-48">
          <label className="label">Date</label>
          <input
            type="date"
            className="input"
            value={form.sent_at}
            onChange={(e) => set("sent_at", e.target.value)}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={submitting || !form.venue_id} className="btn btn-primary">
            {submitting ? <><Spinner /> Saving…</> : "Log contact"}
          </button>
          <button type="button" onClick={onCancel} className="btn btn-outline">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function RespondInline({ id, onConfirm, onCancel, submitting }) {
  const [notes, setNotes] = useState("");
  return (
    <div className="mt-3 border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
      <p className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle">Mark response received</p>
      <textarea
        className="input text-sm resize-none"
        rows={2}
        placeholder="Response notes (optional)…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          onClick={() => onConfirm(notes)}
          disabled={submitting}
          className="btn btn-primary text-sm"
        >
          {submitting ? <><Spinner /> Saving…</> : "Confirm"}
        </button>
        <button onClick={onCancel} className="btn btn-outline text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}

function OutreachRow({ record, respondingId, onMarkRespond, onCancelRespond, onConfirmRespond, submitMap }) {
  const isResponding = respondingId === record.id;
  const submitting   = submitMap[record.id] ?? false;

  const pastDue = record.sent_at && !record.response_received_at && isPast(record.follow_up_due_at);

  return (
    <div className="border-b border-gray-100 py-4 last:border-b-0">
      {/* Row: channel tag + venue name + meta */}
      <div className="flex items-start gap-3">
        {/* Channel pill */}
        <span className={`mt-0.5 flex-shrink-0 inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
          record.channel === "email"
            ? "bg-blue-50 text-blue-700 border border-blue-200"
            : record.channel === "phone"
            ? "bg-green-50 text-green-700 border border-green-200"
            : "bg-purple-50 text-purple-700 border border-purple-200"
        }`}>
          {channelLabel(record.channel)}
        </span>

        <div className="flex-1 min-w-0">
          {/* Venue name */}
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="font-semibold text-gray-900 text-sm">
              {record.venue_name}
            </span>
            {venueBadge(record.venue_status)}
          </div>

          {/* City/state + owner email */}
          <p className="text-xs text-ink-subtle mb-1.5">
            {[record.city, record.state].filter(Boolean).join(", ")}
            {record.owner_email && (
              <> &middot; <a href={`mailto:${record.owner_email}`} className="text-brand-600 hover:underline">{record.owner_email}</a></>
            )}
          </p>

          {/* Subject or body/notes */}
          {record.subject ? (
            <p className="text-sm text-gray-800 mb-1.5 font-medium">{record.subject}</p>
          ) : record.body ? (
            <p className="text-sm text-gray-700 mb-1.5 line-clamp-2">{record.body}</p>
          ) : null}

          {/* Dates row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-subtle">
            {record.sent_at && (
              <span className="tabular-nums">
                Sent: <span className="text-gray-700">{fmtDate(record.sent_at)}</span>
              </span>
            )}
            {!record.sent_at && (
              <span className="text-yellow-700 font-medium">Draft</span>
            )}
            {record.follow_up_due_at && (
              <span className={`tabular-nums ${pastDue ? "text-red-600 font-semibold" : ""}`}>
                Follow-up due: {fmtDate(record.follow_up_due_at)}{pastDue ? " — overdue" : ""}
              </span>
            )}
            {record.response_received_at ? (
              <span className="text-green-700 tabular-nums font-medium">
                Response: {fmtDate(record.response_received_at)}
              </span>
            ) : record.sent_at ? (
              <span className="text-ink-subtle">Awaiting response</span>
            ) : null}
          </div>

          {/* Response notes (if any) */}
          {record.response_notes && (
            <p className="mt-1.5 text-xs text-gray-600 italic">{record.response_notes}</p>
          )}

          {/* Mark Response button */}
          {record.sent_at && !record.response_received_at && !isResponding && (
            <button
              onClick={() => onMarkRespond(record.id)}
              className="mt-2 btn btn-outline text-xs py-1 px-2.5 h-auto"
            >
              Mark response received
            </button>
          )}

          {/* Inline respond form */}
          {isResponding && (
            <RespondInline
              id={record.id}
              onConfirm={(notes) => onConfirmRespond(record.id, notes)}
              onCancel={onCancelRespond}
              submitting={submitting}
            />
          )}
        </div>

        {/* AI drafted indicator */}
        {record.ai_drafted && (
          <span className="flex-shrink-0 text-[10px] uppercase tracking-widest font-semibold text-ink-subtle border border-gray-200 rounded px-1.5 py-0.5">
            AI
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OutreachPage() {
  const [outreach,     setOutreach]     = useState([]);
  const [venues,       setVenues]       = useState([]);
  const [filter,       setFilter]       = useState("all");
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [showLogForm,  setShowLogForm]  = useState(false);
  const [submittingLog,setSubmittingLog]= useState(false);
  const [logError,     setLogError]     = useState(null);
  const [respondingId, setRespondingId] = useState(null); // which row is open
  const [submitMap,    setSubmitMap]    = useState({});   // { [id]: bool }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/admin/outreach");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load outreach.");
      setOutreach(json.outreach);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadVenues = useCallback(async () => {
    try {
      const res  = await fetch("/api/admin/venues");
      const json = await res.json();
      if (res.ok) setVenues(json.venues ?? []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    load();
    loadVenues();
  }, [load, loadVenues]);

  // ── Filter ────────────────────────────────────────────────────────────────

  const visible = outreach.filter((o) => {
    if (filter === "sent")      return !!o.sent_at;
    if (filter === "drafts")    return !o.sent_at;
    if (filter === "responded") return !!o.response_received_at;
    return true;
  });

  // ── Log manual contact ────────────────────────────────────────────────────

  async function handleLogSubmit(form) {
    setSubmittingLog(true);
    setLogError(null);
    try {
      const res  = await fetch("/api/admin/outreach", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to log contact.");
      setShowLogForm(false);
      await load();
    } catch (e) {
      setLogError(e.message);
    } finally {
      setSubmittingLog(false);
    }
  }

  // ── Mark response ─────────────────────────────────────────────────────────

  async function handleConfirmRespond(id, notes) {
    setSubmitMap((m) => ({ ...m, [id]: true }));
    try {
      const res  = await fetch(`/api/admin/outreach/${id}/respond`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ responseNotes: notes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to record response.");
      setRespondingId(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitMap((m) => ({ ...m, [id]: false }));
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Outreach</h1>
          <p className="text-sm text-ink-muted mt-0.5">All inquiry attempts across all venues</p>
        </div>
        <button
          onClick={() => { setShowLogForm((v) => !v); setLogError(null); }}
          className="btn btn-outline flex-shrink-0"
        >
          {showLogForm ? "Cancel" : "Log manual contact"}
        </button>
      </div>

      {/* Log form */}
      {showLogForm && (
        <LogForm
          venues={venues}
          onSubmit={handleLogSubmit}
          onCancel={() => { setShowLogForm(false); setLogError(null); }}
          submitting={submittingLog}
          error={logError}
        />
      )}

      {/* Global error */}
      {error && (
        <div className="notice-error mb-5" role="alert">{error}</div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Filter tabs */}
          <FilterTabs filter={filter} setFilter={setFilter} outreach={outreach} />

          {/* List */}
          <div className="mt-2">
            {visible.length === 0 ? (
              <div className="py-16 text-center">
                <p className="font-semibold text-gray-700 mb-1">
                  {filter === "all"       ? "No outreach records yet" :
                   filter === "sent"      ? "No sent outreach" :
                   filter === "drafts"    ? "No drafts" :
                                           "No responses recorded"}
                </p>
                <p className="text-sm text-ink-subtle">
                  {filter === "all"
                    ? "Log a manual contact or draft an email from the Pipeline."
                    : "Switch to another tab to see records."}
                </p>
              </div>
            ) : (
              visible.map((record) => (
                <OutreachRow
                  key={record.id}
                  record={record}
                  respondingId={respondingId}
                  onMarkRespond={(id) => { setRespondingId(id); setError(null); }}
                  onCancelRespond={() => setRespondingId(null)}
                  onConfirmRespond={handleConfirmRespond}
                  submitMap={submitMap}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
