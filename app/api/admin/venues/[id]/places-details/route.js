import { NextResponse } from "next/server";
import { sql, initDb } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  await initDb();

  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "Invalid venue ID." }, { status: 400 });

  const { rows } = await sql.query(
    "SELECT name, google_place_id FROM venues WHERE id = $1 LIMIT 1",
    [id]
  );
  if (!rows.length) return NextResponse.json({ error: "Venue not found." }, { status: 404 });

  const venue = rows[0];

  if (!venue.google_place_id) {
    return NextResponse.json(
      { error: "No Google Place ID on this venue. Add a place ID or fill owner info manually." },
      { status: 422 }
    );
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Google Maps API key not configured." },
      { status: 503 }
    );
  }

  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(venue.google_place_id)}` +
    `&fields=name,formatted_phone_number,website,url` +
    `&key=${apiKey}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== "OK" || !data.result) {
    return NextResponse.json(
      { error: "No details found for this place ID." },
      { status: 404 }
    );
  }

  const result = data.result;

  return NextResponse.json({
    name: result.name || null,
    phone: result.formatted_phone_number || null,
    website: result.website || null,
    googleUrl: result.url || null,
  });
}
