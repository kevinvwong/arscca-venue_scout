export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { initDb, sql } from "@/lib/db";

const VALID_STATUSES = [
  "candidate",
  "shortlisted",
  "contacted",
  "responded",
  "site_visit",
  "approved",
  "declined",
  "archived",
];

export async function POST(req, { params }) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  await initDb();

  const { id } = params;
  const body = await req.json();
  const { status, declineReason, declineCategory } = body;

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}.` },
      { status: 400 }
    );
  }

  // Advance the venue status
  await sql`
    UPDATE venues
    SET status = ${status}, updated_at = NOW()
    WHERE id = ${id}
  `;

  // Mark most recent pending outreach as responded
  if (status === "responded") {
    await sql`
      UPDATE venue_outreach
      SET response_received_at = NOW()
      WHERE id = (
        SELECT id FROM venue_outreach
        WHERE venue_id = ${id}
          AND response_received_at IS NULL
          AND sent_at IS NOT NULL
        ORDER BY sent_at DESC
        LIMIT 1
      )
    `;
  }

  // Log decline reason as a note
  if (status === "declined" && declineReason) {
    const noteBody = declineCategory
      ? `[${declineCategory}] ${declineReason}`
      : declineReason;

    await sql`
      INSERT INTO venue_notes (venue_id, body, note_type, created_at)
      VALUES (${id}, ${noteBody}, 'decline_reason', NOW())
    `;
  }

  const updated = await sql`SELECT * FROM venues WHERE id = ${id}`;
  const venue = updated.rows[0];

  if (!venue) {
    return NextResponse.json({ error: "Venue not found." }, { status: 404 });
  }

  return NextResponse.json({ venue });
}
