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

  const [
    totalResult,
    byStatusResult,
    scoredResult,
    ownerIdentifiedResult,
    outreachSentResult,
    approvedResult,
    followUpResult,
  ] = await Promise.all([
    // Total venues
    sql`SELECT COUNT(*)::int AS count FROM venues`,

    // Count by status
    sql`
      SELECT status, COUNT(*)::int AS count
      FROM venues
      GROUP BY status
    `,

    // Venues scored
    sql`SELECT COUNT(*)::int AS count FROM venues WHERE composite_score IS NOT NULL`,

    // Venues with owner identified
    sql`
      SELECT COUNT(*)::int AS count
      FROM venues
      WHERE owner_email IS NOT NULL OR owner_phone IS NOT NULL
    `,

    // Total outreach sent
    sql`SELECT COUNT(*)::int AS count FROM venue_outreach WHERE sent_at IS NOT NULL`,

    // Venues approved
    sql`SELECT COUNT(*)::int AS count FROM venues WHERE status = 'approved'`,

    // Follow-up alerts: contacted venues where last outreach > 7 days ago
    sql`
      SELECT COUNT(*)::int AS count
      FROM venues v
      WHERE v.status = 'contacted'
        AND (
          SELECT MAX(sent_at)
          FROM venue_outreach
          WHERE venue_id = v.id AND sent_at IS NOT NULL
        ) < NOW() - INTERVAL '7 days'
    `,
  ]);

  // Build byStatus map with all statuses defaulting to 0
  const byStatus = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0]));
  for (const row of byStatusResult.rows) {
    if (row.status in byStatus) {
      byStatus[row.status] = row.count;
    }
  }

  return NextResponse.json({
    stats: {
      total: totalResult.rows[0].count,
      byStatus,
      scored: scoredResult.rows[0].count,
      ownerIdentified: ownerIdentifiedResult.rows[0].count,
      outreachSent: outreachSentResult.rows[0].count,
      approved: approvedResult.rows[0].count,
      followUpAlerts: followUpResult.rows[0].count,
    },
  });
}
