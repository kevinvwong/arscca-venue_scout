export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sql, initDb } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

const MAX_PLACES = 20;
const MAX_CONCURRENT = 10;

export async function POST(req) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  if (!process.env.ANTHROPIC_API_KEY || !process.env.GOOGLE_MAPS_API_KEY) {
    return NextResponse.json(
      { error: "AI scoring not configured. Set ANTHROPIC_API_KEY and GOOGLE_MAPS_API_KEY." },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const places = Array.isArray(body.places) ? body.places.slice(0, MAX_PLACES) : [];
  if (places.length === 0) {
    return NextResponse.json({ error: "No places provided." }, { status: 400 });
  }

  await initDb();

  const { scoreVenue } = await import("@/lib/score-venue");

  // Process up to MAX_CONCURRENT in parallel
  const batch = places.slice(0, MAX_CONCURRENT);

  const results = await Promise.allSettled(
    batch.map(async ({ placeId, name, address, lat, lng }) => {
      // 1. Find or insert venue row
      let venueId;

      const existing = await sql`
        SELECT id FROM venues WHERE google_place_id = ${placeId} LIMIT 1
      `;

      if (existing.rows.length > 0) {
        venueId = existing.rows[0].id;
        // Keep the row fresh
        await sql`
          UPDATE venues
          SET name = ${name}
          WHERE id = ${venueId}
        `;
      } else {
        const inserted = await sql`
          INSERT INTO venues (name, address, lat, lng, google_place_id, source, status)
          VALUES (
            ${name},
            ${address},
            ${lat},
            ${lng},
            ${placeId},
            ${"google_places"},
            ${"candidate"}
          )
          RETURNING id
        `;
        venueId = inserted.rows[0].id;
      }

      // 2. Score the venue
      const assessment = await scoreVenue({ venueId, lat, lng, name });

      return {
        placeId,
        venueId,
        composite_score: assessment.composite_score,
        ai_score: assessment.suitability_score,
        surface_type: assessment.surface_type,
        estimated_acres: assessment.estimated_total_acres,
        status: "ok",
      };
    })
  );

  const output = results.map((result, i) => {
    const place = batch[i];
    if (result.status === "fulfilled") {
      return result.value;
    } else {
      return {
        placeId: place.placeId,
        status: "error",
        error: result.reason?.message ?? "Unknown error",
      };
    }
  });

  return NextResponse.json({ results: output });
}
