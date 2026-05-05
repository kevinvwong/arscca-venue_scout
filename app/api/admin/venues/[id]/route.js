import { NextResponse } from "next/server";
import { sql, initDb } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req, { params }) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  await initDb();

  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "Invalid venue ID." }, { status: 400 });

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const ALLOWED = [
    "name","address","city","state","zip","lat","lng","estimated_acres",
    "lot_type","surface","status","region","notes",
    "owner_name","owner_email","owner_phone","owner_source",
    "obstacle_score","highway_access_score","composite_score",
    "custom_score","custom_score_note",
  ];

  const updates = Object.fromEntries(
    Object.entries(body).filter(([k]) => ALLOWED.includes(k))
  );

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(", ");
  const values = [id, ...Object.values(updates)];

  const { rows } = await sql.query(
    `UPDATE venues SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    values
  );

  if (!rows.length) return NextResponse.json({ error: "Venue not found." }, { status: 404 });
  return NextResponse.json({ venue: rows[0] });
}

export async function DELETE(req, { params }) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  await initDb();

  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "Invalid venue ID." }, { status: 400 });

  await sql`DELETE FROM venues WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
