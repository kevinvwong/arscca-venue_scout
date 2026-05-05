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
  const status = searchParams.get("status");
  const state  = searchParams.get("state");
  const search = searchParams.get("q");

  let venues;
  if (status && state && search) {
    const like = `%${search}%`;
    venues = await sql`
      SELECT * FROM venues
      WHERE status = ${status} AND state = ${state}
        AND (name ILIKE ${like} OR city ILIKE ${like} OR address ILIKE ${like})
      ORDER BY composite_score DESC NULLS LAST, created_at DESC
    `;
  } else if (status && state) {
    venues = await sql`
      SELECT * FROM venues WHERE status = ${status} AND state = ${state}
      ORDER BY composite_score DESC NULLS LAST, created_at DESC
    `;
  } else if (status && search) {
    const like = `%${search}%`;
    venues = await sql`
      SELECT * FROM venues WHERE status = ${status}
        AND (name ILIKE ${like} OR city ILIKE ${like} OR address ILIKE ${like})
      ORDER BY composite_score DESC NULLS LAST, created_at DESC
    `;
  } else if (state && search) {
    const like = `%${search}%`;
    venues = await sql`
      SELECT * FROM venues WHERE state = ${state}
        AND (name ILIKE ${like} OR city ILIKE ${like} OR address ILIKE ${like})
      ORDER BY composite_score DESC NULLS LAST, created_at DESC
    `;
  } else if (status) {
    venues = await sql`
      SELECT * FROM venues WHERE status = ${status}
      ORDER BY composite_score DESC NULLS LAST, created_at DESC
    `;
  } else if (state) {
    venues = await sql`
      SELECT * FROM venues WHERE state = ${state}
      ORDER BY composite_score DESC NULLS LAST, created_at DESC
    `;
  } else if (search) {
    const like = `%${search}%`;
    venues = await sql`
      SELECT * FROM venues
      WHERE name ILIKE ${like} OR city ILIKE ${like} OR address ILIKE ${like}
      ORDER BY composite_score DESC NULLS LAST, created_at DESC
    `;
  } else {
    venues = await sql`
      SELECT * FROM venues
      ORDER BY composite_score DESC NULLS LAST, created_at DESC
    `;
  }

  return NextResponse.json({ venues: venues.rows, total: venues.rows.length });
}

export async function POST(req) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const { session } = guard;

  await initDb();

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const {
    name, address, city, state, zip,
    lat, lng, estimated_acres, lot_type, surface,
    notes, owner_name, owner_email, owner_phone,
    region, status: bodyStatus,
    source: bodySource, google_place_id,
  } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Venue name is required." }, { status: 400 });
  }

  const uRow = await sql`SELECT id FROM users WHERE email = ${session.user.email} LIMIT 1`;
  const addedBy = uRow.rows[0]?.id ?? null;

  const VALID_STATUSES = ["candidate","shortlisted","contacted","responded","site_visit","approved","declined","archived"];
  const status = VALID_STATUSES.includes(bodyStatus) ? bodyStatus : "candidate";

  const VALID_SOURCES = ["google_places", "osm", "manual"];
  const source = VALID_SOURCES.includes(bodySource) ? bodySource : "manual";

  const result = await sql`
    INSERT INTO venues (
      name, address, city, state, zip, lat, lng,
      estimated_acres, lot_type, surface, notes,
      owner_name, owner_email, owner_phone, region, status,
      source, google_place_id, added_by
    ) VALUES (
      ${name.trim()},
      ${address || null}, ${city || null}, ${state || null}, ${zip || null},
      ${lat ? Number(lat) : null}, ${lng ? Number(lng) : null},
      ${estimated_acres ? Number(estimated_acres) : null},
      ${lot_type || null}, ${surface || null}, ${notes || null},
      ${owner_name || null}, ${owner_email || null}, ${owner_phone || null},
      ${region || null}, ${status}, ${source}, ${google_place_id || null}, ${addedBy}
    )
    RETURNING *
  `;

  return NextResponse.json({ venue: result.rows[0] }, { status: 201 });
}
