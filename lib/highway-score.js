// Patterns in Directions API step instructions that indicate a highway segment
const HIGHWAY_RE = /\b(I-\d+|Interstate|US-\d+|US\s+\d+|SR-\d+|Merge\s+onto|Freeway|Expressway|Turnpike)\b/i;
const RAMP_RE = /Take the .{1,40} ramp/i;

function stepIsHighway(step) {
  const text = (step.html_instructions ?? "").replace(/<[^>]+>/g, "");
  if (HIGHWAY_RE.test(text) || RAMP_RE.test(text)) return true;
  // Speed fallback: > 55 mph average for the step
  if (step.distance?.value && step.duration?.value) {
    const mph = (step.distance.value / step.duration.value) * 2.237;
    if (mph >= 55) return true;
  }
  return false;
}

function scoreFromMinutes(minutes) {
  if (minutes <= 2) return 100;
  if (minutes >= 20) return 0;
  return Math.round(100 - (minutes / 20) * 100);
}

/**
 * Returns { score: 0–100, minutesToHighway: number|null }.
 * Calls Google Maps Directions API from the venue toward a point ~15 miles
 * north, then walks the steps to find when the route first reaches a highway.
 */
export async function getHighwayScore(lat, lng, mapsKey) {
  if (!mapsKey) return { score: 50, minutesToHighway: null };

  // Destination ~15 miles north — far enough to require a highway for most lots
  const destLat = lat + 0.22;
  const url =
    `https://maps.googleapis.com/maps/api/directions/json` +
    `?origin=${lat},${lng}&destination=${destLat},${lng}&mode=driving&key=${mapsKey}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "OK" || !data.routes?.length) {
      return { score: 50, minutesToHighway: null };
    }

    const steps = data.routes[0].legs[0].steps;
    let accumulatedSeconds = 0;

    for (const step of steps) {
      if (stepIsHighway(step)) {
        const minutes = accumulatedSeconds / 60;
        return {
          score: scoreFromMinutes(minutes),
          minutesToHighway: parseFloat(minutes.toFixed(1)),
        };
      }
      accumulatedSeconds += step.duration?.value ?? 0;
    }

    // No highway found within the route — penalise
    return { score: 0, minutesToHighway: null };
  } catch {
    return { score: 50, minutesToHighway: null };
  }
}
