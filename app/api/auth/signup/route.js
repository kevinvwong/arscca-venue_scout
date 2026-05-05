import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql, initDb } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  await initDb();

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { email, name, password, role } = body;
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const normalEmail = email.trim().toLowerCase();
  const hash = await bcrypt.hash(password, 12);
  const userRole = ["organizer", "regional_coordinator", "admin"].includes(role) ? role : "organizer";

  try {
    const result = await sql`
      INSERT INTO users (email, name, password_hash, role)
      VALUES (${normalEmail}, ${name || null}, ${hash}, ${userRole})
      RETURNING id, email, name, role, created_at
    `;
    return NextResponse.json({ user: result.rows[0] }, { status: 201 });
  } catch (err) {
    if (err.message?.includes("unique")) {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }
    throw err;
  }
}
