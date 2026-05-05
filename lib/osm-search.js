const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const ACRES_PER_M2 = 0.000247105;
const MIN_ACRES = 2.0;
const MAX_ACRES = 150;

function shoelaceAreaM2(nodes) {
  if (nodes.length < 3) return 0;
  let sum = 0;
  const n = nodes.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += nodes[i].lon * nodes[j].lat;
    sum -= nodes[j].lon * nodes[i].lat;
  }
  const avgLat = nodes.reduce((s, nd) => s + nd.lat, 0) / n;
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos((avgLat * Math.PI) / 180);
  return Math.abs(sum / 2) * mPerDegLat * mPerDegLon;
}

function polygonCentroid(nodes) {
  const lat = nodes.reduce((s, nd) => s + nd.lat, 0) / nodes.length;
  const lng = nodes.reduce((s, nd) => s + nd.lon, 0) / nodes.length;
  return { lat, lng };
}

// Returns up to maxResults candidates sorted by area descending.
export async function queryOsmLots(lat, lng, radiusMeters, maxResults = 30) {
  const query = `
[out:json][timeout:28];
(
  way["amenity"="parking"]["access"!="private"](around:${radiusMeters},${lat},${lng});
  way["landuse"~"^(commercial|industrial|retail)$"](around:${radiusMeters},${lat},${lng});
  way["leisure"~"^(stadium|sports_centre|fairground|race_track)$"](around:${radiusMeters},${lat},${lng});
  way["amenity"="events_venue"](around:${radiusMeters},${lat},${lng});
);
out body;
>;
out skel qt;
`.trim();

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "VenueScout/1.0 (event venue discovery)",
    },
    body: "data=" + encodeURIComponent(query),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`Overpass API ${res.status}`);

  const data = await res.json();

  const nodeMap = {};
  for (const el of data.elements) {
    if (el.type === "node") nodeMap[el.id] = { lat: el.lat, lon: el.lon };
  }

  const candidates = [];
  for (const el of data.elements) {
    if (el.type !== "way" || !el.nodes || el.nodes.length < 4) continue;

    const nodes = el.nodes.map((id) => nodeMap[id]).filter(Boolean);
    if (nodes.length < 3) continue;

    const areaM2 = shoelaceAreaM2(nodes);
    const acres = areaM2 * ACRES_PER_M2;
    if (acres < MIN_ACRES || acres > MAX_ACRES) continue;

    const centroid = polygonCentroid(nodes);
    const tags = el.tags || {};
    const name = tags.name || null;

    candidates.push({
      osmId: `osm_${el.id}`,
      name,
      lat: centroid.lat,
      lng: centroid.lng,
      osmAcres: parseFloat(acres.toFixed(2)),
      tags,
    });
  }

  // Deduplicate candidates within 100m of each other (keep the larger one)
  const deduped = [];
  for (const c of candidates) {
    const nearby = deduped.findIndex((d) => {
      const dlat = (d.lat - c.lat) * 111320;
      const dlng = (d.lng - c.lng) * 111320 * Math.cos(c.lat * Math.PI / 180);
      return Math.sqrt(dlat * dlat + dlng * dlng) < 100;
    });
    if (nearby === -1) {
      deduped.push(c);
    } else if (c.osmAcres > deduped[nearby].osmAcres) {
      deduped[nearby] = c;
    }
  }

  deduped.sort((a, b) => b.osmAcres - a.osmAcres);
  return deduped.slice(0, maxResults);
}
