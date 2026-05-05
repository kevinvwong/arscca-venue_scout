export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql, initDb } from "@/lib/db";

export async function POST(req) {
  const secret = process.env.TEST_SEED_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const authHeader = req.headers.get("x-seed-secret");
  if (!authHeader || authHeader !== secret) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;

  if (!email || !password) {
    return NextResponse.json({ error: "TEST_ADMIN_EMAIL or TEST_ADMIN_PASSWORD not set." }, { status: 503 });
  }

  await initDb();

  const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`;
  if (existing.rows.length > 0) {
    return NextResponse.json({ ok: true, action: "already_exists", id: existing.rows[0].id });
  }

  const hash = await bcrypt.hash(password, 12);
  const result = await sql`
    INSERT INTO users (email, name, role, password_hash, is_active)
    VALUES (${email.toLowerCase()}, 'Test Admin', 'admin', ${hash}, TRUE)
    RETURNING id, email, name, role
  `;

  return NextResponse.json({ ok: true, action: "created", user: result.rows[0] });
}
