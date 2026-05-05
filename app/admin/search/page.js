"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Script from "next/script";

const RADIUS_OPTIONS = [
  { label: "5 mi",  value: 8047 },
  { label: "10 mi", value: 16093 },
  { label: "15 mi", value: 24140 },
  { label: "25 mi", value: 40234 },
];

const PIN_COLORS = {
  default:  "#6b7280",
  approved: "#16a34a",
  active:   "#d97706",
  declined: "#dc2626",
  added:    "#14b8a6",
};

const ACTIVE_STATUSES = new Set(["shortlisted", "contacted", "responded", "site_visit"]);
const DECLINED_STATUSES = new Set(["declined", "archived"]);

function pinColor(existingStatus, inAddedSet) {
  if (inAddedSet) return PIN_COLORS.added;
  if (!existingStatus) return PIN_COLORS.default;
  if (existingStatus === "approved") return PIN_COLORS.approved;
  if (ACTIVE_STATUSES.has(existingStatus)) return PIN_COLORS.active;
  if (DECLINED_STATUSES.has(existingStatus)) return PIN_COLORS.declined;
  return PIN_COLORS.default;
}

function makeMarkerIcon(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="32" viewBox="0 0 24 32">
    <path d="M12 0C5.373 0 0 5.373 0 12c0 8.25 12 20 12 20S24 20.25 24 12C24 5.373 18.627 0 12 0z"
      fill="${color}" stroke="white" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="4" fill="white"/>
  </svg>`;
  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    scaledSize: { width: 24, height: 32 },
    anchor: { x: 12, y: 32 },
  };
}

function statusBadgeClass(status) {
  if (status === "approved") return "bg-green-100 text-green-800";
  if (ACTIVE_STATUSES.has(status)) return "bg-yellow-100 text-yellow-800";
  if (DECLINED_STATUSES.has(status)) return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-700";
}

function statusLabel(s) {
  return s === "site_visit" ? "Site Visit" : s.charAt(0).toUpperCase() + s.slice(1);
}

function getLotDisplayName(candidate) {
  if (candidate.name) return candidate.name;
  const tags = candidate.tags || {};
  if (tags.amenity === "parking") return "Parking Lot";
  if (tags.leisure === "stadium") return "Stadium";
  if (tags.leisure === "sports_centre") return "Sports Center";
  if (tags.leisure === "fairground") return "Fairground";
  if (tags.leisure === "race_track") return "Racetrack";
  if (tags.amenity === "events_venue") return "Events Venue";
  if (tags.landuse === "commercial") return "Commercial Area";
  if (tags.landuse === "industrial") return "Industrial Area";
  if (tags.landuse === "retail") return "Retail Area";
  return "Unnamed Lot";
}

function ScoreBar({ label, value, max = 100 }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  const color = pct >= 70 ? "bg-green-500" : pct >= 45 ? "bg-yellow-500" : "bg-red-400";
  return (
    <div>
      <div className="flex justify-between items-center mb-0.5">
        <span className="text-[10px] uppercase tracking-widest font-semibold text-gray-400">{label}</span>
        <span className="text-xs font-bold tabular-nums text-gray-700">{value ?? "—"}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function SearchPage() {
  const [searchInput, setSearchInput]     = useState("");
  const [radius, setRadius]               = useState(16093);
  const [places, setPlaces]               = useState([]);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [addedOsmIds, setAddedOsmIds]     = useState(new Set());
  const [mapLoaded, setMapLoaded]         = useState(false);
  const [searching, setSearching]         = useState(false);
  const [error, setError]                 = useState(null);
  const [addingToDb, setAddingToDb]       = useState(false);
  const [addedMsg, setAddedMsg]           = useState(false);
  const autoSearchTimer                   = useRef(null);

  const [profiles, setProfiles]           = useState([]);
  const [lastGeoLat, setLastGeoLat]       = useState(null);
  const [lastGeoLng, setLastGeoLng]       = useState(null);
  const [showSaveForm, setShowSaveForm]   = useState(false);
  const [saveName, setSaveName]           = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const mapRef      = useRef(null);
  const mapInstance = useRef(null);
  const markersRef  = useRef([]);
  const mapsApi     = useRef(null);

  function initMap() {
    if (!mapRef.current || mapInstance.current) return;
    try {
      const gmaps = window.google.maps;
      mapsApi.current = gmaps;
      const map = new gmaps.Map(mapRef.current, {
        center: { lat: 33.749, lng: -84.388 },
        zoom: 11,
        mapTypeId: "roadmap",
        mapTypeControl: true,
        mapTypeControlOptions: {
          style: gmaps.MapTypeControlStyle.HORIZONTAL_BAR,
          mapTypeIds: ["roadmap", "satellite"],
        },
        fullscreenControl: false,
        streetViewControl: false,
      });
      mapInstance.current = map;
      setMapLoaded(true);
    } catch (err) {
      setError("Failed to initialize map: " + err.message);
    }
  }

  useEffect(() => {
    fetch("/api/admin/search/profiles")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.profiles)) setProfiles(d.profiles); })
      .catch(() => {});
  }, []);

  const refreshMarkerIcon = useCallback((osmId, newAddedSet) => {
    markersRef.current.forEach((m) => {
      if (m._osmId === osmId) {
        const place = places.find((p) => p.osmId === osmId);
        const icon = makeMarkerIcon(pinColor(place?.existingStatus, newAddedSet.has(osmId)));
        m.setIcon({
          url: icon.url,
          scaledSize: new mapsApi.current.Size(icon.scaledSize.width, icon.scaledSize.height),
          anchor: new mapsApi.current.Point(icon.anchor.x, icon.anchor.y),
        });
      }
    });
  }, [places]);

  useEffect(() => {
    if (!mapInstance.current || !mapsApi.current) return;
    const gmaps = mapsApi.current;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    if (places.length === 0) return;

    const bounds = new gmaps.LatLngBounds();

    places.forEach((place) => {
      const iconDef = makeMarkerIcon(pinColor(place.existingStatus, addedOsmIds.has(place.osmId)));
      const marker = new gmaps.Marker({
        position: { lat: place.lat, lng: place.lng },
        map: mapInstance.current,
        title: getLotDisplayName(place),
        icon: {
          url: iconDef.url,
          scaledSize: new gmaps.Size(iconDef.scaledSize.width, iconDef.scaledSize.height),
          anchor: new gmaps.Point(iconDef.anchor.x, iconDef.anchor.y),
        },
      });
      marker._osmId = place.osmId;
      marker.addListener("click", () => {
        setSelectedPlace(place);
        setAddedMsg(false);
        mapInstance.current.panTo({ lat: place.lat, lng: place.lng });
      });
      markersRef.current.push(marker);
      bounds.extend({ lat: place.lat, lng: place.lng });
    });

    mapInstance.current.fitBounds(bounds);
  }, [places]);

  const handleSearch = useCallback(async (overrideQuery) => {
    const q = (overrideQuery ?? searchInput).trim();
    if (!q) return;

    setSearching(true);
    setError(null);
    setSelectedPlace(null);
    setAddedMsg(false);

    try {
      const geoRes = await fetch(
        `/api/admin/search/geocode?address=${encodeURIComponent(q)}`
      );
      const geoData = await geoRes.json();
      if (!geoRes.ok) throw new Error(geoData.error || "Geocode failed");

      const { lat, lng } = geoData;
      setLastGeoLat(lat);
      setLastGeoLng(lng);
      setShowSaveForm(false);

      const scanRes = await fetch(
        `/api/admin/search?lat=${lat}&lng=${lng}&radius=${radius}`
      );
      const scanData = await scanRes.json();
      if (!scanRes.ok) throw new Error(scanData.error || "Area scan failed");

      setPlaces(scanData.places || []);

      if ((scanData.places || []).length === 0) {
        setError("No candidate lots found in this area. Try a larger radius.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }, [searchInput, radius]);

  const handleAddToPipeline = useCallback(async () => {
    if (!selectedPlace) return;
    setAddingToDb(true);

    const displayName = getLotDisplayName(selectedPlace);

    try {
      const res = await fetch("/api/admin/venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:                 displayName,
          address:              selectedPlace.address     ?? null,
          lat:                  selectedPlace.lat,
          lng:                  selectedPlace.lng,
          google_place_id:      selectedPlace.osmId,
          source:               "osm",
          status:               "candidate",
          estimated_acres:      selectedPlace.estimatedAcres   ?? null,
          surface:              selectedPlace.surfaceType      ?? null,
          highway_access_score: selectedPlace.highwayScore     ?? null,
          owner_name:           selectedPlace.ownerName        ?? null,
          owner_phone:          selectedPlace.ownerPhone       ?? null,
          owner_email:          selectedPlace.ownerEmail       ?? null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add venue");

      const newSet = new Set(addedOsmIds);
      newSet.add(selectedPlace.osmId);
      setAddedOsmIds(newSet);
      setAddedMsg(true);
      refreshMarkerIcon(selectedPlace.osmId, newSet);

      // Store the AI assessment if we have scores
      const venueId = data.venue?.id;
      if (venueId && selectedPlace.aiScore != null) {
        fetch(`/api/admin/venues/${venueId}/score`, { method: "POST" }).catch(() => {});
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingToDb(false);
    }
  }, [selectedPlace, addedOsmIds, refreshMarkerIcon]);

  const saveProfile = useCallback(async () => {
    if (!lastGeoLat || !lastGeoLng || !saveName.trim()) return;
    setSavingProfile(true);
    try {
      const res = await fetch("/api/admin/search/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveName.trim(),
          center_lat: lastGeoLat,
          center_lng: lastGeoLng,
          radius_miles: Math.round(radius / 1609),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setProfiles((prev) => [data.profile, ...prev]);
        setShowSaveForm(false);
        setSaveName("");
      }
    } finally {
      setSavingProfile(false);
    }
  }, [lastGeoLat, lastGeoLng, saveName, radius]);

  const deleteProfile = useCallback(async (id) => {
    await fetch(`/api/admin/search/profiles/${id}`, { method: "DELETE" });
    setProfiles((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const replayProfile = useCallback((profile) => {
    setSearchInput(profile.name);
    setRadius((profile.radius_miles || 10) * 1609);
    fetch(`/api/admin/search/profiles/${profile.id}`, { method: "PATCH" }).catch(() => {});
    fetch(
      `/api/admin/search?lat=${profile.center_lat}&lng=${profile.center_lng}&radius=${(profile.radius_miles || 10) * 1609}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (d.places) {
          setPlaces(d.places);
          setLastGeoLat(Number(profile.center_lat));
          setLastGeoLng(Number(profile.center_lng));
        }
      })
      .catch(() => {});
  }, []);

  const alreadyAdded = selectedPlace && addedOsmIds.has(selectedPlace.osmId);
  const alreadyInDb  = selectedPlace && selectedPlace.existingStatus != null;

  return (
    <>
    <Script
      src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=maps,marker&callback=Function.prototype`}
      strategy="afterInteractive"
      onLoad={initMap}
    />
    <div className="flex flex-col" style={{ height: "calc(100vh - 112px)" }}>
      {/* Search bar */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-gray-200 shrink-0">
        <input
          type="text"
          className="input flex-1 min-w-0"
          placeholder="City or ZIP code"
          value={searchInput}
          onChange={(e) => {
            const val = e.target.value;
            setSearchInput(val);
            if (/^\d{5}(-\d{4})?$/.test(val.trim())) {
              clearTimeout(autoSearchTimer.current);
              autoSearchTimer.current = setTimeout(() => handleSearch(val.trim()), 400);
            }
          }}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />

        <select
          className="input w-28 shrink-0"
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
        >
          {RADIUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <button
          className="btn btn-primary shrink-0 flex items-center gap-2"
          onClick={handleSearch}
          disabled={searching || !searchInput.trim()}
        >
          {searching && (
            <span className="w-5 h-5 border-2 border-teal-200 border-t-teal-500 rounded-full animate-spin" />
          )}
          {searching ? "Analyzing…" : "Search"}
        </button>
      </div>

      {/* Saved searches strip */}
      {(profiles.length > 0 || (places.length > 0 && lastGeoLat)) && (
        <div className="flex items-center gap-2 px-6 py-2 bg-gray-50 border-b border-gray-100 shrink-0 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle shrink-0">Saved</span>
          {profiles.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-white border border-gray-200 px-3 py-0.5 text-xs font-medium text-gray-700 hover:border-teal-400 transition-colors">
              <button onClick={() => replayProfile(p)} className="hover:text-teal-700">{p.name}</button>
              <button onClick={() => deleteProfile(p.id)} className="text-gray-300 hover:text-red-400 ml-0.5 leading-none">×</button>
            </span>
          ))}
          {places.length > 0 && lastGeoLat && !showSaveForm && (
            <button
              onClick={() => { setShowSaveForm(true); setSaveName(searchInput.trim()); }}
              className="rounded-full border border-dashed border-gray-300 px-3 py-0.5 text-xs text-gray-400 hover:text-teal-600 hover:border-teal-400 transition-colors"
            >
              + Save this search
            </button>
          )}
          {showSaveForm && (
            <span className="inline-flex items-center gap-1.5">
              <input
                autoFocus
                className="input text-xs py-0.5 px-2 w-40 h-7"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveProfile(); if (e.key === "Escape") setShowSaveForm(false); }}
                placeholder="Search name"
              />
              <button onClick={saveProfile} disabled={savingProfile || !saveName.trim()} className="text-xs text-teal-600 font-semibold hover:text-teal-700">
                {savingProfile ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setShowSaveForm(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="notice notice-error mx-6 mt-3 shrink-0" role="alert">{error}</div>
      )}

      {/* Map + detail panel */}
      <div className="flex flex-1 min-h-0 relative">
        <div ref={mapRef} className="flex-1 min-w-0 h-full" />

        {/* Empty state */}
        {!searching && places.length === 0 && !error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-white/90 rounded-xl px-8 py-6 text-center shadow-sm border border-gray-200 max-w-sm">
              <p className="text-sm font-medium text-gray-700">
                Search a city or ZIP to scan for large lots
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Satellite imagery analyzed automatically for each candidate
              </p>
            </div>
          </div>
        )}

        {/* Scanning overlay */}
        {searching && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-white/90 rounded-xl px-8 py-6 text-center shadow-sm border border-gray-200 max-w-sm">
              <div className="flex justify-center mb-3">
                <span className="w-8 h-8 border-2 border-teal-200 border-t-teal-500 rounded-full animate-spin" />
              </div>
              <p className="text-sm font-medium text-gray-700">Scanning area…</p>
              <p className="text-xs text-gray-400 mt-1">
                Analyzing satellite imagery for large paved lots
              </p>
            </div>
          </div>
        )}

        {/* Detail panel */}
        {selectedPlace && (
          <div className="w-80 shrink-0 bg-white border-l border-gray-200 overflow-y-auto flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between p-4 border-b border-gray-100">
              <div className="flex-1 min-w-0 pr-2">
                <p className="text-lg font-semibold text-gray-900 leading-snug">
                  {getLotDisplayName(selectedPlace)}
                </p>
                {selectedPlace.address ? (
                  <p className="text-sm text-gray-500 mt-0.5 leading-snug">
                    {selectedPlace.address}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
                    {selectedPlace.lat.toFixed(5)}, {selectedPlace.lng.toFixed(5)}
                  </p>
                )}
              </div>
              <button
                className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0 mt-0.5"
                onClick={() => { setSelectedPlace(null); setAddedMsg(false); }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Satellite thumbnail */}
            <div className="px-4 pt-4">
              <img
                src={`https://maps.googleapis.com/maps/api/staticmap?center=${selectedPlace.lat},${selectedPlace.lng}&zoom=17&size=280x180&maptype=satellite&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`}
                alt="Satellite view"
                width={280}
                height={180}
                className="rounded-lg w-full object-cover"
              />
            </div>

            {/* Score card */}
            <div className="mx-4 mt-3 px-3 py-3 rounded-lg bg-gray-50 border border-gray-200 space-y-2.5">
              {/* Acreage — primary metric */}
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] uppercase tracking-widest font-semibold text-gray-400">Est. Acres</span>
                <span className="text-2xl font-bold tabular-nums text-gray-900 leading-none">
                  {selectedPlace.estimatedAcres != null
                    ? selectedPlace.estimatedAcres.toFixed(1)
                    : selectedPlace.osmAcres?.toFixed(1) ?? "—"}
                </span>
              </div>

              {/* Composite score + surface */}
              <div className="flex items-center justify-between pt-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-widest font-semibold text-gray-400">Score</span>
                  <span className={`text-lg font-bold tabular-nums leading-none ${
                    (selectedPlace.compositeScore ?? 0) >= 70 ? "text-green-700" :
                    (selectedPlace.compositeScore ?? 0) >= 45 ? "text-yellow-700" : "text-red-600"
                  }`}>
                    {selectedPlace.compositeScore ?? "—"}
                  </span>
                </div>
                <span className="inline-block bg-gray-200 text-gray-700 text-xs rounded-full px-2 py-0.5 capitalize">
                  {selectedPlace.surfaceType ?? "surface unknown"}
                </span>
              </div>

              <ScoreBar label="Size" value={selectedPlace.estimatedAcres != null
                ? Math.min(100, Math.round((selectedPlace.estimatedAcres / 60) * 100))
                : null} />
              <ScoreBar label="AI Suitability" value={selectedPlace.aiScore} />
              <div>
                <ScoreBar label="Highway Access" value={selectedPlace.highwayScore} />
                {selectedPlace.minutesToHighway != null && (
                  <p className="text-[10px] text-gray-400 mt-0.5 tabular-nums">
                    {selectedPlace.minutesToHighway} min to highway
                  </p>
                )}
              </div>
            </div>

            {/* Obstacles */}
            {selectedPlace.obstacles?.length > 0 && (
              <div className="px-4 pt-3">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1.5">Obstacles</p>
                <div className="flex flex-wrap gap-1">
                  {selectedPlace.obstacles.map((o, i) => (
                    <span key={i} className="bg-orange-50 text-orange-700 border border-orange-200 text-xs rounded-full px-2 py-0.5">
                      {o}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* AI notes */}
            {selectedPlace.assessmentNotes && (
              <div className="px-4 pt-3">
                <p className="text-xs text-gray-500 leading-relaxed">{selectedPlace.assessmentNotes}</p>
              </div>
            )}

            {/* Owner / contact info */}
            {(selectedPlace.ownerName || selectedPlace.ownerPhone || selectedPlace.ownerEmail || selectedPlace.ownerWebsite) && (
              <div className="px-4 pt-3">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-2">Owner / Operator</p>
                <div className="space-y-1">
                  {selectedPlace.ownerName && (
                    <p className="text-sm font-medium text-gray-800">{selectedPlace.ownerName}</p>
                  )}
                  {selectedPlace.ownerPhone && (
                    <a href={`tel:${selectedPlace.ownerPhone}`} className="block text-sm text-teal-600 hover:text-teal-700">
                      {selectedPlace.ownerPhone}
                    </a>
                  )}
                  {selectedPlace.ownerEmail && (
                    <a href={`mailto:${selectedPlace.ownerEmail}`} className="block text-sm text-teal-600 hover:text-teal-700 truncate">
                      {selectedPlace.ownerEmail}
                    </a>
                  )}
                  {selectedPlace.ownerWebsite && (
                    <a
                      href={selectedPlace.ownerWebsite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-sm text-teal-600 hover:text-teal-700 truncate"
                    >
                      {selectedPlace.ownerWebsite.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Details */}
            <div className="px-4 py-3 space-y-2 flex-1">
              {alreadyInDb && !alreadyAdded && (
                <div>
                  <span className={`inline-block text-xs font-semibold uppercase tracking-wide rounded-full px-3 py-1 ${statusBadgeClass(selectedPlace.existingStatus)}`}>
                    {statusLabel(selectedPlace.existingStatus)}
                  </span>
                </div>
              )}

              <a
                href={`https://www.google.com/maps/@${selectedPlace.lat},${selectedPlace.lng},18z`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-teal-600 hover:text-teal-700 underline underline-offset-2"
              >
                View on Google Maps ↗
              </a>
            </div>

            {/* Action footer */}
            <div className="px-4 pb-5 shrink-0">
              {alreadyAdded ? (
                <p className="text-sm font-medium text-teal-600">Added to pipeline</p>
              ) : alreadyInDb ? (
                <p className="text-sm text-gray-500 italic">Already in pipeline</p>
              ) : (
                <button
                  className="btn btn-primary w-full flex items-center justify-center gap-2"
                  onClick={handleAddToPipeline}
                  disabled={addingToDb}
                >
                  {addingToDb && (
                    <span className="w-5 h-5 border-2 border-teal-200 border-t-teal-500 rounded-full animate-spin" />
                  )}
                  Add to pipeline
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
