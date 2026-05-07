import { NextResponse } from "next/server";
import { sql, initDb } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { recomputeComposite } from "@/lib/score-venue";

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
    "needs_revisit","revisit_reason",
  ];

  const updates = Object.fromEntries(
    Object.entries(body).filter(([k]) => ALLOWED.includes(k))
  );

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  // Needs-revisit flag: orthogonal to pipeline status. Do NOT mutate `status`
  // here. If the flag is being set true, a non-empty (after-trim) reason is
  // required. If the flag is being set false, clear the reason to NULL so a
  // stale reason can't linger on a venue that no longer needs a revisit.
  if (Object.prototype.hasOwnProperty.call(updates, "needs_revisit")) {
    const flag = updates.needs_revisit;
    const boolFlag = flag === true || flag === "true";
    updates.needs_revisit = boolFlag;

    if (boolFlag) {
      const rawReason =
        Object.prototype.hasOwnProperty.call(updates, "revisit_reason")
          ? updates.revisit_reason
          : undefined;
      const trimmed = typeof rawReason === "string" ? rawReason.trim() : "";
      if (!trimmed) {
        return NextResponse.json(
          { error: "A reason is required when marking a venue as needs revisit." },
          { status: 400 }
        );
      }
      updates.revisit_reason = trimmed;
    } else {
      updates.revisit_reason = null;
    }
  } else if (Object.prototype.hasOwnProperty.call(updates, "revisit_reason")) {
    // Reason being updated without toggling the flag — trim, and treat
    // empty/whitespace as NULL.
    const r = updates.revisit_reason;
    const trimmed = typeof r === "string" ? r.trim() : "";
    updates.revisit_reason = trimmed ? trimmed : null;
  }

  // If estimated_acres is changing, recompute composite_score using the
  // canonical 50/35/15 weighting from lib/score-venue.js. Pull the latest
  // AI score from the most recent assessment, and the existing highway
  // score from the venue row itself.
  if (Object.prototype.hasOwnProperty.call(updates, "estimated_acres")) {
    const rawAcres = updates.estimated_acres;
    const newAcres =
      rawAcres === "" || rawAcres === null || rawAcres === undefined
        ? null
        : Number(rawAcres);

    const { rows: currentRows } = await sql`
      SELECT v.estimated_acres, v.highway_access_score,
             (SELECT a.suitability_score
                FROM venue_ai_assessments a
               WHERE a.venue_id = v.id
            ORDER BY a.assessed_at DESC
               LIMIT 1) AS ai_score
        FROM venues v
       WHERE v.id = ${id}
    `;

    if (!currentRows.length) {
      return NextResponse.json({ error: "Venue not found." }, { status: 404 });
    }

    const current = currentRows[0];
    const acresChanged =
      Number(current.estimated_acres ?? NaN) !== Number(newAcres ?? NaN) &&
      !(current.estimated_acres == null && newAcres == null);

    // Only recompute if the acreage actually changed and we have an AI
    // score to combine with — otherwise we'd just overwrite a valid
    // composite with null, or burn cycles for a no-op.
    if (acresChanged && current.ai_score !== null && current.ai_score !== undefined) {
      const newComposite = recomputeComposite({
        acres: newAcres,
        aiScore: current.ai_score,
        highwayScore: current.highway_access_score,
      });
      if (newComposite !== null) {
        updates.composite_score = newComposite;
      }
    }
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
