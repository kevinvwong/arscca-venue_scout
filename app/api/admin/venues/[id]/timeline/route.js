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

  const [venueResult, notesResult, outreachResult, assessmentsResult] = await Promise.all([
    sql`SELECT id, name, city, state, status FROM venues WHERE id = ${id} LIMIT 1`,
    sql`
      SELECT id, note_type, body, created_at
      FROM venue_notes
      WHERE venue_id = ${id}
      ORDER BY created_at DESC
    `,
    sql`
      SELECT id, channel, subject, sent_at, response_received_at, response_notes, ai_drafted, follow_up_due_at
      FROM venue_outreach
      WHERE venue_id = ${id}
      ORDER BY sent_at DESC NULLS LAST
    `,
    sql`
      SELECT id, suitability_score, confidence, assessment_notes, assessed_at, model
      FROM venue_ai_assessments
      WHERE venue_id = ${id}
      ORDER BY assessed_at DESC
    `,
  ]);

  const notes = notesResult.rows.map((r) => ({
    type: "note",
    date: r.created_at,
    id: r.id,
    note_type: r.note_type,
    body: r.body,
  }));

  const outreach = outreachResult.rows.map((r) => ({
    type: "outreach",
    date: r.sent_at,
    id: r.id,
    channel: r.channel,
    subject: r.subject,
    sent_at: r.sent_at,
    response_received_at: r.response_received_at,
    response_notes: r.response_notes,
    ai_drafted: r.ai_drafted,
    follow_up_due_at: r.follow_up_due_at,
  }));

  const assessments = assessmentsResult.rows.map((r) => ({
    type: "assessment",
    date: r.assessed_at,
    id: r.id,
    suitability_score: r.suitability_score,
    confidence: r.confidence,
    assessment_notes: r.assessment_notes,
    assessed_at: r.assessed_at,
    model: r.model,
  }));

  const timeline = [...notes, ...outreach, ...assessments].sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return db - da;
  });

  const venue = venueResult.rows[0] ?? null;
  if (!venue) {
    return NextResponse.json({ error: "Venue not found." }, { status: 404 });
  }

  return NextResponse.json({ venue, timeline });
}
