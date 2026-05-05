import { sql } from "@vercel/postgres";

export { sql };

let initialized = false;

export async function initDb() {
  if (initialized) return;

  await sql`
    CREATE TABLE IF NOT EXISTS organizations (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      type        TEXT,
      website_url TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      org_id        INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
      email         TEXT UNIQUE NOT NULL,
      name          TEXT,
      role          TEXT NOT NULL DEFAULT 'organizer',
      region        TEXT,
      password_hash TEXT,
      is_active     BOOLEAN NOT NULL DEFAULT TRUE,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS venues (
      id                    SERIAL PRIMARY KEY,
      org_id                INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
      name                  TEXT NOT NULL,
      address               TEXT,
      city                  TEXT,
      state                 CHAR(2),
      zip                   TEXT,
      lat                   NUMERIC(9,6),
      lng                   NUMERIC(9,6),
      estimated_acres       NUMERIC(5,2),
      lot_type              TEXT,
      surface               TEXT,
      obstacle_score        INTEGER,
      highway_access_score  INTEGER,
      composite_score       INTEGER,
      source                TEXT NOT NULL DEFAULT 'manual',
      google_place_id       TEXT,
      status                TEXT NOT NULL DEFAULT 'candidate',
      region                TEXT,
      owner_name            TEXT,
      owner_email           TEXT,
      owner_phone           TEXT,
      owner_source          TEXT,
      notes                 TEXT,
      added_by              INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      updated_at            TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_venues_status ON venues(status)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_venues_state ON venues(state)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS venue_outreach (
      id                   SERIAL PRIMARY KEY,
      venue_id             INTEGER REFERENCES venues(id) ON DELETE CASCADE,
      sent_by              INTEGER REFERENCES users(id) ON DELETE SET NULL,
      channel              TEXT NOT NULL DEFAULT 'email',
      sent_at              TIMESTAMPTZ,
      subject              TEXT,
      body                 TEXT,
      ai_drafted           BOOLEAN DEFAULT FALSE,
      response_received_at TIMESTAMPTZ,
      response_notes       TEXT,
      follow_up_due_at     TIMESTAMPTZ,
      created_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS venue_notes (
      id         SERIAL PRIMARY KEY,
      venue_id   INTEGER REFERENCES venues(id) ON DELETE CASCADE,
      author_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      body       TEXT NOT NULL,
      note_type  TEXT NOT NULL DEFAULT 'general',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS venue_ai_assessments (
      id                     SERIAL PRIMARY KEY,
      venue_id               INTEGER REFERENCES venues(id) ON DELETE CASCADE,
      model                  TEXT NOT NULL,
      satellite_image_url    TEXT,
      satellite_zoom         INTEGER DEFAULT 18,
      raw_response           JSONB,
      estimated_total_acres  NUMERIC(5,2),
      estimated_clear_acres  NUMERIC(5,2),
      surface_type           TEXT,
      obstacle_density       TEXT,
      obstacle_types         TEXT[],
      has_internal_curbs     BOOLEAN,
      has_light_poles        BOOLEAN,
      has_landscaping_islands BOOLEAN,
      suitability_score      INTEGER,
      confidence             TEXT,
      assessment_notes       TEXT,
      assessed_at            TIMESTAMPTZ DEFAULT NOW(),
      assessed_by            INTEGER REFERENCES users(id) ON DELETE SET NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS search_profiles (
      id               SERIAL PRIMARY KEY,
      org_id           INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
      created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name             TEXT NOT NULL,
      center_lat       NUMERIC(9,6),
      center_lng       NUMERIC(9,6),
      radius_miles     INTEGER DEFAULT 30,
      min_acres        NUMERIC(5,2) DEFAULT 4.0,
      lot_types        TEXT[],
      last_searched_at TIMESTAMPTZ,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  initialized = true;
}
