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

  const result = await sql`
    SELECT * FROM venue_notes WHERE venue_id = ${id} ORDER BY created_at DESC
  `;

  return NextResponse.json({ notes: result.rows });
}

export async function POST(req, { params }) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  await initDb();

  const { id } = params;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const noteBody = body.body?.trim();
  if (!noteBody) {
    return NextResponse.json({ error: "body is required." }, { status: 400 });
  }

  const noteType = body.note_type?.trim() || "general";

  const result = await sql`
    INSERT INTO venue_notes (venue_id, body, note_type)
    VALUES (${id}, ${noteBody}, ${noteType})
    RETURNING *
  `;

  return NextResponse.json({ note: result.rows[0] }, { status: 201 });
}
