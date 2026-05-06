# VenueScout — Event Venue Discovery & Outreach Platform

**Project:** Venue Discovery, Owner Identification, and Outreach Pipeline for Outdoor Event Organizers
**Origin:** Spun off from TRSS Volunteer Management System (arscca-VMS), May 2026
**Pilot use case:** Tire Rack Street Survival — finding large paved lots for teen driver safety events
**Broader applicability:** Any event requiring a large flat outdoor site: autocross, car shows, drift days, food truck festivals, community events
**Status:** Phases 1–3, 5–6 complete; Phases 4, 7, 9 partial; Phases 8, 10 planned
**Last Updated:** May 6, 2026

---

## The Problem

Finding a suitable venue is the first and most operationally critical step in planning any outdoor event that needs a large paved surface. For TRSS schools specifically: a parking lot of 4–8+ acres, flat, paved, clear sightlines, minimal poles or curbs in the working area, accessible metro location.

Organizers currently find venues through personal connections, cold calls, and driving around looking for lots. There is no systematic way to identify candidates, no central record of who owns what, and no tracked outreach history. When an event moves to a new city, the organizer starts from zero.

This platform solves the full pipeline: **find → evaluate → identify owner → reach out → track response → approve**.

---

## What VenueScout Does

1. **Search** — Enter a city or radius. Surface large commercial lots, fairgrounds, racetracks, stadiums, and convention centers using mapping APIs and satellite imagery.
2. **Score automatically** — A vision AI (Claude) analyzes a satellite image of each candidate lot and returns a structured assessment: estimated clear usable area, surface type (asphalt/concrete/gravel), internal obstacle inventory (light poles, landscaping islands, speed bumps, curbs), obstacle density rating, and a composite suitability score (0–100). No manual checklist. No site visit required to get a useful first ranking.
3. **Rank and filter** — Composite score combines AI-assessed usable area + obstacle density + highway access time (Directions API). Organizer sees a ranked shortlist, not a raw dump of every lot in the search radius.
4. **Identify the owner** — Auto-populate from Google Places; link to county assessor records; manual override always available.
5. **Draft the inquiry** — AI writes a personalized outreach email tailored to the event type: who you are, what the event involves, what you're asking for.
6. **Track the pipeline** — `candidate → contacted → responded → site visit → approved → declined`. Every attempt logged. Follow-up reminders fire after N days of silence.
7. **Build institutional memory** — Approved venues, declined venues (with reasons), AI assessments, and contact notes persist. The next organizer in that region inherits everything instead of starting cold.

---

## Users

| Role | Description |
|------|-------------|
| **Event organizer** | Plans a specific event; searches venues in their region; manages outreach |
| **Regional coordinator** | Oversees multiple organizers in a geography; sees the full venue pipeline for their region |
| **Program admin** | National view; manages the approved venue library across all regions |

---

## Tech Stack (proposed)

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Next.js 14, App Router | Consistent with arscca-VMS; server components for data-heavy map views |
| Database | Neon PostgreSQL | Same provider as VMS; enables future cross-platform venue → event linking |
| Auth | NextAuth.js v4 + Google OAuth | Easier organizer onboarding than credentials-only |
| Maps | Google Maps JavaScript API | Interactive map + Places API for candidate search; satellite view for lot assessment |
| Geocoding | Google Geocoding API | Address → lat/lng for radius search |
| Property data | OpenStreetMap Overpass API | Free tier for lot geometry and area estimates; supplements Google Places |
| Email | Resend | Outreach emails sent on behalf of the organizer |
| AI — vision | Claude claude-sonnet-4-6 (multimodal) via Vercel AI Gateway | Satellite image analysis: usable area estimate, surface type, obstacle inventory, suitability score |
| AI — text | Claude via Vercel AI Gateway | Inquiry email drafting; lot description generation |
| Satellite imagery | Google Maps Static API | Fetches fixed-zoom satellite image for each candidate lot; input to vision analysis |
| Hosting | Vercel | Serverless; consistent with arscca-VMS |
| Styling | Tailwind CSS v3 | Consistent design language |

