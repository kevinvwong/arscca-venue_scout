export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { initDb, sql } from "@/lib/db";

const ALL_STATUSES = [
  "candidate",
  "shortlisted",
  "contacted",
  "responded",
  "site_visit",
  "approved",
  "declined",
  "archived",
];

export async function GET() {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  await initDb();

  const result = await sql`
    SELECT v.id, v.name, v.address, v.city, v.state, v.status, v.composite_score,
           v.owner_name, v.owner_email, v.owner_phone, v.estimated_acres, v.lot_type,
           v.google_place_id, v.updated_at,
           (SELECT MAX(sent_at) FROM venue_outreach WHERE venue_id = v.id) AS last_outreach_at,
           (SELECT MIN(follow_up_due_at) FROM venue_outreach WHERE venue_id = v.id AND follow_up_due_at > NOW() AND response_received_at IS NULL) AS follow_up_due_at
    FROM venues v
    ORDER BY v.composite_score DESC NULLS LAST, v.created_at ASC
  `;

  const venues = result.rows;

  // Group venues by status
  const columns = Object.fromEntries(ALL_STATUSES.map((s) => [s, []]));
  for (const venue of venues) {
    const bucket = columns[venue.status];
    if (bucket) {
      bucket.push(venue);
    }
  }

  // Follow-up alerts: contacted venues with outreach sent >7 days ago and no pending follow-up
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const followUpAlerts = venues.filter(
    (v) =>
      v.status === "contacted" &&
      v.last_outreach_at !== null &&
      new Date(v.last_outreach_at) < sevenDaysAgo &&
      v.follow_up_due_at === null
  );

  return NextResponse.json({ columns, followUpAlerts });
}
