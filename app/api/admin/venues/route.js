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

const VALID_STATUSES = ["candidate","shortlisted","contacted","responded","site_visit","approved","declined","archived"];
const VALID_SOURCES  = ["google_places", "osm", "manual"];

/**
 * Insert (or revive a previously-declined/archived) venue.
 *
 * Returns one of:
 *   { ok: true, venue, revived: boolean }
 *   { ok: false, error: string, status: number }
 *
 * Used by both the single-venue POST below and the batch POST in
 * app/api/admin/venues/batch/route.js. Do NOT duplicate this logic elsewhere.
 */
export async function addVenue(body, addedBy) {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid venue payload.", status: 400 };
  }

  const {
    name, address, city, state, zip,
    lat, lng, estimated_acres, lot_type, surface,
    highway_access_score,
    notes, owner_name, owner_email, owner_phone,
    region, status: bodyStatus,
    source: bodySource, google_place_id,
  } = body;

  if (!name?.trim()) {
    return { ok: false, error: "Venue name is required.", status: 400 };
  }

  const status = VALID_STATUSES.includes(bodyStatus) ? bodyStatus : "candidate";
  const source = VALID_SOURCES.includes(bodySource) ? bodySource : "manual";

  // If a venue with this google_place_id already exists and was previously
  // declined/archived, revive it instead of inserting (would violate the
  // unique index on google_place_id).
  if (google_place_id) {
    const existing = await sql`
      SELECT id, status FROM venues WHERE google_place_id = ${google_place_id} LIMIT 1
    `;
    const prior = existing.rows[0];
    if (prior && (prior.status === "declined" || prior.status === "archived")) {
      const revived = await sql`
        UPDATE venues
        SET status = ${status}, updated_at = NOW()
        WHERE id = ${prior.id}
        RETURNING *
      `;
      return { ok: true, venue: revived.rows[0], revived: true };
    }
    if (prior) {
      return {
        ok: false,
        error: "Venue is already in the pipeline.",
        status: 409,
        existingId: prior.id,
        existingStatus: prior.status,
      };
    }
  }

  const result = await sql`
    INSERT INTO venues (
      name, address, city, state, zip, lat, lng,
      estimated_acres, lot_type, surface, highway_access_score, notes,
      owner_name, owner_email, owner_phone, region, status,
      source, google_place_id, added_by
    ) VALUES (
      ${name.trim()},
      ${address || null}, ${city || null}, ${state || null}, ${zip || null},
      ${lat ? Number(lat) : null}, ${lng ? Number(lng) : null},
      ${estimated_acres ? Number(estimated_acres) : null},
      ${lot_type || null}, ${surface || null},
      ${highway_access_score ? Number(highway_access_score) : null},
      ${notes || null},
      ${owner_name || null}, ${owner_email || null}, ${owner_phone || null},
      ${region || null}, ${status}, ${source}, ${google_place_id || null}, ${addedBy}
    )
    RETURNING *
  `;

  return { ok: true, venue: result.rows[0], revived: false };
}

export async function resolveAddedByUserId(email) {
  if (!email) return null;
  const uRow = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
  return uRow.rows[0]?.id ?? null;
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

  const addedBy = await resolveAddedByUserId(session.user.email);

  let result;
  try {
    result = await addVenue(body, addedBy);
  } catch (err) {
    return NextResponse.json({ error: err.message || "Failed to add venue." }, { status: 500 });
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status || 400 });
  }

  // Preserve historical status codes: 200 for revive, 201 for new insert.
  return NextResponse.json({ venue: result.venue }, { status: result.revived ? 200 : 201 });
}
