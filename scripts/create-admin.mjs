/**
 * Creates an admin user in the Neon database.
 * Run: node --env-file .env.local scripts/create-admin.mjs
 */

import bcrypt from "bcryptjs";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL not set. Run with: node --env-file .env.local scripts/create-admin.mjs");
  process.exit(1);
}

const email    = process.env.SEED_EMAIL    || "test@venuescount.dev";
const password = process.env.SEED_PASSWORD || "TireRack2026!";
const name     = process.env.SEED_NAME     || "Test Admin";

const sql = postgres(DATABASE_URL, { ssl: "require" });

async function run() {
  // Ensure users table exists
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      org_id        INTEGER,
      email         TEXT UNIQUE NOT NULL,
      name          TEXT,
      role          TEXT NOT NULL DEFAULT 'organizer',
      region        TEXT,
      password_hash TEXT,
      is_active     BOOLEAN NOT NULL DEFAULT TRUE,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  const hash = await bcrypt.hash(password, 12);

  const result = await sql`
    INSERT INTO users (email, name, role, password_hash, is_active)
    VALUES (${email}, ${name}, 'admin', ${hash}, TRUE)
    ON CONFLICT (email) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          name          = EXCLUDED.name,
          role          = 'admin',
          is_active     = TRUE
    RETURNING id, email, name, role
  `;

  const user = result[0];
  console.log("\nUser created/updated:");
  console.log("  ID:    ", user.id);
  console.log("  Email: ", user.email);
  console.log("  Name:  ", user.name);
  console.log("  Role:  ", user.role);
  console.log("\nCredentials:");
  console.log("  Email:   ", email);
  console.log("  Password:", password);
  console.log("\nIMPORTANT: Add this email to ADMIN_EMAILS in Vercel:");
  console.log(" ", email);

  await sql.end();
}

run().catch((err) => { console.error(err); process.exit(1); });
