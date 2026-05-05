import { NextResponse } from "next/server";
import { sql, initDb } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  await initDb();

  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "Invalid venue ID." }, { status: 400 });

  const { rows } = await sql.query(
    "SELECT * FROM venue_ai_assessments WHERE venue_id = $1 ORDER BY assessed_at DESC",
    [id]
  );

  return NextResponse.json({ assessments: rows });
}
