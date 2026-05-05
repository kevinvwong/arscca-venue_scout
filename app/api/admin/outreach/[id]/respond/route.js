import { NextResponse } from "next/server";
import { sql, initDb } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  await initDb();

  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "Invalid outreach ID." }, { status: 400 });

  let body = {};
  try { body = await req.json(); } catch { /* body is optional */ }

  const { responseNotes } = body;

  await sql`
    UPDATE venue_outreach
    SET response_received_at = NOW(),
        response_notes = ${responseNotes || null}
    WHERE id = ${id}
  `;

  return NextResponse.json({ ok: true });
}
