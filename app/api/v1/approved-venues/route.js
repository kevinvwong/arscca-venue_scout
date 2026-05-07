export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { initDb, sql } from "@/lib/db";

function extractProvidedKey(req) {
  // Prefer Authorization: Bearer <key>; fall back to x-api-key.
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    const trimmed = authHeader.trim();
    // Match "Bearer <token>" case-insensitively, allowing extra whitespace.
    const match = /^Bearer\s+(.+)$/i.exec(trimmed);
    if (match) {
      return match[1].trim();
    }
  }

  const xApiKey = req.headers.get("x-api-key");
  if (xApiKey) {
    return xApiKey.trim();
  }

  return null;
}

function keysMatch(provided, expected) {
  // Constant-time comparison only when buffer lengths match;
  // bail out early on length mismatch without comparing.
  const providedBuf = Buffer.from(provided, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(providedBuf, expectedBuf);
}

export async function GET(req) {
  const configuredKey = (process.env.VENUESCOUT_API_KEY || "").trim();

  // Fail closed: refuse all requests when no key is configured.
  if (!configuredKey) {
    return NextResponse.json(
      { error: "API key not configured" },
      { status: 503 }
    );
  }

  const providedKey = extractProvidedKey(req);
  if (!providedKey || !keysMatch(providedKey, configuredKey)) {
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
