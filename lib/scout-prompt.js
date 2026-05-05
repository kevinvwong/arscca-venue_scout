/**
 * Shared autocross / driver-training site-scout prompt and response parser.
 * Used by both the live search scoring and the per-venue re-score route.
 */

export function buildScoutPrompt(name, lat, lng, osmAcres) {
  const label = name || `lot at ${lat?.toFixed(4)}, ${lng?.toFixed(4)}`;
  return `You are an autocross / driver-training site scout for an SCCA region evaluating a satellite image.
Location: "${label}" (OSM polygon area: ~${osmAcres} acres).

Hard disqualifiers — flag these in "disqualifiers":
• Surface is not paved (gravel, dirt, grass)
• Severe surface damage: large potholes, heaves, or extensive oil contamination
• No usable run-off buffer (building walls or drop-offs flush with lot edge)
• Usable contiguous area under 2.87 acres (125,000 sq ft)

Lot types to score HIGHER (in priority order):
stadium/arena overflow lot, fairground/expo center, racetrack support lot,
decommissioned or low-traffic airfield, large dead/dying retail (vacant mall),
mega-church campus, community college overflow, industrial/distribution lot,
county/state-owned event lot, convention center overflow

Lot types to score LOWER:
active retail (Walmart/Home Depot/Costco), office park, apartment complex, hotel lot

Analyze the image and return ONLY a JSON object — no markdown, no explanation:
{
  "total_acres": <number — full paved area visible>,
  "usable_acres": <number — largest contiguous paved area with no internal obstacles>,
  "surface_type": "asphalt|concrete|mixed|gravel|grass|unknown",
  "surface_condition": <1-5: 5=pristine, 4=good, 3=fair wear, 2=significant damage, 1=severe>,
  "shape": "rectangular|L-shaped|irregular|triangular",
  "internal_obstructions": <string[] — poles/islands/curbs/bumps INSIDE the usable footprint>,
  "runoff_adequate": <boolean — appears to have ≥50 ft clear buffer from lot edge to buildings/drop-offs>,
  "residential_proximity": "none|distant|adjacent",
  "lot_type": "stadium_lot|fairground|retail_mall|industrial|campus|airfield|racetrack|church|other",
  "disqualifiers": <string[] — hard failures only>,
  "ai_score": <integer 0-100>,
  "confidence": "high|medium|low",
  "notes": <2-3 sentences on key factors>
}

Scoring guidance:
80-100: 8+ acres open paved, minimal internal obstacles, good run-off, high-priority owner type
60-79: 5-8 acres or minor obstacles, workable with course design care
40-59: 3-5 acres or moderate obstacles, possible with tight layout
20-39: Under-sized, poor surface, or significant obstructions
0-19: Fails a hard disqualifier`;
}

export function parseScoutResponse(rawText) {
  let parsed = null;
  try {
    // Strip any accidental markdown fences
    const cleaned = rawText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  return {
    totalAcres:            typeof parsed.total_acres  === "number"  ? parsed.total_acres  : null,
    usableAcres:           typeof parsed.usable_acres === "number"  ? parsed.usable_acres : null,
    surfaceType:           parsed.surface_type        ?? null,
    surfaceCondition:      typeof parsed.surface_condition === "number" ? parsed.surface_condition : null,
    shape:                 parsed.shape               ?? null,
    internalObstructions:  Array.isArray(parsed.internal_obstructions) ? parsed.internal_obstructions : [],
    runoffAdequate:        typeof parsed.runoff_adequate === "boolean" ? parsed.runoff_adequate : null,
    residentialProximity:  parsed.residential_proximity ?? null,
    lotType:               parsed.lot_type            ?? null,
    disqualifiers:         Array.isArray(parsed.disqualifiers)  ? parsed.disqualifiers  : [],
    aiScore:               typeof parsed.ai_score === "number"  ? parsed.ai_score       : null,
    confidence:            parsed.confidence          ?? null,
    notes:                 parsed.notes               ?? null,
  };
}
