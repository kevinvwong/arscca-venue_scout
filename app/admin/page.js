"use client";

import { useEffect, useState, useCallback } from "react";
import { getAssessorUrl, hasAssessorLink } from "@/lib/assessor-links";

const STATUSES = [
  "candidate", "shortlisted", "contacted", "responded",
  "site_visit", "approved", "declined", "archived",
];

const LOT_TYPES = [
  { value: "parking_lot",       label: "Parking Lot" },
  { value: "fairground",        label: "Fairground" },
  { value: "racetrack",         label: "Racetrack" },
  { value: "stadium",           label: "Stadium" },
  { value: "convention_center", label: "Convention Center" },
  { value: "other",             label: "Other" },
];

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC",
  "ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

function statusLabel(s) {
  return s === "site_visit" ? "Site Visit" : s.charAt(0).toUpperCase() + s.slice(1);
}

function StatusBadge({ status }) {
  return (
    <span className={`badge-${status === "site_visit" ? "site-visit" : status}`}>
      {statusLabel(status)}
    </span>
  );
}

function ScorePill({ score }) {
  if (score == null) return <span className="text-xs text-gray-400">—</span>;
  const color = score >= 70 ? "text-green-700 bg-green-50" :
                score >= 40 ? "text-yellow-700 bg-yellow-50" :
                              "text-red-700 bg-red-50";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${color}`}>
      {score}
    </span>
  );
}

export default function VenuesPage() {
  const [venues, setVenues]             = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterState, setFilterState]   = useState("");
  const [search, setSearch]             = useState("");
  const [selected, setSelected]         = useState(null);
  const [saving, setSaving]             = useState(false);
  const [saveError, setSaveError]       = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [editForm, setEditForm]         = useState({});
  const [scoring, setScoring]           = useState(false);
  const [scoreResult, setScoreResult]   = useState(null);
  const [scoreError, setScoreError]     = useState(null);
  const [fetchingPlaces, setFetchingPlaces] = useState(false);
  const [placesError, setPlacesError]       = useState(null);
  const [placesWebsite, setPlacesWebsite]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      if (filterState)  params.set("state", filterState);
      if (search)       params.set("q", search);
      const res  = await fetch(`/api/admin/venues?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load venues.");
      setVenues(data.venues);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterState, search]);

  useEffect(() => { load(); }, [load]);

  function openEdit(venue) {
    setSelected(venue);
    setEditForm({ ...venue });
    setSaveError("");
    setDeleteConfirm(false);
    setScoring(false);
    setScoreResult(null);
    setScoreError(null);
    setFetchingPlaces(false);
    setPlacesError(null);
    setPlacesWebsite(null);
  }

  function closeEdit() {
    setSelected(null);
    setEditForm({});
    setDeleteConfirm(false);
  }

  async function save() {
    setSaving(true);
    setSaveError("");
    try {
      const res  = await fetch(`/api/admin/venues/${selected.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed.");
      setVenues((prev) => prev.map((v) => v.id === data.venue.id ? data.venue : v));
      setSelected(data.venue);
      setEditForm({ ...data.venue });
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteVenue() {
    setSaving(true);
    try {
      await fetch(`/api/admin/venues/${selected.id}`, { method: "DELETE" });
      setVenues((prev) => prev.filter((v) => v.id !== selected.id));
      closeEdit();
    } finally {
      setSaving(false);
    }
  }

  async function runAiScore() {
    setScoring(true);
    setScoreResult(null);
    setScoreError(null);
    try {
      const res  = await fetch(`/api/admin/venues/${selected.id}/score`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scoring failed.");
      setScoreResult(data.assessment);
      // Reload venues list so composite_score pill updates in the table
      load();
    } catch (e) {
      setScoreError(e.message);
    } finally {
      setScoring(false);
    }
  }

  async function fetchPlacesDetails() {
    setFetchingPlaces(true);
    setPlacesError(null);
    try {
      const res = await fetch(`/api/admin/venues/${selected.id}/places-details`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch details.");
      // Auto-populate editForm fields if they're currently empty
      setEditForm((prev) => ({
        ...prev,
        owner_phone: prev.owner_phone || data.phone || prev.owner_phone,
        owner_source: prev.owner_source || (data.phone || data.website ? "google_places" : prev.owner_source),
      }));
      if (data.website) setPlacesWebsite(data.website);
    } catch (e) {
      setPlacesError(e.message);
    } finally {
      setFetchingPlaces(false);
    }
  }

  const counts = STATUSES.reduce((acc, s) => {
    acc[s] = venues.filter((v) => v.status === s).length;
    return acc;
  }, {});

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Venues</h1>
          <p className="text-sm text-ink-muted mt-0.5">{venues.length} venues in pipeline</p>
        </div>
        <a href="/admin/venues/new" className="btn-primary">+ Add venue</a>
      </div>

      {/* Status summary pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {STATUSES.filter((s) => counts[s] > 0).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(filterStatus === s ? "" : s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold border transition-colors ${
              filterStatus === s
                ? "bg-brand-500 border-brand-500 text-white"
                : "bg-white border-gray-200 text-gray-600 hover:border-brand-400"
            }`}
          >
            {statusLabel(s)} <span className="ml-1 opacity-70">{counts[s]}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="search"
          placeholder="Search venues…"
          className="input w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input w-44" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
        <select className="input w-28" value={filterState} onChange={(e) => setFilterState(e.target.value)}>
          <option value="">All states</option>
          {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {(filterStatus || filterState || search) && (
          <button
            className="btn-outline text-xs"
            onClick={() => { setFilterStatus(""); setFilterState(""); setSearch(""); }}
          >
            Clear filters
          </button>
        )}
      </div>

      {error && <div className="notice-error mb-4" role="alert">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
        </div>
      ) : venues.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <p className="font-semibold text-gray-700 mb-1">No venues yet</p>
          <p className="text-sm text-ink-muted mb-4">Add your first candidate venue to start building your pipeline.</p>
          <a href="/admin/venues/new" className="btn-primary">+ Add venue</a>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <Th>Name</Th>
                <Th>Location</Th>
                <Th>Type</Th>
                <Th>Acres</Th>
                <Th>Score</Th>
                <Th>Status</Th>
                <Th>Owner</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {venues.map((v) => (
                <tr key={v.id} className="hover:bg-gray-50">
                  <Td>
                    <div className="font-medium text-gray-900">{v.name}</div>
                    {v.address && (
                      <div className="text-xs text-ink-subtle truncate max-w-[200px]">{v.address}</div>
                    )}
                  </Td>
                  <Td>{[v.city, v.state].filter(Boolean).join(", ") || "—"}</Td>
                  <Td>{v.lot_type ? v.lot_type.replace(/_/g, " ") : "—"}</Td>
                  <Td>{v.estimated_acres ? `${v.estimated_acres} ac` : "—"}</Td>
                  <Td><ScorePill score={v.composite_score} /></Td>
                  <Td><StatusBadge status={v.status} /></Td>
                  <Td>
                    {v.owner_name ? (
                      <div>
                        <div className="text-xs font-medium">{v.owner_name}</div>
                        {v.owner_email && (
                          <div className="text-xs text-ink-subtle truncate max-w-[140px]">{v.owner_email}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Unknown</span>
                    )}
                  </Td>
                  <Td>
                    <button
                      onClick={() => openEdit(v)}
                      className="text-xs text-brand-600 hover:underline font-medium"
                    >
                      Edit
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit panel (right drawer) */}
      {selected && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={closeEdit} />
          <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-xl z-50 overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="font-semibold text-gray-900 truncate">{selected.name}</h2>
              <button onClick={closeEdit} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* AI Scoring */}
              <div className="pb-1">
                <button
                  onClick={runAiScore}
                  disabled={scoring}
                  className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-60 transition-colors"
                >
                  {scoring ? (
                    <>
                      <span className="w-4 h-4 border-2 border-teal-200 border-t-white rounded-full animate-spin inline-block" />
                      Scoring…
                    </>
                  ) : (
                    "Score with AI"
                  )}
                </button>

                {scoreError && (
                  <div className="mt-2 notice-error text-xs" role="alert">{scoreError}</div>
                )}

                {scoreResult && (
                  <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2 text-sm">
                    <div className="flex items-center gap-4">
                      <div>
                        <span className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle block mb-0.5">
                          AI Score
                        </span>
                        <span className={`text-2xl font-bold tabular-nums ${
                          scoreResult.suitability_score >= 70 ? "text-green-700" :
                          scoreResult.suitability_score >= 40 ? "text-yellow-700" :
                          "text-red-700"
                        }`}>
                          {scoreResult.suitability_score ?? "—"}
                        </span>
                      </div>
                      {scoreResult.composite_score != null && (
                        <div>
                          <span className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle block mb-0.5">
                            Composite
                          </span>
                          <span className={`text-2xl font-bold tabular-nums ${
                            scoreResult.composite_score >= 70 ? "text-green-700" :
                            scoreResult.composite_score >= 40 ? "text-yellow-700" :
                            "text-red-700"
                          }`}>
                            {scoreResult.composite_score}
                          </span>
                        </div>
                      )}
                    </div>

                    {scoreResult.surface_type && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle">
                          Surface
                        </span>
                        <span className="inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
                          {scoreResult.surface_type}
                        </span>
                      </div>
                    )}

                    {scoreResult.estimated_total_acres != null && (
                      <div>
                        <span className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle">
                          Est. Acres
                        </span>
                        <span className="ml-2 tabular-nums text-gray-800">
                          {scoreResult.estimated_total_acres}
                        </span>
                      </div>
                    )}

                    {scoreResult.obstacle_types?.length > 0 && (
                      <div>
                        <span className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle">
                          Obstacles
                        </span>
                        <span className="ml-2 text-gray-700">
                          {scoreResult.obstacle_types.join(", ")}
                        </span>
                      </div>
                    )}

                    {scoreResult.assessment_notes && (
                      <p className="italic text-gray-600 text-xs leading-relaxed">
                        {scoreResult.assessment_notes}
                      </p>
                    )}

                    {scoreResult.confidence && (
                      <p className="text-[11px] text-ink-subtle">
                        Confidence: {scoreResult.confidence}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {saveError && <div className="notice-error" role="alert">{saveError}</div>}

              <Field label="Status">
                <select
                  className="input"
                  value={editForm.status || "candidate"}
                  onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                </select>
              </Field>

              <Field label="Name">
                <input
                  className="input"
                  value={editForm.name || ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="City">
                  <input
                    className="input"
                    value={editForm.city || ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))}
                  />
                </Field>
                <Field label="State">
                  <select
                    className="input"
                    value={editForm.state || ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, state: e.target.value }))}
                  >
                    <option value="">—</option>
                    {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Address">
                <input
                  className="input"
                  value={editForm.address || ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Lot type">
                  <select
                    className="input"
                    value={editForm.lot_type || ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, lot_type: e.target.value }))}
                  >
                    <option value="">—</option>
                    {LOT_TYPES.map(({ value, label }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Est. acres">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    className="input"
                    value={editForm.estimated_acres || ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, estimated_acres: e.target.value }))}
                  />
                </Field>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle mb-3">
                  Owner / Contact
                </p>
                <div className="space-y-3">
                  {/* Owner identification tools */}
                  <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle">
                        Owner Identification
                      </span>
                      {/* Owner identified badge — shown when owner_email or owner_phone is filled */}
                      {(editForm.owner_email || editForm.owner_phone) && (
                        <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                          Owner identified
                        </span>
                      )}
                    </div>

                    {/* Auto-fill from Google Places */}
                    {selected.google_place_id && (
                      <div>
                        <button
                          onClick={fetchPlacesDetails}
                          disabled={fetchingPlaces}
                          className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1.5"
                        >
                          {fetchingPlaces && <span className="w-3 h-3 border border-brand-300 border-t-brand-600 rounded-full animate-spin inline-block" />}
                          Auto-fill from Google Places
                        </button>
                        {placesWebsite && (
                          <p className="text-xs text-gray-500 mt-1">
                            Website: <a href={placesWebsite} target="_blank" rel="noopener noreferrer" className="text-brand-600 underline">{placesWebsite}</a>
                          </p>
                        )}
                        {placesError && (
                          <p className="text-xs text-red-600 mt-1">{placesError}</p>
                        )}
                      </div>
                    )}

                    {/* County assessor link */}
                    {hasAssessorLink(editForm.state) && (
                      <div>
                        <a
                          href={getAssessorUrl(editForm.state)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand-600 hover:text-brand-700 font-medium underline underline-offset-2"
                        >
                          Search {editForm.state} county assessor records ↗
                        </a>
                        <p className="text-xs text-gray-400 mt-0.5">Look up the property owner in public records</p>
                      </div>
                    )}
                  </div>

                  <Field label="Owner name">
                    <input
                      className="input"
                      value={editForm.owner_name || ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, owner_name: e.target.value }))}
                    />
                  </Field>
                  <Field label="Owner email">
                    <input
                      type="email"
                      className="input"
                      value={editForm.owner_email || ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, owner_email: e.target.value }))}
                    />
                  </Field>
                  <Field label="Owner phone">
                    <input
                      type="tel"
                      className="input"
                      value={editForm.owner_phone || ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, owner_phone: e.target.value }))}
                    />
                  </Field>
                </div>
              </div>

              <Field label="Notes">
                <textarea
                  rows={3}
                  className="input resize-none"
                  value={editForm.notes || ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </Field>

              <div className="flex gap-3 pt-2">
                <button onClick={save} disabled={saving} className="btn-primary flex-1">
                  {saving ? "Saving…" : "Save changes"}
                </button>
                <button onClick={closeEdit} className="btn-outline">Cancel</button>
              </div>

              <div className="pt-4 border-t border-gray-100">
                {deleteConfirm ? (
                  <div className="flex gap-2 items-center">
                    <span className="text-xs text-red-700 flex-1">Delete this venue permanently?</span>
                    <button
                      onClick={deleteVenue}
                      disabled={saving}
                      className="btn-danger-outline text-xs py-1.5 px-3"
                    >
                      Confirm delete
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(false)}
                      className="btn-outline text-xs py-1.5 px-3"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(true)}
                    className="btn-danger-outline text-xs w-full"
                  >
                    Delete venue
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Th({ children }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold text-ink-muted uppercase tracking-wide whitespace-nowrap">
      {children}
    </th>
  );
}

function Td({ children }) {
  return <td className="px-4 py-3 text-sm text-gray-700">{children}</td>;
}

function Field({ label, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
