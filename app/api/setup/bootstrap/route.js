export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql, initDb } from "@/lib/db";

// One-time bootstrap: creates the first admin user when the users table is empty.
// Blocked once any user exists.
export async function POST(req) {
  await initDb();

  const existing = await sql`SELECT COUNT(*) AS cnt FROM users`;
  if (Number(existing.rows[0].cnt) > 0) {
    return NextResponse.json(
      { error: "Setup already complete. Sign in at /auth/signin." },
      { status: 403 }
    );
  }

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { email, password, name } = body;
  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const hash = await bcrypt.hash(password.trim(), 12);
  const result = await sql`
    INSERT INTO users (email, name, role, password_hash, is_active)
    VALUES (
      ${email.trim().toLowerCase()},
      ${(name || email).trim()},
      'admin',
      ${hash},
      TRUE
    )
    RETURNING id, email, name, role
  `;

  return NextResponse.json({ ok: true, user: result.rows[0] });
}
