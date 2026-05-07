export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { initDb, sql } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { queryOsmLots, findPolygonAt } from "@/lib/osm-search";
import { searchPlaces } from "@/lib/places-fallback";
import { getHighwayScore } from "@/lib/highway-score";
import { buildScoutPrompt, parseScoutResponse } from "@/lib/scout-prompt";

const MAX_TO_SCORE = 20;

async function fetchSatelliteBase64(lat, lng, key) {
  const url =
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${lat},${lng}&zoom=18&size=640x640&maptype=satellite&key=${key}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  } catch {
    return null;
  }
}

async function reverseGeocode(lat, lng, key) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`;
  try {
    const res  = await fetch(url);
    const data = await res.json();
    return data.results?.[0]?.formatted_address ?? null;
  } catch {
    return null;
  }
}

async function scoreWithClaude(anthropic, { lat, lng, name, osmAcres, imageBase64 }) {
  const prompt  = buildScoutPrompt(name, lat, lng, osmAcres);
  const content = [];
  if (imageBase64) {
    content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: imageBase64 } });
  }
  content.push({ type: "text", text: prompt });

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 768,
      messages: [{ role: "user", content }],
    });
    const raw = msg.content.find((b) => b.type === "text")?.text ?? "";
    return parseScoutResponse(raw);
  } catch {
    return null;
  }
}

// Haversine-ish meter distance, sufficient for our small-radius dedup checks.
function meterDistance(aLat, aLng, bLat, bLng) {
  const dLat = (bLat - aLat) * 111320;
  const dLng = (bLng - aLng) * 111320 * Math.cos((aLat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

// Run N async tasks with a concurrency cap. Preserves input order.
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Run the Google Places fallback for a search. Returns a list of OSM-shaped
 * candidates (compatible with the rest of the scoring pipeline) sourced from
 * Places hits whose reverse-OSM polygon lookup succeeded. De-dupes against
 * `osmCandidates` by both osmId and 100m proximity.
 */
async function runPlacesFallback({ lat, lng, radiusMeters, osmCandidates }) {
  let placesHits = [];
  try {
    placesHits = await searchPlaces({ lat, lng, radiusMeters });
  } catch (err) {
    console.warn("[search] Places fallback fetch failed:", err.message);
    placesHits = [];
  }

  // Filter out Places hits already covered by an OSM candidate (within 100m).
  const uncovered = placesHits.filter((hit) => {
    return !osmCandidates.some(
      (c) => meterDistance(c.lat, c.lng, hit.lat, hit.lng) < 100
    );
  });

  // Per-call timeout in findPolygonAt prevents one bad lookup from stalling
  // the whole search; concurrency cap of 8 keeps us under Overpass rate limits.
  const polygonResults = await mapWithConcurrency(uncovered, 8, async (hit) => {
    try {
      const poly = await findPolygonAt({ lat: hit.lat, lng: hit.lng });
      return poly ? { hit, poly } : null;
    } catch {
      return null;
    }
  });

  // Build OSM-shaped candidates, deduping by osmId and by 100m proximity to
  // both existing OSM candidates and to other Places-derived ones (two
  // different POIs may resolve to the same enclosing polygon).
  const out = [];
  const seenOsmIds = new Set(osmCandidates.map((c) => c.osmId));

  for (const r of polygonResults) {
    if (!r) continue;
    const { hit, poly } = r;
    if (seenOsmIds.has(poly.osmId)) continue;

    const dupNearby =
      osmCandidates.some((c) => meterDistance(c.lat, c.lng, poly.lat, poly.lng) < 100) ||
      out.some((c) => meterDistance(c.lat, c.lng, poly.lat, poly.lng) < 100);
    if (dupNearby) continue;

    seenOsmIds.add(poly.osmId);
    out.push({
      ...poly,
      // Prefer the human-friendly Google name when OSM has none.
      name: poly.name || hit.name,
      source: "places+osm",
      googlePlaceId: hit.place_id,
      googleTypes: hit.types,
    });
  }

  // Per-search telemetry — one line, no PII, no API keys.
  console.log(
    `[search] osm_count=${osmCandidates.length} ` +
      `places_count=${placesHits.length} ` +
      `places_kept_after_polygon_check=${out.length} ` +
      `places_dropped=${placesHits.length - out.length}`
  );

  return out;
}

function lotScoreFromAcres(acres) {
  if (!acres || acres <= 0) return 0;
  if (acres < 2)  return 15;
  if (acres < 4)  return 35;
  if (acres < 8)  return 55;
  if (acres < 15) return 70;
  if (acres < 30) return 82;
  if (acres < 60) return 92;
  return 100;
}

export async function GET(req) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!mapsKey) {
    return NextResponse.json({ error: "Google Maps not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat"));
  const lng = parseFloat(searchParams.get("lng"));

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const radiusMeters = Math.min(
    parseInt(searchParams.get("radius") || "16093", 10),
    40234
  );

  // 1. Discover candidates via OSM
  let osmCandidates;
  try {
    osmCandidates = await queryOsmLots(lat, lng, radiusMeters);
  } catch (err) {
    return NextResponse.json({ error: `Area scan failed: ${err.message}` }, { status: 502 });
  }

  // 1b. Google Places fallback — catches "OSM has the polygon but with the
  // wrong tag" cases. Each Places hit is reverse-queried against OSM for an
  // overlapping polygon and only kept if a polygon meeting the size floor
  // exists. Failures are logged and silently skipped so the request still
  // returns OSM-only results.
  const placesCandidates = await runPlacesFallback({
    lat,
    lng,
    radiusMeters,
    osmCandidates,
  });

  const combined = [...osmCandidates, ...placesCandidates];

  if (combined.length === 0) {
    return NextResponse.json({ places: [] });
  }

  const toScore = combined.slice(0, MAX_TO_SCORE);

  const anthropic = process.env.ANTHROPIC_API_KEY
    ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    : null;

  // 2. Per-candidate: scout analysis, highway score, address — all parallel
  const scored = await Promise.all(
    toScore.map(async (candidate) => {
      const [scout, highwayData, resolvedAddress] = await Promise.all([
        (async () => {
          if (!anthropic) return null;
          const imageBase64 = await fetchSatelliteBase64(candidate.lat, candidate.lng, mapsKey);
          return scoreWithClaude(anthropic, { ...candidate, imageBase64 });
        })(),
        getHighwayScore(candidate.lat, candidate.lng, mapsKey),
        candidate.osmAddress
          ? Promise.resolve(candidate.osmAddress)
          : reverseGeocode(candidate.lat, candidate.lng, mapsKey),
      ]);

      // Use Claude's usable_acres estimate; fall back to OSM polygon area
      const usableAcres    = scout?.usableAcres ?? null;
      const estimatedAcres = usableAcres ?? scout?.totalAcres ?? candidate.osmAcres;
      const aiScore        = scout?.aiScore ?? null;
      const highwayScore   = highwayData.score;
      const lotScore       = lotScoreFromAcres(estimatedAcres);

      const baseComposite =
        aiScore !== null
          ? Math.round(aiScore * 0.35 + lotScore * 0.50 + highwayScore * 0.15)
          : Math.round(lotScore * 0.85 + highwayScore * 0.15);

      // Hard disqualifiers cap the composite score
      const disqualifiers  = scout?.disqualifiers ?? [];
      const compositeScore = disqualifiers.length > 0
        ? Math.min(baseComposite, 35)
        : baseComposite;

      return {
        osmId:                candidate.osmId,
        name:                 candidate.name,
        address:              resolvedAddress,
        lat:                  candidate.lat,
        lng:                  candidate.lng,
        osmAcres:             candidate.osmAcres,
        ownerName:            candidate.ownerName,
        ownerPhone:           candidate.ownerPhone,
        ownerEmail:           candidate.ownerEmail,
        ownerWebsite:         candidate.ownerWebsite,
        tags:                 candidate.tags,
        source:               candidate.source         ?? "osm",
        googlePlaceId:        candidate.googlePlaceId  ?? null,
        googleTypes:          candidate.googleTypes    ?? null,
        // Acreage
        estimatedAcres,
        usableAcres,
        totalAcres:           scout?.totalAcres ?? null,
        // Surface
        surfaceType:          scout?.surfaceType          ?? null,
        surfaceCondition:     scout?.surfaceCondition     ?? null,
        // Layout
        shape:                scout?.shape                ?? null,
        lotType:              scout?.lotType              ?? null,
        // Obstructions / safety
        internalObstructions: scout?.internalObstructions ?? [],
        runoffAdequate:       scout?.runoffAdequate       ?? null,
        residentialProximity: scout?.residentialProximity ?? null,
        // Scoring
        aiScore,
        highwayScore,
        minutesToHighway:     highwayData.minutesToHighway,
        compositeScore,
        disqualifiers,
        confidence:           scout?.confidence           ?? null,
        assessmentNotes:      scout?.notes                ?? null,
        existingStatus:       null,
      };
    })
  );

  // Primary sort: largest usable lot first (Claude's usable_acres when available,
  // since OSM polygon area often over- or under-counts the actually-usable area).
  // Fall back to OSM polygon acres for unscored candidates so they don't all sink
  // to the bottom together. Composite score breaks ties.
  const sortAcres = (p) =>
    p.usableAcres != null && p.usableAcres > 0 ? p.usableAcres : (p.osmAcres ?? 0);
  scored.sort((a, b) =>
    sortAcres(b) - sortAcres(a) ||
    (b.compositeScore ?? 0) - (a.compositeScore ?? 0)
  );

  // 3. Mark which candidates are already in our venues table
  await initDb();
  const osmIds     = scored.map((s) => s.osmId);
  const existingMap = {};
  if (osmIds.length > 0) {
    const existing = await sql`
      SELECT google_place_id, status FROM venues
      WHERE google_place_id = ANY(${osmIds})
    `;
    for (const row of existing.rows) {
      existingMap[row.google_place_id] = row.status;
    }
  }

  return NextResponse.json({
    places: scored.map((s) => ({ ...s, existingStatus: existingMap[s.osmId] ?? null })),
  });
}
