import Anthropic from "@anthropic-ai/sdk";
import { sql, initDb } from "@/lib/db";
import { getHighwayScore } from "@/lib/highway-score";
import { buildScoutPrompt, parseScoutResponse } from "@/lib/scout-prompt";

export function isScoreConfigured() {
  return !!(process.env.ANTHROPIC_API_KEY && process.env.GOOGLE_MAPS_API_KEY);
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

/**
 * Score a venue using satellite imagery + Claude vision. Persists an
 * assessment record and updates the venue's composite score.
 */
export async function scoreVenue({ venueId, lat, lng, name }) {
  const MODEL = "claude-sonnet-4-6";

  // 1. Fetch satellite image
  const imageUrlWithKey =
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${lat},${lng}&zoom=18&size=640x640&maptype=satellite` +
    `&key=${process.env.GOOGLE_MAPS_API_KEY}`;
  const imageUrlNoKey =
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${lat},${lng}&zoom=18&size=640x640&maptype=satellite`;

  let imageBase64 = null;
  try {
    const res = await fetch(imageUrlWithKey);
    if (!res.ok) throw new Error(`Static API ${res.status}`);
    imageBase64 = Buffer.from(await res.arrayBuffer()).toString("base64");
  } catch (err) {
    console.error("scoreVenue: satellite image fetch failed", err);
  }

  // 2. Call Claude with the SCCA scout prompt
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt    = buildScoutPrompt(name, lat, lng, null);

  const content = [];
  if (imageBase64) {
    content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: imageBase64 } });
  }
  content.push({ type: "text", text: prompt });

  let rawResponse = null;
  let scout       = null;
  let parseError  = null;

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 768,
      messages: [{ role: "user", content }],
    });
    rawResponse = message;
    const rawText = message.content.find((b) => b.type === "text")?.text ?? "";
    scout = parseScoutResponse(rawText);
    if (!scout) parseError = "Response parse failed";
  } catch (err) {
    parseError = err.message;
  }

  // 3. Extract fields
  const usableAcres    = scout?.usableAcres    ?? null;
  const totalAcres     = scout?.totalAcres     ?? null;
  const estimatedAcres = usableAcres ?? totalAcres;
  const surfaceType    = scout?.surfaceType    ?? null;
  const surfaceCondition = scout?.surfaceCondition ?? null;
  const shape          = scout?.shape          ?? null;
  const internalObstructions = scout?.internalObstructions ?? [];
  const disqualifiers  = scout?.disqualifiers  ?? [];
  const runoffAdequate = scout?.runoffAdequate ?? null;
  const lotType        = scout?.lotType        ?? null;
  const aiScore        = scout?.aiScore        ?? null;
  const confidence     = scout?.confidence     ?? null;
  const notes          = scout?.notes ?? (parseError ? `Assessment unavailable: ${parseError}` : null);

  // 4. Compute composite score
  const lotScore = lotScoreFromAcres(estimatedAcres);
  const { score: highwayScore, minutesToHighway } = await getHighwayScore(
    lat, lng, process.env.GOOGLE_MAPS_API_KEY
  );

  const baseComposite =
    aiScore !== null
      ? Math.round(aiScore * 0.35 + lotScore * 0.50 + highwayScore * 0.15)
      : null;

  const compositeScore = baseComposite !== null && disqualifiers.length > 0
    ? Math.min(baseComposite, 35)
    : baseComposite;

  // 5. Persist assessment
  await initDb();

  const insertResult = await sql`
    INSERT INTO venue_ai_assessments (
      venue_id, model, satellite_image_url, satellite_zoom, raw_response,
      estimated_total_acres, estimated_clear_acres,
      usable_acres, surface_type, surface_condition, shape,
      obstacle_types, disqualifiers, runoff_adequate, lot_type,
      suitability_score, confidence, assessment_notes, assessed_at
    ) VALUES (
      ${venueId}, ${MODEL}, ${imageUrlNoKey}, ${18},
      ${rawResponse ? JSON.stringify(rawResponse) : null},
      ${totalAcres}, ${estimatedAcres},
      ${usableAcres}, ${surfaceType}, ${surfaceCondition}, ${shape},
      ${internalObstructions}, ${disqualifiers}, ${runoffAdequate}, ${lotType},
      ${aiScore}, ${confidence}, ${notes}, NOW()
    )
    RETURNING *
  `;

  const assessment = insertResult.rows[0];

  // 6. Update venue composite + highway scores
  if (compositeScore !== null) {
    await sql`
      UPDATE venues
      SET composite_score      = ${compositeScore},
          highway_access_score = ${highwayScore},
          updated_at           = NOW()
      WHERE id = ${venueId}
    `;
  }

  return {
    ...assessment,
    lot_score:          lotScore,
    highway_score:      highwayScore,
    minutes_to_highway: minutesToHighway,
    composite_score:    compositeScore,
    disqualifiers,
  };
}
