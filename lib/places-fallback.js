// Google Places Nearby Search fallback wrapper.
//
// Used to catch the "OSM has the polygon but with the wrong tag" case: the
// search route calls this to discover candidate point-of-interest locations
// (parking lots, stadiums, generic POIs) that the primary OSM tag-based scan
// might miss. Each hit is then reverse-queried against OSM to find an
// overlapping polygon — only polygons meeting the minimum size are kept.
//
// Reads the API key from process.env.GOOGLE_MAPS_API_KEY (same env var the
// rest of the app uses). Uses fetch directly — no external dependencies.

const PLACES_NEARBY_URL =
  "https://maps.googleapis.com/maps/api/place/nearbysearch/json";

// Google Places Nearby Search caps radius at 50,000 m. v1 simply clamps to
// that ceiling; for larger search areas we'd need to tile the search across
// multiple sub-centers, which we'll add when product asks for it.
const PLACES_MAX_RADIUS_M = 50_000;

const PLACES_TYPES = ["parking", "stadium", "point_of_interest"];

const FETCH_TIMEOUT_MS = 8_000;

async function fetchPlacesType({ lat, lng, radiusMeters, type, apiKey }) {
  const url =
    `${PLACES_NEARBY_URL}` +
    `?location=${lat},${lng}` +
    `&radius=${radiusMeters}` +
    `&type=${encodeURIComponent(type)}` +
    `&key=${apiKey}`;

  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (err) {
    console.warn(`[places-fallback] fetch failed for type=${type}:`, err.message);
    return [];
  }

  if (!res.ok) {
    console.warn(`[places-fallback] HTTP ${res.status} for type=${type}`);
    return [];
  }

  const data = await res.json().catch(() => null);
  if (!data) return [];

  // Treat ZERO_RESULTS as empty (not an error). Anything else non-OK is logged.
  if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    console.warn(`[places-fallback] Places API status=${data.status} for type=${type}`);
    return [];
  }

  return Array.isArray(data.results) ? data.results : [];
}

/**
 * Search Google Places Nearby for candidate venue locations across three
 * complementary types: parking, stadium, point_of_interest.
 *
 * Returns [{ place_id, name, lat, lng, types }], de-duplicated by place_id.
 * If GOOGLE_MAPS_API_KEY is missing the caller will get an empty array and a
 * console.warn — never an error — so the search route can degrade gracefully.
 */
export async function searchPlaces({ lat, lng, radiusMeters }) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn(
      "[places-fallback] GOOGLE_MAPS_API_KEY not set; skipping Places fallback"
    );
    return [];
  }

  const cappedRadius = Math.min(
    Math.max(parseInt(radiusMeters, 10) || 0, 1),
    PLACES_MAX_RADIUS_M
  );

  const perType = await Promise.all(
    PLACES_TYPES.map((type) =>
      fetchPlacesType({ lat, lng, radiusMeters: cappedRadius, type, apiKey })
    )
  );

  const seen = new Map();
  for (const results of perType) {
    for (const r of results) {
      if (!r || !r.place_id) continue;
      if (seen.has(r.place_id)) continue;
      const loc = r.geometry?.location;
      if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") {
        continue;
      }
      seen.set(r.place_id, {
        place_id: r.place_id,
        name: r.name || null,
        lat: loc.lat,
        lng: loc.lng,
        types: Array.isArray(r.types) ? r.types : [],
      });
    }
  }

  return Array.from(seen.values());
}
