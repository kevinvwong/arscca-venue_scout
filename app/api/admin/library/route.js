export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { initDb, sql } from "@/lib/db";

async function fetchApprovedVenues({ state, q }) {
  if (state && q) {
    const like = `%${q}%`;
    return (
      await sql`
        SELECT v.*,
          (SELECT COUNT(*) FROM venue_outreach WHERE venue_id = v.id)::int AS outreach_count,
          (SELECT COUNT(*) FROM venue_notes WHERE venue_id = v.id)::int AS notes_count,
          (SELECT assessed_at FROM venue_ai_assessments WHERE venue_id = v.id ORDER BY assessed_at DESC LIMIT 1) AS last_assessed_at,
          (SELECT suitability_score FROM venue_ai_assessments WHERE venue_id = v.id ORDER BY assessed_at DESC LIMIT 1) AS ai_score,
          (SELECT assessment_notes FROM venue_ai_assessments WHERE venue_id = v.id ORDER BY assessed_at DESC LIMIT 1) AS assessment_notes
        FROM venues v
        WHERE v.status = 'approved'
          AND v.state = ${state}
          AND (v.name ILIKE ${like} OR v.city ILIKE ${like} OR v.address ILIKE ${like})
        ORDER BY v.composite_score DESC NULLS LAST, v.name ASC
      `
    ).rows;
  } else if (state) {
    return (
      await sql`
        SELECT v.*,
          (SELECT COUNT(*) FROM venue_outreach WHERE venue_id = v.id)::int AS outreach_count,
          (SELECT COUNT(*) FROM venue_notes WHERE venue_id = v.id)::int AS notes_count,
          (SELECT assessed_at FROM venue_ai_assessments WHERE venue_id = v.id ORDER BY assessed_at DESC LIMIT 1) AS last_assessed_at,
          (SELECT suitability_score FROM venue_ai_assessments WHERE venue_id = v.id ORDER BY assessed_at DESC LIMIT 1) AS ai_score,
          (SELECT assessment_notes FROM venue_ai_assessments WHERE venue_id = v.id ORDER BY assessed_at DESC LIMIT 1) AS assessment_notes
        FROM venues v
        WHERE v.status = 'approved'
          AND v.state = ${state}
        ORDER BY v.composite_score DESC NULLS LAST, v.name ASC
      `
    ).rows;
  } else if (q) {
    const like = `%${q}%`;
    return (
      await sql`
        SELECT v.*,
          (SELECT COUNT(*) FROM venue_outreach WHERE venue_id = v.id)::int AS outreach_count,
          (SELECT COUNT(*) FROM venue_notes WHERE venue_id = v.id)::int AS notes_count,
          (SELECT assessed_at FROM venue_ai_assessments WHERE venue_id = v.id ORDER BY assessed_at DESC LIMIT 1) AS last_assessed_at,
          (SELECT suitability_score FROM venue_ai_assessments WHERE venue_id = v.id ORDER BY assessed_at DESC LIMIT 1) AS ai_score,
          (SELECT assessment_notes FROM venue_ai_assessments WHERE venue_id = v.id ORDER BY assessed_at DESC LIMIT 1) AS assessment_notes
        FROM venues v
        WHERE v.status = 'approved'
          AND (v.name ILIKE ${like} OR v.city ILIKE ${like} OR v.address ILIKE ${like})
        ORDER BY v.composite_score DESC NULLS LAST, v.name ASC
      `
    ).rows;
  } else {
    return (
      await sql`
        SELECT v.*,
          (SELECT COUNT(*) FROM venue_outreach WHERE venue_id = v.id)::int AS outreach_count,
          (SELECT COUNT(*) FROM venue_notes WHERE venue_id = v.id)::int AS notes_count,
          (SELECT assessed_at FROM venue_ai_assessments WHERE venue_id = v.id ORDER BY assessed_at DESC LIMIT 1) AS last_assessed_at,
          (SELECT suitability_score FROM venue_ai_assessments WHERE venue_id = v.id ORDER BY assessed_at DESC LIMIT 1) AS ai_score,
          (SELECT assessment_notes FROM venue_ai_assessments WHERE venue_id = v.id ORDER BY assessed_at DESC LIMIT 1) AS assessment_notes
        FROM venues v
        WHERE v.status = 'approved'
        ORDER BY v.composite_score DESC NULLS LAST, v.name ASC
      `
    ).rows;
  }
}

export async function GET(req) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  await initDb();

  const { searchParams } = new URL(req.url);
  const state     = searchParams.get("state")?.trim() || null;
  const q         = searchParams.get("q")?.trim()     || null;
  const doExport  = searchParams.get("export") === "1";

  const rows = await fetchApprovedVenues({ state, q });

  if (doExport) {
    const payload = {
      exportedAt: new Date().toISOString(),
      source: "venuescout",
      version: "1",
      filters: { state, q },
      venues: rows,
    };
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="approved-venues-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  }

  return NextResponse.json({ venues: rows });
}
