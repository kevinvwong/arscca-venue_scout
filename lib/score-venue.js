import Anthropic from "@anthropic-ai/sdk";
import { sql, initDb } from "@/lib/db";

// Returns true if both required API keys are present.
export function isScoreConfigured() {
  return !!(process.env.ANTHROPIC_API_KEY && process.env.GOOGLE_MAPS_API_KEY);
}

/**
 * Derive a lot_score (0–100) from estimated acreage.
 * @param {number|null} acres
 * @returns {number}
 */
function lotScoreFromAcres(acres) {
  if (acres === null || acres === undefined) return 50;
  if (acres < 1) return 10;
  if (acres < 2) return 30;
  if (acres < 5) return 60;
  if (acres <= 10) return 80;
  return 100;
}

/**
 * Score a venue's suitability as a driving-event site using a Google Maps
 * satellite image and Claude vision.
 *
 * @param {{ venueId: number, lat: number, lng: number, name: string }}
 * @returns {Promise<object>} The saved assessment row.
 */
export async function scoreVenue({ venueId, lat, lng, name }) {
  // ------------------------------------------------------------------
  // 1. Fetch satellite image from Google Maps Static API
  // ------------------------------------------------------------------
  const imageUrlWithKey =
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${lat},${lng}` +
    `&zoom=18` +
    `&size=640x640` +
    `&maptype=satellite` +
    `&key=${process.env.GOOGLE_MAPS_API_KEY}`;

  // Store URL without the key for the database record.
  const imageUrlNoKey =
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${lat},${lng}` +
    `&zoom=18` +
    `&size=640x640` +
    `&maptype=satellite`;

  let imageBase64;
  try {
    const res = await fetch(imageUrlWithKey);
    if (!res.ok) {
      throw new Error(`Google Maps Static API returned ${res.status}`);
    }
    const buffer = await res.arrayBuffer();
    imageBase64 = Buffer.from(buffer).toString("base64");
  } catch (err) {
    console.error("scoreVenue: failed to fetch satellite image", err);
    imageBase64 = null;
  }

  // ------------------------------------------------------------------
  // 2. Call Claude claude-sonnet-4-6 vision
  // ------------------------------------------------------------------
  const MODEL = "claude-sonnet-4-6";
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const textPrompt = `You are evaluating a potential venue for an autocross or teen driver safety training event. The satellite image shows the candidate location: "${name}".

Analyze the image and respond with ONLY a JSON object (no markdown, no explanation) with these fields:
{
  "estimated_acres": <number or null — your best estimate of usable paved area in acres>,
  "surface_type": <"asphalt" | "concrete" | "gravel" | "grass" | "mixed" | "unknown">,
  "obstacles": <array of strings — notable fixed obstacles like "light poles", "medians", "trees", "curbs", "buildings">,
  "ai_score": <integer 0–100 — suitability as an autocross/driver training venue>,
  "confidence": <"high" | "medium" | "low">,
  "notes": <string — 1-2 sentences on key factors affecting suitability>
}

Scoring guidance:
- 80–100: Large open asphalt, few obstacles, ideal
- 60–79: Good size, minor obstacles, likely workable
- 40–59: Moderate — usable but requires significant course design consideration
- 20–39: Small, obstructed, or poor surface
- 0–19: Unsuitable`;

  let parsed = null;
  let rawResponse = null;
  let parseError = null;

  try {
    const messageContent = [];

    if (imageBase64) {
      messageContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: imageBase64,
        },
      });
    }

    messageContent.push({ type: "text", text: textPrompt });

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      messages: [{ role: "user", content: messageContent }],
    });

    rawResponse = message;

    const textBlock = message.content.find((b) => b.type === "text");
    const rawText = textBlock?.text ?? "";

    try {
      parsed = JSON.parse(rawText);
    } catch (jsonErr) {
      parseError = `JSON parse failed: ${jsonErr.message}`;
    }
  } catch (apiErr) {
    parseError = `Claude API error: ${apiErr.message}`;
  }

  // ------------------------------------------------------------------
  // 3. Extract fields, falling back to nulls on any failure
  // ------------------------------------------------------------------
  const estimatedAcres = parsed?.estimated_acres ?? null;
  const surfaceType = parsed?.surface_type ?? null;
  const obstacles = Array.isArray(parsed?.obstacles) ? parsed.obstacles : [];
  const aiScore = typeof parsed?.ai_score === "number" ? parsed.ai_score : null;
  const confidence = parsed?.confidence ?? null;
  const notes =
    parsed?.notes ?? (parseError ? `Assessment unavailable: ${parseError}` : null);

  // ------------------------------------------------------------------
  // 4. Compute composite score
  // ------------------------------------------------------------------
  const lotScore = lotScoreFromAcres(estimatedAcres);

  // TODO (Phase 3E): replace hardcoded highway_score with real data from
  // the Google Maps Directions API (travel time / road-type analysis).
  const highwayScore = 50;

  const compositeScore =
    aiScore !== null
      ? Math.round(aiScore * 0.6 + lotScore * 0.25 + highwayScore * 0.15)
      : null;

  // ------------------------------------------------------------------
  // 5. Persist to venue_ai_assessments and update venues
  // ------------------------------------------------------------------
  await initDb();

  // obstacle_types is a TEXT[] column in Postgres. @vercel/postgres's sql
  // tagged template converts a JS array to the correct Postgres array literal.
  const insertResult = await sql`
    INSERT INTO venue_ai_assessments (
      venue_id,
      model,
      satellite_image_url,
      satellite_zoom,
      raw_response,
      estimated_total_acres,
      estimated_clear_acres,
      surface_type,
      obstacle_types,
      suitability_score,
      confidence,
      assessment_notes,
      assessed_at
    ) VALUES (
      ${venueId},
      ${MODEL},
      ${imageUrlNoKey},
      ${18},
      ${rawResponse ? JSON.stringify(rawResponse) : null},
      ${estimatedAcres},
      ${estimatedAcres},
      ${surfaceType},
      ${obstacles},
      ${aiScore},
      ${confidence},
      ${notes},
      NOW()
    )
    RETURNING *
  `;

  const assessment = insertResult.rows[0];

  // Update venues with the composite score and refresh updated_at.
  if (compositeScore !== null) {
    await sql`
      UPDATE venues
      SET
        composite_score = ${compositeScore},
        updated_at      = NOW()
      WHERE id = ${venueId}
    `;
  }

  return {
    ...assessment,
    lot_score: lotScore,
    highway_score: highwayScore,
    composite_score: compositeScore,
  };
}
