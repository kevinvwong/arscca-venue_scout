import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { addVenue, resolveAddedByUserId } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Batch-create venues. Accepts:
 *   { venues: [ { name, lat, lng, google_place_id, ... }, ... ] }
 *
 * Returns:
 *   { results: [ { index, ok, id?, revived?, error? }, ... ] }
 *
 * Per-row errors do NOT fail the whole request — the caller inspects each
 * result and surfaces success/failure inline. The HTTP status is 200 unless
 * the request itself is malformed or the user is unauthorized.
 */
export async function POST(req) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const { session } = guard;

  await initDb();

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const venues = Array.isArray(body?.venues) ? body.venues : null;
  if (!venues) {
    return NextResponse.json({ error: "Body must include a 'venues' array." }, { status: 400 });
  }
  if (venues.length === 0) {
    return NextResponse.json({ results: [] });
  }
  if (venues.length > 200) {
    return NextResponse.json({ error: "Batch limit is 200 venues." }, { status: 400 });
  }

  const addedBy = await resolveAddedByUserId(session.user.email);

  // Process sequentially: each addVenue does a SELECT-then-INSERT/UPDATE on the
  // same connection pool, and serializing keeps log output sane and avoids any
  // surprise contention on the unique google_place_id index. Latency is fine
  // for the expected batch sizes (client also caps parallelism on its side).
  const results = [];
  for (let i = 0; i < venues.length; i++) {
    try {
      const r = await addVenue(venues[i], addedBy);
      if (r.ok) {
        results.push({ index: i, ok: true, id: r.venue?.id, revived: !!r.revived });
      } else {
        results.push({ index: i, ok: false, error: r.error });
      }
    } catch (err) {
      results.push({ index: i, ok: false, error: err?.message || "Insert failed." });
    }
  }

  return NextResponse.json({ results });
}
