export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { sql, initDb } from "@/lib/db";

const MAX_RADIUS = 50000;
const DEFAULT_RADIUS = 5000;
const MAX_RESULTS = 20;
const PARKING_KEYWORD = "parking lot|fairground|stadium|convention center";

export async function GET(req) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Google Maps not configured" },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "lat and lng query params are required" },
      { status: 400 }
    );
  }

  const rawRadius = parseInt(searchParams.get("radius") ?? DEFAULT_RADIUS, 10);
  const radius = Math.min(isNaN(rawRadius) ? DEFAULT_RADIUS : rawRadius, MAX_RADIUS);
  const type = searchParams.get("type") || "parking";

  const placesUrl = new URL(
    "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
  );
  placesUrl.searchParams.set("location", `${lat},${lng}`);
  placesUrl.searchParams.set("radius", String(radius));
  placesUrl.searchParams.set("type", type);
  placesUrl.searchParams.set("key", key);
  if (type === "parking") {
    placesUrl.searchParams.set("keyword", PARKING_KEYWORD);
  }

  const res = await fetch(placesUrl.toString());
  const data = await res.json();

  const results = (data.results ?? []).slice(0, MAX_RESULTS);

  const places = results.map((result) => ({
    placeId: result.place_id,
    name: result.name,
    address: result.vicinity,
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    types: result.types,
    rating: result.rating || null,
    userRatingsTotal: result.user_ratings_total || null,
    photoRef: result.photos?.[0]?.photo_reference || null,
  }));

  // Check which place IDs already exist in our venues table
  const placeIds = places.map((p) => p.placeId);

  await initDb();

  let existingMap = {};
  if (placeIds.length > 0) {
    const existing = await sql`
      SELECT google_place_id, status
      FROM venues
      WHERE google_place_id = ANY(${placeIds})
    `;
    for (const row of existing.rows) {
      existingMap[row.google_place_id] = row.status;
    }
  }

  const merged = places.map((place) => ({
    ...place,
    existingStatus: existingMap[place.placeId] ?? null,
  }));

  return NextResponse.json({ places: merged });
}
