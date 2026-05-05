export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { initDb, sql } from "@/lib/db";

export async function POST(req, { params }) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  await initDb();

  const { id } = params;
  const body = await req.json();
  const {
    actualAcres,
    surfaceCondition,
    perimeterDescription,
    restroomsOnSite,
    electricalAccess,
    securityAvailable,
    nearestHospital,
    photoLinks,
    additionalNotes,
  } = body;

  const visitDate = new Date().toISOString().slice(0, 10);

  const noteBody = [
    `SITE VISIT CHECKLIST`,
    `Date: ${visitDate}`,
    `Actual usable acres: ${actualAcres ?? ""}`,
    `Surface condition: ${surfaceCondition != null ? `${surfaceCondition}/5` : ""}`,
    `Perimeter: ${perimeterDescription ?? ""}`,
    `Restrooms on site: ${restroomsOnSite ? "Yes" : "No"}`,
    `Electrical access: ${electricalAccess ? "Yes" : "No"}`,
    `Security/overnight storage: ${securityAvailable ? "Yes" : "No"}`,
    `Nearest hospital: ${nearestHospital ?? ""}`,
    `Photo links: ${photoLinks ?? ""}`,
    `Additional notes: ${additionalNotes ?? ""}`,
  ].join("\n");

  const result = await sql`
    INSERT INTO venue_notes (venue_id, body, note_type, created_at)
    VALUES (${id}, ${noteBody}, 'site_visit', NOW())
    RETURNING id
  `;

  const noteId = result.rows[0]?.id;

  return NextResponse.json({ ok: true, noteId });
}
