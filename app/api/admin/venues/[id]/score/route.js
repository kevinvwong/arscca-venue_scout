import { NextResponse } from "next/server";
import { sql, initDb } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  await initDb();

  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "Invalid venue ID." }, { status: 400 });

  const { rows } = await sql.query(
    "SELECT id, name, lat, lng FROM venues WHERE id = $1 LIMIT 1",
    [id]
  );
  if (!rows.length) return NextResponse.json({ error: "Venue not found." }, { status: 404 });

  const venue = rows[0];

  const { scoreVenue, isScoreConfigured } = await import("@/lib/score-venue");

  if (!isScoreConfigured()) {
    return NextResponse.json(
      { error: "AI scoring not configured. Set ANTHROPIC_API_KEY and GOOGLE_MAPS_API_KEY." },
      { status: 503 }
    );
  }

  const assessment = await scoreVenue({
    venueId: id,
    lat: venue.lat,
    lng: venue.lng,
    name: venue.name,
  });

  return NextResponse.json({ ok: true, assessment });
}
