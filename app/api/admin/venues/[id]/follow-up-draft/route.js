import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireAdmin } from "@/lib/require-admin";
import { initDb, sql } from "@/lib/db";
import { buildFollowUpPrompt } from "@/lib/draft-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Drafts a short follow-up "nudge" email for an overdue contacted venue.
// Looks up the most recent venue_outreach row, references its sent date in
// the prompt, and returns { subject, body, outreachId } so the existing
// /api/admin/outreach/[id]/send route can deliver it.
export async function POST(req, { params }) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid venue ID." }, { status: 400 });
  }

  await initDb();

  // Fetch venue (same fields the regular draft uses, so the prompt context
  // can stay consistent).
  const venueResult = await sql`
    SELECT name, address, city, state, estimated_acres, lot_type, owner_name,
           highway_access_score
    FROM venues
    WHERE id = ${id}
  `;
  const venue = venueResult.rows[0];
  if (!venue) {
    return NextResponse.json({ error: "Venue not found." }, { status: 404 });
  }

  // Most recent prior outreach — the one we're following up on. Must have a
  // sent_at, otherwise there's nothing to follow up on.
  const priorResult = await sql`
    SELECT id, sent_at, subject, body, response_received_at
    FROM venue_outreach
    WHERE venue_id = ${id} AND sent_at IS NOT NULL
    ORDER BY sent_at DESC
    LIMIT 1
  `;
  const prior = priorResult.rows[0] ?? null;
  if (!prior) {
    return NextResponse.json(
      { error: "No prior outreach to follow up on." },
      { status: 400 }
    );
  }

  // Soft mention only — pull the latest assessment but the prompt builder
  // will condense it to at most one short clause.
  const assessmentResult = await sql`
    SELECT estimated_total_acres, estimated_clear_acres, surface_type,
           obstacle_density, suitability_score, confidence, assessment_notes
    FROM venue_ai_assessments
    WHERE venue_id = ${id}
    ORDER BY assessed_at DESC
    LIMIT 1
  `;
  const assessment = assessmentResult.rows[0] ?? null;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const eventType = body.eventType ?? "teen driver safety training event";
  const orgName = body.orgName ?? "our organization";
  const contactName = body.contactName ?? null;

  // Normalize sent_at to an ISO string for the prompt (pg may return a Date).
  const sentAtIso =
    prior.sent_at instanceof Date
      ? prior.sent_at.toISOString()
      : new Date(prior.sent_at).toISOString();

  const prompt = buildFollowUpPrompt({
    venue,
    assessment,
    priorOutreach: {
      sent_at: sentAtIso,
      subject: prior.subject,
    },
    eventType,
    orgName,
    contactName,
  });

  // Same model as the regular draft — keep behavior consistent. The
  // follow-up is shorter so we cap max_tokens lower to discourage drift.
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let message;
  try {
    message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (err) {
    return NextResponse.json(
      { error: "AI request failed.", detail: err.message },
      { status: 502 }
    );
  }

  const rawText = message.content?.[0]?.text ?? "";
  let subject, emailBody;
  try {
    const parsed = JSON.parse(rawText);
    subject = parsed.subject;
    emailBody = parsed.body;
    if (!subject || !emailBody) throw new Error("Missing fields");
  } catch {
    return NextResponse.json(
      { error: "Failed to parse AI response." },
      { status: 500 }
    );
  }

  // Insert a new outreach row for this follow-up so the existing
  // /api/admin/outreach/[id]/send route can update sent_at + follow_up_due_at
  // when we send. ai_drafted=TRUE matches draft-outreach behavior.
  const outreachResult = await sql`
    INSERT INTO venue_outreach (venue_id, channel, ai_drafted, subject, body, created_at)
    VALUES (${id}, 'email', TRUE, ${subject}, ${emailBody}, NOW())
    RETURNING id
  `;
  const outreachId = outreachResult.rows[0]?.id ?? null;

  return NextResponse.json({
    ok: true,
    subject,
    body: emailBody,
    outreachId,
    priorSentAt: sentAtIso,
  });
}