---

## Data Model

```sql
-- Organizations using the platform (TRSS, an autocross club, etc.)
organizations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,                         -- 'driving_program' | 'autocross' | 'car_show' | 'other'
  website_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- Platform users
users (
  id SERIAL PRIMARY KEY,
  org_id INTEGER REFERENCES organizations(id),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'organizer',  -- 'organizer' | 'regional_coordinator' | 'admin'
  region TEXT,
  password_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- Venue candidates and approved sites
venues (
  id SERIAL PRIMARY KEY,
  org_id INTEGER REFERENCES organizations(id),
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state CHAR(2),
  zip TEXT,
  lat NUMERIC(9,6),
  lng NUMERIC(9,6),
  estimated_acres NUMERIC(5,2),
  lot_type TEXT,                     -- 'parking_lot' | 'fairground' | 'racetrack' | 'stadium' | 'convention_center' | 'other'
  surface TEXT,                      -- 'asphalt' | 'concrete' | 'gravel' | 'mixed' | 'unknown'
  obstacle_score INTEGER,            -- 1–5; 1 = clean open lot, 5 = heavy poles/curbs/islands
  highway_access_score INTEGER,      -- 1–5; 5 = direct highway exit nearby
  source TEXT,                       -- 'google_places' | 'osm' | 'manual'
  google_place_id TEXT,
  status TEXT NOT NULL DEFAULT 'candidate',
                                     -- candidate | shortlisted | contacted | responded |
                                     -- site_visit | approved | declined | archived
  region TEXT,
  owner_name TEXT,
  owner_email TEXT,
  owner_phone TEXT,
  owner_source TEXT,                 -- 'google_places' | 'assessor' | 'manual'
  notes TEXT,
  added_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

-- Every outreach attempt (email sent, call logged, etc.)
venue_outreach (
  id SERIAL PRIMARY KEY,
  venue_id INTEGER REFERENCES venues(id) ON DELETE CASCADE,
  sent_by INTEGER REFERENCES users(id),
  channel TEXT NOT NULL DEFAULT 'email',  -- 'email' | 'phone' | 'in_person'
  sent_at TIMESTAMPTZ,
  subject TEXT,
  body TEXT,
  ai_drafted BOOLEAN DEFAULT FALSE,
  response_received_at TIMESTAMPTZ,
  response_notes TEXT,
  follow_up_due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- Notes and site visit records
venue_notes (
  id SERIAL PRIMARY KEY,
  venue_id INTEGER REFERENCES venues(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES users(id),
  body TEXT NOT NULL,
  note_type TEXT DEFAULT 'general',       -- 'general' | 'site_visit' | 'owner_contact' | 'decline_reason'
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- AI satellite assessment per venue (one per analysis run; versioned)
venue_ai_assessments (
  id SERIAL PRIMARY KEY,
  venue_id INTEGER REFERENCES venues(id) ON DELETE CASCADE,
  model TEXT NOT NULL,                    -- 'claude-sonnet-4-6', etc.
  satellite_image_url TEXT,               -- Google Maps Static API URL used (cached)
  satellite_zoom INTEGER DEFAULT 18,
  raw_response JSONB,                     -- full AI response for auditing and re-scoring
  estimated_total_acres NUMERIC(5,2),     -- full lot polygon area
  estimated_clear_acres NUMERIC(5,2),     -- usable area after subtracting obstacles
  surface_type TEXT,                      -- 'asphalt' | 'concrete' | 'gravel' | 'mixed' | 'unknown'
  obstacle_density TEXT,                  -- 'none' | 'light' | 'moderate' | 'heavy'
  obstacle_types TEXT[],                  -- ['light_poles','curbs','landscaping','speed_bumps','medians']
  has_internal_curbs BOOLEAN,
  has_light_poles BOOLEAN,
  has_landscaping_islands BOOLEAN,
  suitability_score INTEGER,              -- 0–100 composite (higher = better for driving events)
  confidence TEXT,                        -- 'high' | 'medium' | 'low'
  assessment_notes TEXT,                  -- AI narrative: what it saw, why it scored it this way
  assessed_at TIMESTAMPTZ DEFAULT NOW(),
  assessed_by INTEGER REFERENCES users(id)  -- NULL = auto (background job); user id = manual trigger
)

-- Saved search configurations
search_profiles (
  id SERIAL PRIMARY KEY,
  org_id INTEGER REFERENCES organizations(id),
  created_by INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  center_lat NUMERIC(9,6),
  center_lng NUMERIC(9,6),
  radius_miles INTEGER DEFAULT 30,
  min_acres NUMERIC(5,2) DEFAULT 4.0,
  lot_types TEXT[],
  last_searched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

---

## Phase Plan

### Phase 1 — Foundation ✅
- [x] Next.js project, Neon DB, NextAuth (credentials provider)
- [x] `organizations`, `users`, `venues` tables + idempotent migrations
- [x] Org + user setup: admin creates org, invites organizers by email (Settings page)
- [x] Manual venue entry form: name, address, lot type, status, owner contact, notes
- [x] Venue list view: status filter, state/city filter, text search, sort by score

### Phase 2 — Map & Search ✅
- [x] Google Maps JavaScript API: interactive map, satellite/roadmap toggle
- [x] Candidate search: zip or city + radius → **OSM Overpass API** (not Google Places) discovers parking lots, fairgrounds, stadiums, leisure venues, commercial/industrial polygons by polygon geometry
- [x] Results plotted as color-coded score pins; click to open detail panel
- [x] Detail panel: name, address, estimated acres, disqualifiers, surface, shape, lot type, scores, owner contact, "Add to pipeline" button
- [x] "Add to pipeline" saves candidate to `venues` table with `source = 'osm'`
- [x] Saved search profiles: save center + radius, reload and re-run with one click
- [x] Minimum lot size filter: 125,000 sq ft (≈2.87 acres) — hard floor, enforced in OSM query
- [x] OSM relation (multipolygon) support: large venue complexes mapped as relations are included via `>>` recursion

### Phase 3 — AI Scoring Engine ✅

**Goal:** Every candidate gets an automated suitability score within seconds — no manual assessment required until the site visit.

#### 3A — Satellite image fetch ✅
- [x] Fetch satellite image via Google Maps Static API at zoom 18 for each candidate
- [x] Image URL cached in `venue_ai_assessments.satellite_image_url`

#### 3B — Vision analysis via Claude ✅
- [x] POST satellite image + SCCA autocross scout prompt to Claude Sonnet (multimodal)
- [x] Domain-specific prompt covers: hard disqualifiers, lot type priority ranking (stadium/fairground/racetrack/airfield > active retail), surface scoring, run-off buffer, residential proximity
- [x] Returns structured JSON: `total_acres`, `usable_acres`, `surface_type`, `surface_condition` (1–5), `shape`, `internal_obstructions`, `runoff_adequate`, `residential_proximity`, `lot_type`, `disqualifiers`, `ai_score`, `confidence`, `notes`
- [x] Hard disqualifiers cap composite score at 35
- [x] Low-confidence assessments noted in `assessment_notes`

#### 3C — Composite scoring ✅
- [x] **Size score** (50% weight): `usable_acres` → `lotScoreFromAcres()`, scales meaningfully to 60+ acres
- [x] **AI score** (35% weight): `ai_score` from vision analysis
- [x] **Highway access score** (15% weight): driving minutes to nearest highway via Directions API; ≤2 min = 100, ≥20 min = 0
- [x] Composite stored in `venues.composite_score`
- [x] Score breakdown bars visible in detail panel (size / AI / highway)

#### 3D — Batch scoring on search results ✅
- [x] All candidates scored in parallel: satellite fetch + Claude vision + highway score + reverse geocode run concurrently per candidate
- [x] Results sorted: largest usable lot first, composite score as tiebreaker
- [x] Loading state per card while scoring runs

#### 3E — Re-score and override ✅
- [x] "Re-analyze" button on any venue — fetches fresh satellite image, re-runs Claude assessment
- [x] Manual score override: pin a custom score (0–100) with a note; visually distinguished from AI score
- [x] Score history: each assessment stored in `venue_ai_assessments`; organizer can view history

### Phase 4 — Owner Identification (partial)
- [x] County assessor link helper: static link table by state (`lib/assessor-links.js`); surfaces direct link to parcel search from venue edit panel
- [x] Manual entry form: owner name, email, phone, source
- [x] Notes field for ownership complexity
- [ ] **Auto-populate via paid parcel API** (ATTOM or Regrid): given a lat/lng or address, return owner name, mailing address, and entity type (LLC vs. individual) — eliminates the manual assessor lookup step for most properties
- [x] "Owner identified" status indicator on pipeline card when `owner_email` or `owner_phone` is present

### Phase 5 — AI Outreach Drafting ✅
- [x] "Draft inquiry email" in pipeline drawer and venue edit panel
- [x] Prompt includes: org name, event type, venue name + address, estimated lot size
- [x] Claude Haiku generates 3-paragraph email: who we are / what the event involves / the ask
- [x] Organizer edits subject and body before sending
- [x] Sent via Resend; outreach record logged with `ai_drafted = TRUE`; venue auto-advanced to Contacted
- [x] Draft records in Outreach tab have a Send button (no longer a dead end)
- [ ] **Feed assessment notes into draft prompt**: include surface type, usable acres, lot type, and highway access time so the email references specific observed details ("Your 12-acre paved stadium overflow lot 2 minutes from I-75…")
- [ ] **Follow-up template**: one-click "Send follow-up" on any overdue contacted venue — AI generates a shorter check-in email referencing the original outreach date

### Phase 6 — Pipeline Management ✅
- [x] Kanban board: 8 columns (candidate → shortlisted → contacted → responded → site visit → approved → declined → archived)
- [x] Stage advancement buttons in drawer; decline requires category + freeform reason
- [x] Follow-up overdue alert banner: contacted venues with no response after 7 days
- [x] Response logging: "Mark response received" with notes; status advances to Responded
- [x] Site visit checklist: actual acres, surface condition, perimeter, restrooms, electrical, security, nearest hospital, photo links
- [x] Timeline page (`/admin/venues/[id]/timeline`): full chronological history of assessments, outreach, and notes; add notes inline
- [x] Timeline linked from pipeline drawer and venue edit panel
- [x] **Inline notes from pipeline drawer**: add a note without navigating to the timeline page
- [x] **Drawer stays open on stage advance**: currently closes after advancing; should stay open and reflect the new status
- [ ] **Drag-to-advance**: drag kanban cards between columns as an alternative to the advance button

### Phase 7 — Institutional Memory (partial)
- [x] Approved venue library (`/admin/library`): all `approved` venues, filterable by state, searchable by name
- [x] Full venue timeline with notes, outreach, and assessment history
- [x] Export: approved venues as JSON via `/api/admin/library?export=1`
- [x] **Declined venue warning**: when adding a search result to the pipeline, check if the `google_place_id` is already in `venues` with status `declined`; surface the decline reason and require confirmation to re-add
- [ ] **Cross-org sharing**: program admin can mark venues "nationally approved" — visible to all orgs

### Phase 8 — arscca-VMS Integration
- [ ] VMS event creation form: "Select from approved venues" dropdown pre-populated via `/api/v1/approved-venues`
- [ ] Venue record pre-fills event: address, city, state, lot size, owner contact, site visit notes
- [ ] API key auth on the v1 endpoint (`VENUESCOUT_API_KEY` env var)

### Phase 9 — Search Quality
- [ ] **Google Places fallback with OSM polygon size gate**: supplement OSM results with a Google Places Nearby Search for `parking`, `stadium`, and `point_of_interest`, then for each Places hit reverse-query OSM (Overpass `around`/`is_in`) for an overlapping polygon — keep only if a polygon exists and meets the 125,000 sq ft floor; drop polygon-less hits. Catches the "OSM has the polygon but with the wrong tag" case without paying Claude vision cost on undersized lots
- [ ] **Sort by usable acres**: when Claude returned a `usable_acres` value, use it as the primary sort key instead of OSM polygon area, which often over- or under-counts
- [x] **Composite score recalculation on manual edit**: when an organizer edits `estimated_acres` in the venue form, recompute the size component of `composite_score` automatically
- [ ] **"Needs revisit" flag**: mark a venue for re-analysis with a reason (e.g., "winter image — re-check in spring", "construction in progress") without changing its pipeline status
- [ ] **Bulk add to pipeline**: checkbox-select multiple search results and add them all in one action

### Phase 10 — Multi-Org & SaaS
- [ ] Google OAuth sign-in (easier onboarding than credentials-only)
- [ ] Per-org branding: event type label, program name, outreach email signature
- [ ] Billing / usage limits: per-org monthly cap on Claude vision calls and Resend sends
- [ ] Org isolation: venues, outreach records, and users are fully scoped to `org_id`; no cross-org data leakage

---

## Key Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| County assessor APIs inconsistent across states | High | Don't scrape — provide direct links to each county's parcel search by FIPS; manual entry is always the fallback |
| Google Maps API cost at scale | Medium | Gate all Places calls behind explicit user-triggered "Search" button; enforce per-org monthly query budget; cache results in `venues` table |
| Cold outreach response rates low (typically 5–15%) | High | Tool improves throughput and follow-up discipline, not response rate itself; set realistic expectations in onboarding |
| AI satellite scores are wrong for some lots | Medium | Confidence flag on every assessment; low-confidence venues flagged for manual review; site visit checklist is always the authoritative record |
| Satellite image obstructed (snow, shadow, tree cover, construction) | Medium | Claude returns `confidence: "low"` → flag for re-analysis; re-score button available; Static API can fetch most recent imagery but cannot guarantee a specific date |
| Google Maps Static API cost at scale | Medium | Each Static API image request is ~$0.002; 1,000 venues/month = ~$2; negligible; cache image URLs so re-analyses reuse cached images unless explicitly refreshed |
| Claude vision hallucinations on ambiguous lots | Low | Store `raw_response` JSONB for auditing; manual override always available; scores are guidance, not gates — organizer retains final judgment |
| Same owner contacted by multiple organizers | Low | Warn when another user has already logged outreach to the same `google_place_id` |

---

## Open Questions

1. **Scope:** TRSS-only or generic multi-org SaaS? Generic has a larger market (any outdoor event organizer) but requires more configurable event-type language and billing infrastructure.
2. **Outreach email origin:** Send from organizer's own address (personal relationship, better deliverability) or from platform address (tracking, consistency)? Recommendation: draft in platform, send from organizer's address with BCC to platform for logging.
3. **Venue ownership:** Does the venue relationship belong to the organizer who found it, the org, or the program? Determines data visibility and portability rules.
4. **Site visit report:** Does the checklist become a formal PDF deliverable stored and shareable with the venue contact? Useful if the property manager asks for a site inspection report before approving.
5. **VMS integration depth:** Same Neon DB instance (simpler, one deployment) or separate REST API (cleaner if VenueScout eventually serves non-TRSS orgs)?
6. **Score weighting:** The 60/25/15 weighting (AI assessment / size / access) is a starting assumption. Once real venues have been scored and validated against actual site visits, weights should be calibrated against outcomes — which scores predicted "this lot worked great" vs. "we had to reject it on arrival"?
