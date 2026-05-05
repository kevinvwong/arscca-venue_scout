export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { initDb, sql } from "@/lib/db";

export async function GET(req, { params }) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  await initDb();

  const { id } = params;

  const venueResult = await sql`
    SELECT * FROM venues WHERE id = ${id} AND status = 'approved'
  `;
  if (!venueResult.rows.length) {
    return NextResponse.json({ error: "Venue not found or not approved." }, { status: 404 });
  }
  const venue = venueResult.rows[0];

  const notesResult = await sql`
    SELECT * FROM venue_notes WHERE venue_id = ${id} ORDER BY created_at DESC
  `;

  const assessmentResult = await sql`
    SELECT * FROM venue_ai_assessments WHERE venue_id = ${id} ORDER BY assessed_at DESC LIMIT 1
  `;

  const outreachResult = await sql`
    SELECT * FROM venue_outreach WHERE venue_id = ${id} AND sent_at IS NOT NULL ORDER BY sent_at ASC
  `;

  const slug = (venue.name || "venue")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  const payload = {
    exportedAt: new Date().toISOString(),
    source: "venuescout",
    version: "1",
    venue: {
      ...venue,
      notes: notesResult.rows,
      latestAssessment: assessmentResult.rows[0] ?? null,
      outreachHistory: outreachResult.rows,
    },
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="venue-${id}-${slug}.json"`,
    },
  });
}
