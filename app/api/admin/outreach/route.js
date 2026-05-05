import { NextResponse } from "next/server";
import { sql, initDb } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  await initDb();

  const { searchParams } = new URL(req.url);
  const status   = searchParams.get("status");   // 'sent' | 'draft' | 'responded' | null
  const venue_id = searchParams.get("venue_id"); // optional

  const result = await sql`
    SELECT o.id, o.channel, o.subject, o.body, o.ai_drafted,
           o.sent_at, o.response_received_at, o.response_notes,
           o.follow_up_due_at, o.created_at,
           v.id AS venue_id, v.name AS venue_name, v.city, v.state,
           v.status AS venue_status, v.owner_name, v.owner_email
    FROM venue_outreach o
    JOIN venues v ON v.id = o.venue_id
    ORDER BY COALESCE(o.sent_at, o.created_at) DESC
  `;

  let rows = result.rows;

  // Filter by venue_id if provided
  if (venue_id) {
    const vid = Number(venue_id);
    rows = rows.filter((r) => r.venue_id === vid);
  }

  // Filter by status tab
  if (status === "sent") {
    rows = rows.filter((r) => r.sent_at !== null);
  } else if (status === "draft") {
    rows = rows.filter((r) => r.sent_at === null);
  } else if (status === "responded") {
    rows = rows.filter((r) => r.response_received_at !== null);
  }

  return NextResponse.json({ outreach: rows });
}

export async function POST(req) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  await initDb();

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { venue_id, channel, notes, sent_at } = body;

  if (!venue_id) {
    return NextResponse.json({ error: "venue_id is required." }, { status: 400 });
  }

  const VALID_CHANNELS = ["phone", "in_person"];
  if (!VALID_CHANNELS.includes(channel)) {
    return NextResponse.json({ error: "channel must be 'phone' or 'in_person'." }, { status: 400 });
  }

  const sentAt = sent_at ? new Date(sent_at) : new Date();

  const result = await sql`
    INSERT INTO venue_outreach (venue_id, channel, body, sent_at, ai_drafted, created_at)
    VALUES (${Number(venue_id)}, ${channel}, ${notes || null}, ${sentAt.toISOString()}, FALSE, NOW())
    RETURNING *
  `;

  return NextResponse.json({ record: result.rows[0] }, { status: 201 });
}
