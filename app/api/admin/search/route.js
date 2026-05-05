export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { initDb, sql } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { queryOsmLots } from "@/lib/osm-search";
import { getHighwayScore } from "@/lib/highway-score";

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
  const label = name || `lot at ${lat.toFixed(4)},${lng.toFixed(4)}`;
  const prompt =
    `Evaluate this satellite image for use as an outdoor driving event venue (autocross or teen driver safety training). Location: "${label}". OSM estimated ${osmAcres} acres.\n\n` +
    `Respond with ONLY a JSON object (no markdown):\n` +
    `{"estimated_acres":<number>,"surface_type":"asphalt|concrete|gravel|grass|mixed|unknown",` +
    `"obstacles":<string[]>,"ai_score":<0-100>,"confidence":"high|medium|low","notes":<1-2 sentences>}\n\n` +
    `Score: 80-100 large open asphalt; 60-79 good minor obstacles; 40-59 moderate; 20-39 small/obstructed; 0-19 unsuitable.`;

  const content = [];
  if (imageBase64) {
    content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: imageBase64 } });
  }
  content.push({ type: "text", text: prompt });

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [{ role: "user", content }],
    });
    const raw = msg.content.find((b) => b.type === "text")?.text ?? "";
    return JSON.parse(raw);
  } catch {
    return null;
  }
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

  if (osmCandidates.length === 0) {
    return NextResponse.json({ places: [] });
  }

  const toScore = osmCandidates.slice(0, MAX_TO_SCORE);

  const anthropic = process.env.ANTHROPIC_API_KEY
    ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    : null;

  // 2. Per-candidate: satellite+Claude, highway score, and address — all parallel
  const scored = await Promise.all(
    toScore.map(async (candidate) => {
      const [aiResult, highwayData, resolvedAddress] = await Promise.all([
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

      const estimatedAcres = aiResult?.estimated_acres ?? candidate.osmAcres;
      const aiScore        = typeof aiResult?.ai_score === "number" ? aiResult.ai_score : null;
      const lotScore       = lotScoreFromAcres(estimatedAcres);
      const highwayScore   = highwayData.score;

      const compositeScore =
        aiScore !== null
          ? Math.round(aiScore * 0.35 + lotScore * 0.50 + highwayScore * 0.15)
          : Math.round(lotScore * 0.85 + highwayScore * 0.15);

      return {
        osmId:            candidate.osmId,
        name:             candidate.name,
        address:          resolvedAddress,
        lat:              candidate.lat,
        lng:              candidate.lng,
        osmAcres:         candidate.osmAcres,
        ownerName:        candidate.ownerName,
        ownerPhone:       candidate.ownerPhone,
        ownerEmail:       candidate.ownerEmail,
        ownerWebsite:     candidate.ownerWebsite,
        tags:             candidate.tags,
        estimatedAcres,
        surfaceType:      aiResult?.surface_type ?? null,
        obstacles:        aiResult?.obstacles     ?? [],
        aiScore,
        highwayScore,
        minutesToHighway: highwayData.minutesToHighway,
        compositeScore,
        confidence:       aiResult?.confidence    ?? null,
        assessmentNotes:  aiResult?.notes         ?? null,
        existingStatus:   null,
      };
    })
  );

  // Primary sort: largest lot first. Ties broken by composite score.
  scored.sort((a, b) =>
    (b.osmAcres ?? 0) - (a.osmAcres ?? 0) ||
    (b.compositeScore ?? 0) - (a.compositeScore ?? 0)
  );

  // 3. Mark which candidates are already in our venues table
  await initDb();
  const osmIds = scored.map((s) => s.osmId);
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
    places: scored.map((s) => ({
      ...s,
      existingStatus: existingMap[s.osmId] ?? null,
    })),
  });
}
