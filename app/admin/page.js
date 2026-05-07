"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  const [stats, setStats]                   = useState(null);
  const [fetchingPlaces, setFetchingPlaces] = useState(false);
  const [placesError, setPlacesError]       = useState(null);
  const [placesWebsite, setPlacesWebsite]   = useState(null);
  const [draftingOutreach, setDraftingOutreach] = useState(false);
  const [outreachDraft, setOutreachDraft]       = useState(null);
  const [outreachError, setOutreachError]       = useState(null);
  const [sendingOutreach, setSendingOutreach]   = useState(false);
  const [outreachSent, setOutreachSent]         = useState(false);
  const [outreachEventType, setOutreachEventType] = useState("teen driver safety training event");
  const [outreachOrgName, setOutreachOrgName]     = useState("Atlanta Region SCCA — Tire Rack Street Survival");
  const [scoreHistory, setScoreHistory]           = useState([]);
  const [loadingHistory, setLoadingHistory]       = useState(false);
  const [showHistory, setShowHistory]             = useState(false);
  const [showOverride, setShowOverride]           = useState(false);
  const [overrideScore, setOverrideScore]         = useState("");
  const [overrideNote, setOverrideNote]           = useState("");
  const [savingOverride, setSavingOverride]       = useState(false);

  const autoScoreFired = useRef(false);

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

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then((d) => { if (d.stats) setStats(d.stats); })
      .catch(() => {});
  }, []);

  // Auto-open and score a venue when redirected from /admin/venues/new with ?score=ID
  useEffect(() => {
    if (loading || venues.length === 0 || autoScoreFired.current) return;
    const params = new URLSearchParams(window.location.search);
    const scoreId = params.get("score");
    if (!scoreId) return;
    const venue = venues.find((v) => String(v.id) === scoreId);
    if (!venue) return;
    autoScoreFired.current = true;
    window.history.replaceState({}, "", "/admin");
    openEdit(venue);
    // Defer scoring one tick so state from openEdit settles first
    setTimeout(() => {
      setScoring(true);
      setScoreResult(null);
      setScoreError(null);
      fetch(`/api/admin/venues/${venue.id}/score`, { method: "POST" })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) throw new Error(data.error);
          setScoreResult(data.assessment);
          load();
        })
        .catch((e) => setScoreError(e.message))
        .finally(() => setScoring(false));
    }, 0);
  }, [loading, venues]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setDraftingOutreach(false);
    setOutreachDraft(null);
    setOutreachError(null);
    setSendingOutreach(false);
    setOutreachSent(false);
    setOutreachEventType("teen driver safety training event");
    setOutreachOrgName("Atlanta Region SCCA — Tire Rack Street Survival");
    setScoreHistory([]);
    setLoadingHistory(false);
    setShowHistory(false);
    setShowOverride(false);
    setOverrideScore("");
    setOverrideNote("");
    setSavingOverride(false);
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

  async function loadScoreHistory() {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/admin/venues/${selected.id}/assessments`);
      const data = await res.json();
      if (res.ok) setScoreHistory(data.assessments || []);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function saveOverride() {
    const score = parseInt(overrideScore, 10);
    if (isNaN(score) || score < 0 || score > 100) return;
    setSavingOverride(true);
    try {
      const res = await fetch(`/api/admin/venues/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custom_score: score, custom_score_note: overrideNote }),
      });
      const data = await res.json();
      if (res.ok) {
        setVenues((prev) => prev.map((v) => v.id === data.venue.id ? data.venue : v));
        setSelected(data.venue);
        setShowOverride(false);
      }
    } finally {
      setSavingOverride(false);
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

  async function draftOutreach() {
    setDraftingOutreach(true);
    setOutreachError(null);
    try {
      const res = await fetch(`/api/admin/venues/${selected.id}/draft-outreach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: outreachEventType, orgName: outreachOrgName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Drafting failed.");
      setOutreachDraft(data);
    } catch (e) {
      setOutreachError(e.message);
    } finally {
      setDraftingOutreach(false);
    }
  }

  async function sendOutreach() {
    if (!outreachDraft || !selected.owner_email) return;
    setSendingOutreach(true);
    try {
      const res = await fetch(`/api/admin/outreach/${outreachDraft.outreachId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: selected.owner_email,
          subject: outreachDraft.subject,
          body: outreachDraft.body,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed.");
      setOutreachSent(true);
      // Advance venue status to 'contacted'
      const patchRes = await fetch(`/api/admin/venues/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "contacted" }),
      });
      const patchData = await patchRes.json();
      if (patchRes.ok) {
        setVenues((prev) => prev.map((v) => v.id === patchData.venue.id ? patchData.venue : v));
        setSelected(patchData.venue);
        setEditForm({ ...patchData.venue });
      }
    } catch (e) {
      setOutreachError(e.message);
    } finally {
      setSendingOutreach(false);
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

      {/* Stats overview row */}
      <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mb-4">
        {[
          { key: "total",           label: "Total Venues" },
          { key: "scored",          label: "Scored" },
          { key: "ownerIdentified", label: "Owner ID'd" },
          { key: "outreachSent",    label: "Outreach Sent" },
          { key: "approved",        label: "Approved" },
        ].map(({ key, label }) => (
          <div key={key} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            {stats === null ? (
              <div className="animate-pulse bg-gray-100 h-8 w-16 rounded mb-2" />
            ) : (
              <div className={`text-2xl font-bold tabular-nums ${
                key === "approved" && stats[key] > 0 ? "text-green-700" : "text-gray-900"
              }`}>
                {stats[key] ?? 0}
              </div>
            )}
            <div className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle mt-1">
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Follow-up alert banner */}
      {stats?.followUpAlerts > 0 && (
        <div className="notice notice-warn mb-4">
          {stats.followUpAlerts} venue{stats.followUpAlerts === 1 ? "" : "s"} contacted over 7 days ago with no response.{" "}
          <a href="/admin/pipeline" className="font-semibold underline underline-offset-2">
            Review in Pipeline →
          </a>
        </div>
      )}

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
                    <div className="font-medium text-gray-900 flex items-center gap-2">
                      <span>{v.name}</span>
                      {v.needs_revisit && (
                        <span
                          title={v.revisit_reason || "Needs revisit"}
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200"
                        >
                          ⟳ revisit
                        </span>
                      )}
                    </div>
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

                    {/* Score breakdown */}
                    <div className="mt-3 space-y-2">
                      {[
                        { label: "AI Assessment", weight: "60%", value: scoreResult.suitability_score, color: "bg-teal-500" },
                        { label: "Lot Size", weight: "25%", value: scoreResult.lot_score, color: "bg-blue-400" },
                        { label: "Highway Access", weight: "15%", value: scoreResult.highway_score, color: "bg-purple-400" },
                      ].map(({ label, weight, value, color }) => (
                        <div key={label}>
                          <div className="flex justify-between mb-0.5">
                            <span className="text-[10px] text-gray-500">{label} <span className="text-gray-400">({weight})</span></span>
                            <span className="text-[10px] font-semibold tabular-nums text-gray-700">{value ?? "—"}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-gray-100">
                            <div
                              className={`h-1.5 rounded-full ${color} transition-all duration-500`}
                              style={{ width: `${value ?? 0}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {(scoreResult.surface_type || scoreResult.estimated_total_acres) && (
                      <div className="flex gap-3 mt-2 pt-2 border-t border-gray-200">
                        {scoreResult.surface_type && (
                          <span className="text-xs bg-gray-200 text-gray-700 rounded-full px-2 py-0.5 capitalize">
                            {scoreResult.surface_type}
                          </span>
                        )}
                        {scoreResult.estimated_total_acres && (
                          <span className="text-xs text-gray-600 tabular-nums">
                            ~{scoreResult.estimated_total_acres} acres
                          </span>
                        )}
                        {scoreResult.confidence && (
                          <span className="text-xs text-gray-400 ml-auto">{scoreResult.confidence} confidence</span>
                        )}
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

                  </div>
                )}

                {/* Score history */}
                {(selected.composite_score != null || scoreHistory.length > 0) && (
                  <div className="border-t border-gray-100 pt-3">
                    <button
                      onClick={() => { setShowHistory((v) => !v); if (!showHistory && scoreHistory.length === 0) loadScoreHistory(); }}
                      className="text-xs text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1"
                    >
                      {showHistory ? "▲" : "▼"} Score history
                      {loadingHistory && <span className="w-3 h-3 border border-gray-300 border-t-gray-600 rounded-full animate-spin ml-1" />}
                    </button>
                    {showHistory && scoreHistory.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {scoreHistory.map((a) => (
                          <div key={a.id} className="text-xs text-gray-600 flex items-center justify-between">
                            <span className="text-gray-400">{new Date(a.assessed_at).toLocaleDateString()}</span>
                            <span>{a.model?.replace("claude-", "").replace("-20251001","")}</span>
                            <span className={`font-semibold tabular-nums ${a.suitability_score >= 70 ? "text-green-700" : a.suitability_score >= 40 ? "text-yellow-700" : "text-red-700"}`}>
                              {a.suitability_score ?? "—"}
                            </span>
                            <span className="text-gray-400">{a.confidence}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {showHistory && scoreHistory.length === 0 && !loadingHistory && (
                      <p className="text-xs text-gray-400 mt-1">No assessments yet.</p>
                    )}
                  </div>
                )}

                {/* Re-analyze button */}
                {selected.composite_score != null && !scoring && (
                  <button
                    onClick={runAiScore}
                    className="text-xs text-gray-400 hover:text-teal-600 underline underline-offset-2"
                  >
                    Re-analyze with fresh satellite image
                  </button>
                )}

                {/* Manual score override */}
                <div className="border-t border-gray-100 pt-3">
                  {selected.custom_score != null ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle">Manual Override</span>
                        <p className="text-lg font-bold text-orange-600 tabular-nums">{selected.custom_score}</p>
                        {selected.custom_score_note && <p className="text-xs text-gray-500 italic">{selected.custom_score_note}</p>}
                      </div>
                      <button onClick={() => { setOverrideScore(String(selected.custom_score)); setOverrideNote(selected.custom_score_note || ""); setShowOverride(true); }} className="text-xs text-gray-400 hover:text-gray-600 underline">Edit</button>
                    </div>
                  ) : (
                    <button onClick={() => setShowOverride((v) => !v)} className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2">
                      {showOverride ? "Cancel override" : "Set manual score override"}
                    </button>
                  )}
                  {showOverride && (
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min="0" max="100"
                          className="input w-20 text-sm"
                          value={overrideScore}
                          onChange={(e) => setOverrideScore(e.target.value)}
                          placeholder="0–100"
                        />
                        <span className="text-xs text-gray-400">overrides AI score</span>
                      </div>
                      <input
                        type="text"
                        className="input w-full text-sm"
                        value={overrideNote}
                        onChange={(e) => setOverrideNote(e.target.value)}
                        placeholder="Reason for override (optional)"
                      />
                      <button
                        onClick={saveOverride}
                        disabled={savingOverride || !overrideScore}
                        className="btn btn-outline text-xs w-full"
                      >
                        {savingOverride ? "Saving…" : "Save override"}
                      </button>
                    </div>
                  )}
                </div>
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

              {/* Needs-revisit flag — orthogonal to pipeline status. */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                    checked={!!editForm.needs_revisit}
                    onChange={(e) => setEditForm((f) => ({
                      ...f,
                      needs_revisit: e.target.checked,
                      revisit_reason: e.target.checked ? (f.revisit_reason || "") : "",
                    }))}
                  />
                  <span className="text-sm font-medium text-gray-800">⟳ Needs revisit</span>
                </label>
                {editForm.needs_revisit && (
                  <div>
                    <label className="label">Reason <span className="text-red-600">*</span></label>
                    <textarea
                      rows={2}
                      required
                      className="input resize-none w-full text-sm"
                      placeholder='e.g., "winter image — re-check in spring"'
                      value={editForm.revisit_reason || ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, revisit_reason: e.target.value }))}
                    />
                    <p className="text-xs text-ink-subtle mt-1">
                      Pipeline status is unchanged.
                    </p>
                  </div>
                )}
              </div>

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

              {/* Outreach */}
              <div className="pt-2 border-t border-gray-100">
                <div className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle mb-2">Outreach</div>

                {!outreachDraft ? (
                  <div className="space-y-2">
                    <div>
                      <label className="label">Event type</label>
                      <input className="input w-full text-sm" value={outreachEventType} onChange={(e) => setOutreachEventType(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Organization name</label>
                      <input className="input w-full text-sm" value={outreachOrgName} onChange={(e) => setOutreachOrgName(e.target.value)} />
                    </div>
                    <button
                      onClick={draftOutreach}
                      disabled={draftingOutreach}
                      className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-60 transition-colors"
                    >
                      {draftingOutreach ? <><span className="w-4 h-4 border-2 border-gray-600 border-t-white rounded-full animate-spin" />Drafting…</> : "Draft inquiry email"}
                    </button>
                    {outreachError && <div className="notice notice-error text-xs" role="alert">{outreachError}</div>}
                  </div>
                ) : outreachSent ? (
                  <div className="text-sm text-green-700 font-medium">Email sent — venue moved to Contacted.</div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="label">Subject</label>
                      <input
                        className="input w-full text-sm"
                        value={outreachDraft.subject}
                        onChange={(e) => setOutreachDraft((d) => ({ ...d, subject: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="label">Body</label>
                      <textarea
                        className="input w-full text-sm"
                        rows={10}
                        value={outreachDraft.body}
                        onChange={(e) => setOutreachDraft((d) => ({ ...d, body: e.target.value }))}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setOutreachDraft(null); setOutreachError(null); }}
                        className="btn btn-outline text-sm flex-1"
                      >
                        Re-draft
                      </button>
                      <button
                        onClick={sendOutreach}
                        disabled={sendingOutreach || !selected.owner_email}
                        title={!selected.owner_email ? "Add owner email first" : ""}
                        className="btn btn-primary text-sm flex-1 flex items-center justify-center gap-2"
                      >
                        {sendingOutreach ? <span className="w-4 h-4 border-2 border-teal-200 border-t-white rounded-full animate-spin" /> : null}
                        {selected.owner_email ? `Send to ${selected.owner_email}` : "No owner email"}
                      </button>
                    </div>
                  </div>
                )}
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

              <div className="pt-2">
                <a
                  href={`/admin/venues/${selected?.id}/timeline`}
                  className="text-xs text-brand-600 hover:underline font-medium"
                >
                  View full timeline ↗
                </a>
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
