const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const ACRES_PER_M2  = 0.000247105;
const MIN_SQ_FT     = 125_000;           // program minimum for a usable event site
const MIN_ACRES     = MIN_SQ_FT / 43560; // ≈ 2.87 acres
const MAX_ACRES     = 1000;

export function extractOsmAddress(tags) {
  const num    = tags["addr:housenumber"] ?? "";
  const street = tags["addr:street"]     ?? "";
  const city   = tags["addr:city"]       ?? "";
  const state  = tags["addr:state"]      ?? "";
  const zip    = tags["addr:postcode"]   ?? "";

  const line1 = [num, street].filter(Boolean).join(" ");
  const line2 = [city, state, zip].filter(Boolean).join(", ");
  const full  = [line1, line2].filter(Boolean).join(", ");
  return full || null;
}

export function extractOsmContact(tags) {
  return {
    ownerName:    tags.operator    || tags.brand  || null,
    ownerPhone:   tags["contact:phone"]   || tags.phone   || null,
    ownerEmail:   tags["contact:email"]   || tags.email   || null,
    ownerWebsite: tags["contact:website"] || tags.website || null,
  };
}

function hasRelevantTags(tags) {
  if (!tags) return false;
  return (
    tags.amenity === "parking" ||
    tags.amenity === "events_venue" ||
    tags.leisure === "parking" ||
    ["commercial", "industrial", "retail"].includes(tags.landuse) ||
    ["stadium", "sports_centre", "fairground", "race_track"].includes(tags.leisure)
  );
}

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
  const r = radiusMeters;
  // Query both way and relation types; drop the access filter so private/
  // customer lots are surfaced (organizers can negotiate access for events).
  const query = `
[out:json][timeout:28];
(
  way["amenity"="parking"](around:${r},${lat},${lng});
  way["leisure"="parking"](around:${r},${lat},${lng});
  way["landuse"~"^(commercial|industrial|retail)$"](around:${r},${lat},${lng});
  way["leisure"~"^(stadium|sports_centre|fairground|race_track)$"](around:${r},${lat},${lng});
  way["amenity"="events_venue"](around:${r},${lat},${lng});
  relation["amenity"="parking"](around:${r},${lat},${lng});
  relation["leisure"="parking"](around:${r},${lat},${lng});
  relation["landuse"~"^(commercial|industrial|retail)$"](around:${r},${lat},${lng});
  relation["leisure"~"^(stadium|sports_centre|fairground|race_track)$"](around:${r},${lat},${lng});
  relation["amenity"="events_venue"](around:${r},${lat},${lng});
);
out body;
>>;
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

  // Build geometry maps
  const nodeMap    = {};  // node id → {lat, lon}
  const wayNodeIds = {};  // way id → [node ids]

  for (const el of data.elements) {
    if (el.type === "node") {
      nodeMap[el.id] = { lat: el.lat, lon: el.lon };
    } else if (el.type === "way" && el.nodes) {
      wayNodeIds[el.id] = el.nodes;
    }
  }

  function resolveNodes(nodeIds) {
    return (nodeIds ?? []).map((id) => nodeMap[id]).filter(Boolean);
  }

  const candidates = [];
  const seenIds    = new Set();

  function addCandidate(osmId, tags, nodes, acres) {
    if (seenIds.has(osmId)) return;
    seenIds.add(osmId);
    const centroid = polygonCentroid(nodes);
    candidates.push({
      osmId,
      name:       tags.name || null,
      lat:        centroid.lat,
      lng:        centroid.lng,
      osmAcres:   parseFloat(acres.toFixed(2)),
      osmAddress: extractOsmAddress(tags),
      ...extractOsmContact(tags),
      tags,
    });
  }

  // Process directly tagged ways
  for (const el of data.elements) {
    if (el.type !== "way" || !hasRelevantTags(el.tags)) continue;
    const nodes = resolveNodes(wayNodeIds[el.id]);
    if (nodes.length < 3) continue;
    const acres = shoelaceAreaM2(nodes) * ACRES_PER_M2;
    if (acres < MIN_ACRES || acres > MAX_ACRES) continue;
    addCandidate(`osm_${el.id}`, el.tags, nodes, acres);
  }

  // Process relations — concatenate outer member ways into one polygon
  for (const el of data.elements) {
    if (el.type !== "relation") continue;
    const outerNodes = (el.members ?? [])
      .filter((m) => m.type === "way" && (m.role === "outer" || m.role === ""))
      .flatMap((m) => resolveNodes(wayNodeIds[m.ref]));
    if (outerNodes.length < 3) continue;
    const acres = shoelaceAreaM2(outerNodes) * ACRES_PER_M2;
    if (acres < MIN_ACRES || acres > MAX_ACRES) continue;
    addCandidate(`osm_r${el.id}`, el.tags || {}, outerNodes, acres);
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
