import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireAdmin } from "@/lib/require-admin";
import { initDb, sql } from "@/lib/db";
import { buildDraftPrompt } from "@/lib/draft-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid venue ID." }, { status: 400 });
  }

  await initDb();

  // Fetch venue (includes highway_access_score from Phase 3C)
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

  // Fetch latest AI assessment — surface details used to personalise the email.
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

  // Parse request body
  const body = await req.json().catch(() => ({}));
  const eventType = body.eventType ?? "teen driver safety training event";
  const orgName = body.orgName ?? "our organization";
  const eventDate = body.eventDate ?? null;
  const contactName = body.contactName ?? null;

  const prompt = buildDraftPrompt({
    venue,
    assessment,
    eventType,
    orgName,
    eventDate,
    contactName,
  });

  // Call Claude
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let message;
  try {
    message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (err) {
    return NextResponse.json(
      { error: "AI request failed.", detail: err.message },
      { status: 502 }
    );
  }

  // Parse JSON from response
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

  // Log as an outreach record
  const outreachResult = await sql`
    INSERT INTO venue_outreach (venue_id, channel, ai_drafted, subject, body, created_at)
    VALUES (${id}, 'email', TRUE, ${subject}, ${emailBody}, NOW())
    RETURNING id
  `;
  const outreachId = outreachResult.rows[0]?.id ?? null;

  return NextResponse.json({ ok: true, subject, body: emailBody, outreachId });
}
