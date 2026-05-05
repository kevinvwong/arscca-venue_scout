export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/require-admin";
import { sql, initDb } from "@/lib/db";

export async function GET() {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  await initDb();

  const result = await sql`
    SELECT id, email, name, role, region, is_active, created_at
    FROM users
    ORDER BY created_at ASC
  `;

  return NextResponse.json({ users: result.rows });
}

export async function POST(req) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  await initDb();

  const body = await req.json();
  const { email, name, password, role = "organizer" } = body;

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase().trim()}`;
  if (existing.rows.length > 0) {
    return NextResponse.json({ error: "A user with that email already exists." }, { status: 409 });
  }

  const password_hash = await bcrypt.hash(password, 12);

  const inserted = await sql`
    INSERT INTO users (email, name, role, password_hash, is_active)
    VALUES (${email.toLowerCase().trim()}, ${name || null}, ${role}, ${password_hash}, TRUE)
    RETURNING id, email, name, role
  `;

  return NextResponse.json({ user: inserted.rows[0] }, { status: 201 });
}
