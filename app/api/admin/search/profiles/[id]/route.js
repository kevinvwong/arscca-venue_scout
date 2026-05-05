export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { initDb, sql } from "@/lib/db";

export async function DELETE(_req, { params }) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  await initDb();

  const { id } = params;

  const result = await sql`
    DELETE FROM search_profiles WHERE id = ${id} RETURNING id
  `;

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(_req, { params }) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  await initDb();

  const { id } = params;

  await sql`
    UPDATE search_profiles SET last_searched_at = NOW() WHERE id = ${id}
  `;

  return NextResponse.json({ ok: true });
}
