"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Script from "next/script";

const RADIUS_OPTIONS = [
  { label: "1 km",  value: 1000 },
  { label: "2 km",  value: 2000 },
  { label: "5 km",  value: 5000 },
  { label: "10 km", value: 10000 },
  { label: "25 km", value: 25000 },
];

const TYPE_OPTIONS = [
  { label: "Parking Lots",        value: "parking" },
  { label: "Fairgrounds",         value: "fairground" },
  { label: "Stadiums",            value: "stadium" },
  { label: "Convention Centers",  value: "convention_center" },
];

const PIN_COLORS = {
  default:  "#6b7280",
  approved: "#16a34a",
  active:   "#d97706",  // shortlisted / contacted / responded / site_visit
  declined: "#dc2626",  // declined / archived
  added:    "#14b8a6",  // just added this session (teal)
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
  // Simple SVG circle pin
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

export default function SearchPage() {
  // Search bar state
  const [searchInput, setSearchInput]   = useState("");
  const [radius, setRadius]             = useState(5000);
  const [placeType, setPlaceType]       = useState("parking");

  // Results state
  const [places, setPlaces]             = useState([]);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [addedPlaceIds, setAddedPlaceIds] = useState(new Set());

  // UI state
  const [mapLoaded, setMapLoaded]       = useState(false);
  const [searching, setSearching]       = useState(false);
  const [error, setError]               = useState(null);
  const [addingToDb, setAddingToDb]     = useState(false);
  const [addedMsg, setAddedMsg]         = useState(false);

  // Batch scoring state
  const [batchScoring, setBatchScoring]   = useState(false);
  const [batchResults, setBatchResults]   = useState(new Map()); // placeId → score data
  const [batchProgress, setBatchProgress] = useState(0);

  // Auto-search debounce ref
  const autoSearchTimer = useRef(null);

  // Saved search profiles
  const [profiles, setProfiles]           = useState([]);
  const [lastGeoLat, setLastGeoLat]       = useState(null);
  const [lastGeoLng, setLastGeoLng]       = useState(null);
  const [showSaveForm, setShowSaveForm]   = useState(false);
  const [saveName, setSaveName]           = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Map refs — stored in refs, not state, to avoid re-render loops
  const mapRef      = useRef(null);   // DOM element
  const mapInstance = useRef(null);   // google.maps.Map
  const markersRef  = useRef([]);     // current markers array
  const mapsApi     = useRef(null);   // google.maps namespace

  // Initialize map once the Maps JS script has loaded
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

  // Load saved search profiles on mount
  useEffect(() => {
    fetch("/api/admin/search/profiles")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.profiles)) setProfiles(d.profiles); })
      .catch(() => {});
  }, []);

  // Update a single marker's icon (e.g. after adding to DB)
  const refreshMarkerIcon = useCallback((placeId, newAddedSet) => {
    markersRef.current.forEach((m) => {
      if (m._placeId === placeId) {
        const place = places.find((p) => p.placeId === placeId);
        const icon = makeMarkerIcon(pinColor(place?.existingStatus, newAddedSet.has(placeId)));
        m.setIcon({
          url: icon.url,
          scaledSize: new mapsApi.current.Size(icon.scaledSize.width, icon.scaledSize.height),
          anchor: new mapsApi.current.Point(icon.anchor.x, icon.anchor.y),
        });
      }
    });
  }, [places]);

  // Plot markers whenever places changes
  useEffect(() => {
    if (!mapInstance.current || !mapsApi.current) return;
    const google = { maps: mapsApi.current };

    // Clear old markers
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    if (places.length === 0) return;

    const bounds = new google.maps.LatLngBounds();

    places.forEach((place) => {
      const iconDef = makeMarkerIcon(pinColor(place.existingStatus, addedPlaceIds.has(place.placeId)));

      const marker = new google.maps.Marker({
        position: { lat: place.lat, lng: place.lng },
        map: mapInstance.current,
        title: place.name,
        icon: {
          url: iconDef.url,
          scaledSize: new google.maps.Size(iconDef.scaledSize.width, iconDef.scaledSize.height),
          anchor: new google.maps.Point(iconDef.anchor.x, iconDef.anchor.y),
        },
      });

      marker._placeId = place.placeId;

      marker.addListener("click", () => {
        setSelectedPlace(place);
        setAddedMsg(false);
        mapInstance.current.panTo({ lat: place.lat, lng: place.lng });
      });

      markersRef.current.push(marker);
      bounds.extend({ lat: place.lat, lng: place.lng });
    });

    mapInstance.current.fitBounds(bounds);
  }, [places]); // addedPlaceIds intentionally excluded — refreshMarkerIcon handles per-pin updates

  const handleSearch = useCallback(async (overrideQuery) => {
    const q = (overrideQuery ?? searchInput).trim();
    if (!q) return;

    setSearching(true);
    setError(null);
    setSelectedPlace(null);
    setAddedMsg(false);

    try {
      // Step 1: geocode
      const geoRes = await fetch(
        `/api/admin/search/geocode?address=${encodeURIComponent(q)}`
      );
      const geoData = await geoRes.json();
      if (!geoRes.ok) throw new Error(geoData.error || "Geocode failed");

      const { lat, lng } = geoData;
      setLastGeoLat(lat);
      setLastGeoLng(lng);
      setShowSaveForm(false);

      // Step 2: nearby places
      const placesRes = await fetch(
        `/api/admin/search?lat=${lat}&lng=${lng}&radius=${radius}&type=${placeType}`
      );
      const placesData = await placesRes.json();
      if (!placesRes.ok) throw new Error(placesData.error || "Places search failed");

      setPlaces(placesData.places || []);

      if ((placesData.places || []).length === 0) {
        setError("No places found. Try a different location or type.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }, [searchInput, radius, placeType]);

  const handleAddToPipeline = useCallback(async () => {
    if (!selectedPlace) return;
    setAddingToDb(true);

    try {
      const res = await fetch("/api/admin/venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedPlace.name,
          address: selectedPlace.address,
          lat: selectedPlace.lat,
          lng: selectedPlace.lng,
          google_place_id: selectedPlace.placeId,
          source: "google_places",
          status: "candidate",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add venue");

      const newSet = new Set(addedPlaceIds);
      newSet.add(selectedPlace.placeId);
      setAddedPlaceIds(newSet);
      setAddedMsg(true);

      // Update the marker icon immediately
      refreshMarkerIcon(selectedPlace.placeId, newSet);

      // Fire-and-forget AI scoring — don't await, don't block the UI
      const venueId = data.venue?.id;
      if (venueId) {
        fetch(`/api/admin/venues/${venueId}/score`, { method: "POST" }).catch(() => {});
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingToDb(false);
    }
  }, [selectedPlace, addedPlaceIds, refreshMarkerIcon]);

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
          lot_types: [placeType],
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
  }, [lastGeoLat, lastGeoLng, saveName, radius, placeType]);

  const deleteProfile = useCallback(async (id) => {
    await fetch(`/api/admin/search/profiles/${id}`, { method: "DELETE" });
    setProfiles((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const replayProfile = useCallback((profile) => {
    setSearchInput(profile.name);
    setRadius((profile.radius_miles || 30) * 1609);
    fetch(`/api/admin/search/profiles/${profile.id}`, { method: "PATCH" }).catch(() => {});
    // Trigger search with the profile's stored center directly
    fetch(`/api/admin/search?lat=${profile.center_lat}&lng=${profile.center_lng}&radius=${(profile.radius_miles || 30) * 1609}&type=${placeType}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.places) {
          setPlaces(d.places);
          setLastGeoLat(Number(profile.center_lat));
          setLastGeoLng(Number(profile.center_lng));
        }
      })
      .catch(() => {});
  }, [placeType]);

  const runBatchScore = useCallback(async () => {
    // Only score places not yet in batchResults and without an existingStatus
    const unscored = places.filter(
      (p) => !batchResults.has(p.placeId) && !p.existingStatus
    ).slice(0, 10);

    if (unscored.length === 0) return;

    setBatchScoring(true);
    setBatchProgress(0);

    try {
      const res = await fetch("/api/admin/search/score-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          places: unscored.map((p) => ({
            placeId: p.placeId,
            name: p.name,
            address: p.address,
            lat: p.lat,
            lng: p.lng,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Batch scoring failed");

      setBatchResults((prev) => {
        const next = new Map(prev);
        for (const result of data.results ?? []) {
          next.set(result.placeId, result);
        }
        return next;
      });

      setBatchProgress(100);
    } catch (err) {
      setError(err.message);
    } finally {
      setBatchScoring(false);
    }
  }, [places, batchResults]);

  const unscoredCount = places.filter(
    (p) => !batchResults.has(p.placeId) && !p.existingStatus
  ).length;

  const alreadyAdded = selectedPlace && addedPlaceIds.has(selectedPlace.placeId);
  const alreadyInDb  = selectedPlace && selectedPlace.existingStatus != null;

  return (
    <>
    <Script
      src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=maps,marker&callback=Function.prototype`}
      strategy="afterInteractive"
      onLoad={initMap}
    />
    <div className="flex flex-col" style={{ height: "calc(100vh - 112px)" }}>
      {/* Search bar row */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-gray-200 shrink-0">
        <input
          type="text"
          className="input flex-1 min-w-0"
          placeholder="City or ZIP code"
          value={searchInput}
          onChange={(e) => {
            const val = e.target.value;
            setSearchInput(val);
            // Auto-search on complete US ZIP code (5 digits or ZIP+4)
            if (/^\d{5}(-\d{4})?$/.test(val.trim())) {
              clearTimeout(autoSearchTimer.current);
              autoSearchTimer.current = setTimeout(() => handleSearch(val.trim()), 400);
            }
          }}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />

        <select
          className="input w-36 shrink-0"
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
        >
          {RADIUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          className="input w-48 shrink-0"
          value={placeType}
          onChange={(e) => setPlaceType(e.target.value)}
        >
          {TYPE_OPTIONS.map((o) => (
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
          Search
        </button>

        {places.length > 0 && (
          <button
            className="btn btn-outline shrink-0 flex items-center gap-2 text-teal-600 border-teal-300 hover:border-teal-500"
            onClick={runBatchScore}
            disabled={batchScoring || unscoredCount === 0}
          >
            {batchScoring ? (
              <>
                <span className="w-4 h-4 border-2 border-teal-200 border-t-teal-500 rounded-full animate-spin" />
                Scoring…
              </>
            ) : (
              `Score All (${unscoredCount})`
            )}
          </button>
        )}
      </div>

      {/* Batch scoring progress bar */}
      {batchScoring && (
        <div className="h-1 bg-gray-100 shrink-0">
          <div
            className="h-1 bg-teal-500 transition-all duration-300"
            style={{ width: `${batchProgress}%` }}
          />
        </div>
      )}

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

      {/* Error banner */}
      {error && (
        <div className="notice notice-error mx-6 mt-3 shrink-0" role="alert">
          {error}
        </div>
      )}

      {/* Map + detail panel */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Map */}
        <div ref={mapRef} className="flex-1 min-w-0 h-full" />

        {/* Empty state overlay (shown before any search) */}
        {!searching && places.length === 0 && !error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-white/90 rounded-xl px-8 py-6 text-center shadow-sm border border-gray-200 max-w-sm">
              <p className="text-sm font-medium text-gray-700">
                Search for a city or ZIP code to find candidate venues
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Results appear as pins on the map
              </p>
            </div>
          </div>
        )}

        {/* Detail panel */}
        {selectedPlace && (
          <div className="w-80 shrink-0 bg-white border-l border-gray-200 overflow-y-auto flex flex-col">
            {/* Panel header */}
            <div className="flex items-start justify-between p-4 border-b border-gray-100">
              <div className="flex-1 min-w-0 pr-2">
                <p className="text-lg font-semibold text-gray-900 leading-snug">
                  {selectedPlace.name}
                </p>
                <p className="text-sm text-gray-500 mt-0.5 leading-snug">
                  {selectedPlace.address}
                </p>
              </div>
              <button
                className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0 mt-0.5"
                onClick={() => { setSelectedPlace(null); setAddedMsg(false); }}
                aria-label="Close detail panel"
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

            {/* Batch score card */}
            {batchResults.has(selectedPlace.placeId) && (() => {
              const s = batchResults.get(selectedPlace.placeId);
              if (s.status === "error") {
                return (
                  <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                    Scoring failed: {s.error}
                  </div>
                );
              }
              const scoreColor =
                s.composite_score >= 70
                  ? "text-green-700"
                  : s.composite_score >= 45
                  ? "text-yellow-700"
                  : "text-red-700";
              return (
                <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-0.5">AI Score</p>
                    <p className={`text-lg font-bold tabular-nums leading-none ${scoreColor}`}>
                      {s.composite_score ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-0.5">Surface</p>
                    <span className="inline-block bg-gray-200 text-gray-700 text-xs rounded-full px-2 py-0.5 capitalize">
                      {s.surface_type ?? "unknown"}
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-0.5">Est. Acres</p>
                    <p className="text-sm font-semibold tabular-nums text-gray-800 leading-none mt-0.5">
                      {s.estimated_acres != null ? s.estimated_acres.toFixed(1) : "—"}
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Details */}
            <div className="px-4 py-4 space-y-3 flex-1">
              {/* Rating */}
              {selectedPlace.rating != null && (
                <div className="text-sm text-gray-700">
                  <span className="text-yellow-500">★</span>{" "}
                  <span className="font-medium tabular-nums">{selectedPlace.rating.toFixed(1)}</span>
                  {selectedPlace.userRatingsTotal != null && (
                    <span className="text-gray-400 ml-1">
                      ({selectedPlace.userRatingsTotal.toLocaleString()} reviews)
                    </span>
                  )}
                </div>
              )}

              {/* Types */}
              {selectedPlace.types && selectedPlace.types.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedPlace.types
                    .filter((t) => t !== "point_of_interest" && t !== "establishment")
                    .slice(0, 5)
                    .map((t) => (
                      <span
                        key={t}
                        className="inline-block bg-gray-100 text-gray-600 text-xs rounded-full px-2 py-0.5"
                      >
                        {t.replace(/_/g, " ")}
                      </span>
                    ))}
                </div>
              )}

              {/* Existing status chip */}
              {alreadyInDb && !alreadyAdded && (
                <div>
                  <span
                    className={`inline-block text-xs font-semibold uppercase tracking-wide rounded-full px-3 py-1 ${statusBadgeClass(selectedPlace.existingStatus)}`}
                  >
                    {statusLabel(selectedPlace.existingStatus)}
                  </span>
                </div>
              )}

              {/* Google Maps link */}
              <a
                href={`https://www.google.com/maps/place/?q=place_id:${selectedPlace.placeId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-brand-500 hover:text-brand-600 underline underline-offset-2"
              >
                View on Google Maps ↗
              </a>
            </div>

            {/* Action footer */}
            <div className="px-4 pb-5 shrink-0">
              {alreadyAdded ? (
                <p className="text-sm font-medium text-teal-600">
                  Added to pipeline
                </p>
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
