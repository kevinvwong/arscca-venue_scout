export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { initDb, sql } from "@/lib/db";

export async function GET() {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  await initDb();

  const result = await sql`
    SELECT * FROM search_profiles
    ORDER BY last_searched_at DESC NULLS LAST, created_at DESC
  `;

  return NextResponse.json({ profiles: result.rows });
}

export async function POST(req) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  await initDb();

  const body = await req.json();
  const { name, center_lat, center_lng, radius_miles, lot_types } = body;

  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (center_lat == null || center_lng == null) {
    return NextResponse.json({ error: "center_lat and center_lng are required." }, { status: 400 });
  }

  const userId = guard.session.user.userId ?? null;
  const radiusMiles = radius_miles != null ? Number(radius_miles) : 30;
  const lotTypes = Array.isArray(lot_types) ? lot_types : [];

  const result = await sql`
    INSERT INTO search_profiles (name, center_lat, center_lng, radius_miles, lot_types, created_by, last_searched_at)
    VALUES (${name.trim()}, ${center_lat}, ${center_lng}, ${radiusMiles}, ${lotTypes}, ${userId}, NOW())
    RETURNING *
  `;

  return NextResponse.json({ profile: result.rows[0] }, { status: 201 });
}
