export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { initDb, sql } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { queryOsmLots } from "@/lib/osm-search";

const MAX_TO_SCORE = 20;

async function fetchSatelliteBase64(lat, lng, key) {
  const url =
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${lat},${lng}&zoom=18&size=640x640&maptype=satellite&key=${key}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return Buffer.from(buf).toString("base64");
  } catch {
    return null;
  }
}

async function scoreWithClaude(anthropic, { lat, lng, name, osmAcres, imageBase64 }) {
  const label = name || `lot at ${lat.toFixed(4)},${lng.toFixed(4)}`;
  const prompt =
    `Evaluate this satellite image for use as an outdoor driving event venue (autocross or teen driver safety training). Location: "${label}". OSM estimated ${osmAcres} acres.\n\n` +
    `Respond with ONLY a JSON object (no markdown):\n` +
    `{\n` +
    `  "estimated_acres": <number — usable paved area>,\n` +
    `  "surface_type": <"asphalt"|"concrete"|"gravel"|"grass"|"mixed"|"unknown">,\n` +
    `  "obstacles": <string[] — e.g. ["light poles","medians","curbs"]>,\n` +
    `  "ai_score": <integer 0–100>,\n` +
    `  "confidence": <"high"|"medium"|"low">,\n` +
    `  "notes": <1-2 sentences>\n` +
    `}\n\n` +
    `Score: 80–100 large open asphalt; 60–79 good minor obstacles; 40–59 moderate; 20–39 small/obstructed; 0–19 unsuitable.`;

  const content = [];
  if (imageBase64) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: imageBase64 },
    });
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
  if (!acres) return 50;
  if (acres < 1) return 10;
  if (acres < 2) return 30;
  if (acres < 5) return 60;
  if (acres <= 10) return 80;
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
    return NextResponse.json(
      { error: `Area scan failed: ${err.message}` },
      { status: 502 }
    );
  }

  if (osmCandidates.length === 0) {
    return NextResponse.json({ places: [] });
  }

  // 2. Score top candidates with satellite imagery + Claude (parallel)
  const toScore = osmCandidates.slice(0, MAX_TO_SCORE);

  const anthropic = process.env.ANTHROPIC_API_KEY
    ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    : null;

  const scored = await Promise.all(
    toScore.map(async (candidate) => {
      let aiResult = null;

      if (anthropic) {
        const imageBase64 = await fetchSatelliteBase64(candidate.lat, candidate.lng, mapsKey);
        aiResult = await scoreWithClaude(anthropic, { ...candidate, imageBase64 });
      }

      const estimatedAcres = aiResult?.estimated_acres ?? candidate.osmAcres;
      const aiScore = typeof aiResult?.ai_score === "number" ? aiResult.ai_score : null;
      const lotScore = lotScoreFromAcres(estimatedAcres);
      const compositeScore =
        aiScore !== null
          ? Math.round(aiScore * 0.6 + lotScore * 0.25 + 50 * 0.15)
          : Math.round(lotScore * 0.85 + 50 * 0.15);

      return {
        ...candidate,
        estimatedAcres,
        surfaceType: aiResult?.surface_type ?? null,
        obstacles: aiResult?.obstacles ?? [],
        aiScore,
        compositeScore,
        confidence: aiResult?.confidence ?? null,
        assessmentNotes: aiResult?.notes ?? null,
        existingStatus: null,
      };
    })
  );

  scored.sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0));

  // 3. Mark which candidates are already in our venues table
  await initDb();
  const osmIds = scored.map((s) => s.osmId);
  let existingMap = {};
  if (osmIds.length > 0) {
    const existing = await sql`
      SELECT google_place_id, status FROM venues
      WHERE google_place_id = ANY(${osmIds})
    `;
    for (const row of existing.rows) {
      existingMap[row.google_place_id] = row.status;
    }
  }

  const results = scored.map((s) => ({
    ...s,
    existingStatus: existingMap[s.osmId] ?? null,
  }));

  return NextResponse.json({ places: results });
}
