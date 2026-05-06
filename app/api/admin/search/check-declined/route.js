export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { initDb, sql } from "@/lib/db";

export async function GET(req) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  await initDb();

  const { searchParams } = new URL(req.url);
  const placeId = searchParams.get("place_id");

  if (!placeId) {
    return NextResponse.json({ error: "place_id is required." }, { status: 400 });
  }

  const venueRow = await sql`
    SELECT id, status, updated_at, notes
    FROM venues
    WHERE google_place_id = ${placeId} AND status = 'declined'
    ORDER BY updated_at DESC
    LIMIT 1
  `;

  if (venueRow.rows.length === 0) {
    return NextResponse.json({ declined: false });
  }

  const venue = venueRow.rows[0];

  // Decline reasons are written to venue_notes with note_type='decline_reason'
  // (see app/api/admin/pipeline/[id]/advance/route.js). Fall back to venues.notes
  // if no decline_reason note exists.
  const noteRow = await sql`
    SELECT body, created_at
    FROM venue_notes
    WHERE venue_id = ${venue.id} AND note_type = 'decline_reason'
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const reason = noteRow.rows[0]?.body ?? venue.notes ?? null;

  return NextResponse.json({
    declined: true,
    reason,
    declined_at: venue.updated_at,
  });
}
