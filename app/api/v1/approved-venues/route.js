export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { initDb, sql } from "@/lib/db";

export async function GET(req) {
  const apiKey = process.env.VENUESCOUT_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured." }, { status: 503 });
  }

  const headerKey = req.headers.get("x-api-key");
  if (!headerKey || headerKey !== apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await initDb();

  const { searchParams } = new URL(req.url);
  const stateFilter = searchParams.get("state");

  let result;
  if (stateFilter) {
    result = await sql`
      SELECT
        id, name, address, city, state, zip, lat, lng,
        estimated_acres, lot_type, surface, composite_score,
        owner_name, owner_email, owner_phone, google_place_id, updated_at
      FROM venues
      WHERE status = 'approved' AND state = ${stateFilter}
      ORDER BY composite_score DESC NULLS LAST
    `;
  } else {
    result = await sql`
      SELECT
        id, name, address, city, state, zip, lat, lng,
        estimated_acres, lot_type, surface, composite_score,
        owner_name, owner_email, owner_phone, google_place_id, updated_at
      FROM venues
      WHERE status = 'approved'
      ORDER BY composite_score DESC NULLS LAST
    `;
  }

  return NextResponse.json({
    venues: result.rows,
    count: result.rows.length,
    generatedAt: new Date().toISOString(),
  });
}
