"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

// ─── Constants ────────────────────────────────────────────────────────────────

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(date) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day:   "numeric",
    year:  "numeric",
  });
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

function Th({ children }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold text-ink-muted uppercase tracking-wide whitespace-nowrap">
      {children}
    </th>
  );
}

function Td({ children, className = "" }) {
  return <td className={`px-4 py-3 text-sm text-gray-700 ${className}`}>{children}</td>;
}

function ExpandedDetail({ venue }) {
  return (
    <tr>
      <td colSpan={8} className="px-6 py-5 bg-gray-50 border-b border-gray-200">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">

          {/* Address */}
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle mb-1.5">
              Full Address
            </p>
            <p className="text-sm text-gray-800">
              {[venue.address, venue.city, venue.state, venue.zip]
                .filter(Boolean)
                .join(", ") || "—"}
            </p>
          </div>

          {/* Owner */}
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle mb-1.5">
              Owner / Contact
            </p>
            {venue.owner_name || venue.owner_email || venue.owner_phone ? (
              <div className="space-y-0.5 text-sm">
                {venue.owner_name && <p className="font-medium text-gray-900">{venue.owner_name}</p>}
                {venue.owner_email && (
                  <p>
                    <a href={`mailto:${venue.owner_email}`} className="text-brand-600 hover:underline text-xs">
                      {venue.owner_email}
                    </a>
                  </p>
                )}
                {venue.owner_phone && <p className="text-xs text-gray-600">{venue.owner_phone}</p>}
              </div>
            ) : (
              <p className="text-xs text-gray-400">Unknown</p>
            )}
          </div>

          {/* Activity */}
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle mb-1.5">
              Activity
            </p>
            <div className="space-y-1 text-sm text-gray-700">
              <p>
                <span className="font-medium tabular-nums">{venue.outreach_count ?? 0}</span>
                {" "}outreach{venue.outreach_count !== 1 ? "es" : ""}
              </p>
              <p>
                <span className="font-medium tabular-nums">{venue.notes_count ?? 0}</span>
                {" "}note{venue.notes_count !== 1 ? "s" : ""}
              </p>
              {venue.last_assessed_at && (
                <p className="text-xs text-ink-subtle">
                  Last assessed {fmt(venue.last_assessed_at)}
                </p>
              )}
            </div>
          </div>

          {/* Assessment notes */}
          {venue.assessment_notes && (
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle mb-1.5">
                Assessment Notes
              </p>
              <p className="text-sm text-gray-700 italic leading-relaxed">
                {venue.assessment_notes}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="sm:col-span-2 lg:col-span-3 flex gap-3 pt-1">
            <a
              href={`/api/admin/library/${venue.id}/export`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline text-xs py-1.5 px-3"
            >
              Export JSON
            </a>
            <Link
              href={`/admin/venues/${venue.id}/timeline`}
              className="btn btn-outline text-xs py-1.5 px-3"
            >
              View timeline
            </Link>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const [venues,     setVenues]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [search,     setSearch]     = useState("");
  const [filterState, setFilterState] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search)      params.set("q", search);
      if (filterState) params.set("state", filterState);
      const res  = await fetch(`/api/admin/library?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load library.");
      setVenues(data.venues);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [search, filterState]);

  useEffect(() => { load(); }, [load]);

  function toggleExpand(id) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function exportAll() {
    const params = new URLSearchParams();
    if (search)      params.set("q", search);
    if (filterState) params.set("state", filterState);
    params.set("export", "1");
    window.location.href = `/api/admin/library?${params}`;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Approved Venues</h1>
            {!loading && (
              <span className="text-sm text-ink-muted tabular-nums">{venues.length}</span>
            )}
          </div>
          <p className="text-sm text-ink-muted mt-0.5">
            Shared venue library — all approved sites across all events
          </p>
        </div>
        <button onClick={exportAll} className="btn btn-outline text-sm whitespace-nowrap flex-shrink-0">
          Export All
        </button>
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
        <select
          className="input w-28"
          value={filterState}
          onChange={(e) => setFilterState(e.target.value)}
        >
          <option value="">All states</option>
          {US_STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {(search || filterState) && (
          <button
            className="btn btn-outline text-xs"
            onClick={() => { setSearch(""); setFilterState(""); }}
          >
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div className="notice-error mb-5" role="alert">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
        </div>
      ) : venues.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <p className="font-semibold text-gray-700 mb-1">No approved venues yet</p>
          <p className="text-sm text-ink-muted">
            Approved venues from the pipeline appear here automatically
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <Th>Name</Th>
                <Th>Location</Th>
                <Th>Size</Th>
                <Th>Score</Th>
                <Th>Type</Th>
                <Th>Owner</Th>
                <Th>AI Score</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {venues.map((v) => (
                <>
                  <tr
                    key={v.id}
                    onClick={() => toggleExpand(v.id)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <Td>
                      <div className="font-medium text-gray-900">{v.name}</div>
                      {v.address && (
                        <div className="text-xs text-ink-subtle truncate max-w-[180px]">
                          {v.address}
                        </div>
                      )}
                    </Td>
                    <Td>{[v.city, v.state].filter(Boolean).join(", ") || "—"}</Td>
                    <Td>
                      {v.estimated_acres != null
                        ? <span className="tabular-nums">{v.estimated_acres} ac</span>
                        : "—"}
                    </Td>
                    <Td><ScorePill score={v.composite_score} /></Td>
                    <Td>{v.lot_type ? v.lot_type.replace(/_/g, " ") : "—"}</Td>
                    <Td>
                      {v.owner_name ? (
                        <div>
                          <div className="text-xs font-medium">{v.owner_name}</div>
                          {v.owner_email && (
                            <div className="text-xs text-ink-subtle truncate max-w-[130px]">
                              {v.owner_email}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Unknown</span>
                      )}
                    </Td>
                    <Td><ScorePill score={v.ai_score} /></Td>
                    <Td>
                      <div
                        className="flex items-center gap-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <a
                          href={`/api/admin/library/${v.id}/export`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand-600 hover:underline font-medium"
                        >
                          Export
                        </a>
                        <Link
                          href={`/admin/venues/${v.id}/timeline`}
                          className="text-xs text-brand-600 hover:underline font-medium"
                        >
                          Timeline
                        </Link>
                      </div>
                    </Td>
                  </tr>
                  {expandedId === v.id && (
                    <ExpandedDetail key={`${v.id}-detail`} venue={v} />
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
