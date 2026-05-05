export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { sql, initDb } from "@/lib/db";

const VALID_ROLES = ["organizer", "regional_coordinator", "admin"];

export async function PATCH(req, { params }) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  await initDb();

  const { id } = params;
  const body = await req.json();
  const { role, is_active, name } = body;

  if (role !== undefined && !VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `Role must be one of: ${VALID_ROLES.join(", ")}.` },
      { status: 400 }
    );
  }

  // Build the SET clause dynamically from provided fields
  const updates = [];
  const values = [];

  if (name !== undefined) {
    values.push(name);
    updates.push(`name = $${values.length}`);
  }
  if (role !== undefined) {
    values.push(role);
    updates.push(`role = $${values.length}`);
  }
  if (is_active !== undefined) {
    values.push(Boolean(is_active));
    updates.push(`is_active = $${values.length}`);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  values.push(Number(id));
  const setClause = updates.join(", ");
  const idParam = `$${values.length}`;

  const result = await sql.query(
    `UPDATE users SET ${setClause} WHERE id = ${idParam}
     RETURNING id, email, name, role, region, is_active, created_at`,
    values
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  return NextResponse.json({ user: result.rows[0] });
}

export async function DELETE(_req, { params }) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  await initDb();

  const { id } = params;

  const result = await sql`
    UPDATE users SET is_active = FALSE WHERE id = ${Number(id)}
    RETURNING id
  `;

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
