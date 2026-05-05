# VenueScout — Event Venue Discovery & Outreach Platform

**Project:** Venue Discovery, Owner Identification, and Outreach Pipeline for Outdoor Event Organizers
**Origin:** Spun off from TRSS Volunteer Management System (arscca-VMS), May 2026
**Pilot use case:** Tire Rack Street Survival — finding large paved lots for teen driver safety events
**Broader applicability:** Any event requiring a large flat outdoor site: autocross, car shows, drift days, food truck festivals, community events
**Status:** Pre-development — project plan only
**Last Updated:** May 4, 2026

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

### Phase 1 — Foundation
- [ ] Next.js project, Neon DB, NextAuth (credentials + Google OAuth)
- [ ] `organizations`, `users`, `venues` tables + idempotent migrations
- [ ] Org + user setup: admin creates org, invites organizers by email
- [ ] Manual venue entry form: name, address, lot type, status, owner contact, notes
- [ ] Venue list view: status filter, state/city filter, sort by size

### Phase 2 — Map & Search
- [ ] Google Maps JavaScript API: interactive map, satellite/roadmap toggle
- [ ] Candidate search: city or zip + radius → Google Places API for parking lots, fairgrounds, stadiums, convention centers
- [ ] Results plotted as color-coded status pins; click to open detail panel
- [ ] Detail panel: name, address, estimated size, satellite thumbnail, current status, "Add to pipeline" button
- [ ] "Add to pipeline" saves candidate to `venues` table with `source = 'google_places'`
- [ ] OpenStreetMap Overpass API fallback for lot polygon geometry when Places data is thin

### Phase 3 — AI Scoring Engine

**Goal:** Every candidate that enters the pipeline gets an automated suitability score within seconds of being added — no manual assessment required until the site visit.

#### 3A — Satellite image fetch
- [ ] For each venue with lat/lng, fetch a satellite image via Google Maps Static API at zoom 18 (covers roughly a 300m × 300m area — right for most parking lots)
- [ ] Cache the image URL in `venue_ai_assessments.satellite_image_url`; re-fetch if lat/lng changes
- [ ] For very large venues (estimated >20 acres), fetch a second image at zoom 17 and stitch context

#### 3B — Vision analysis via Claude
- [ ] POST the satellite image + structured prompt to Claude (multimodal):

  ```
  You are assessing a satellite image of a parking lot at [address] for suitability
  as a driving skills event venue. The event needs a large flat paved surface.

  Analyze the image and return JSON with these fields:
  - estimated_total_acres: full lot area visible (number)
  - estimated_clear_acres: usable open area after subtracting obstacles (number)
  - surface_type: "asphalt" | "concrete" | "gravel" | "mixed" | "unknown"
  - has_internal_curbs: true/false
  - has_light_poles: true/false
  - has_landscaping_islands: true/false
  - obstacle_types: array of strings (e.g. ["light_poles","median_curbs","planters"])
  - obstacle_density: "none" | "light" | "moderate" | "heavy"
  - suitability_score: 0–100 (100 = ideal open asphalt, 0 = unusable)
  - confidence: "high" | "medium" | "low"
  - assessment_notes: 2–3 sentences explaining the score
  ```

- [ ] Parse and store response in `venue_ai_assessments`; update `venues` with derived scores
- [ ] If Claude returns `confidence: "low"` (image obstructed, lot partially visible, winter snow cover), flag the venue for manual review rather than surfacing a low score as authoritative

#### 3C — Composite scoring
- [ ] **AI score** (60% weight): `suitability_score` from vision analysis — captures what only a visual inspection can see
- [ ] **Size score** (25% weight): `estimated_clear_acres` normalized against a target minimum (e.g. 4 acres = 100%)
- [ ] **Access score** (15% weight): driving time in minutes to nearest highway interchange via Directions API; <5 min = 100, 20+ min = 0
- [ ] Composite stored in `venues.composite_score`; recalculated whenever any component changes
- [ ] Score breakdown visible in the detail panel: three labeled bars (AI assessment / Size / Access) + composite

#### 3D — Batch scoring on search results
- [ ] After a Places search returns N candidates, trigger background scoring jobs for all N in parallel (up to 10 concurrent to manage API cost)
- [ ] List view shows a loading indicator per card while scoring runs; updates in place via polling or SSE
- [ ] Scored results auto-sort by composite score descending; organizer can switch to distance sort

#### 3E — Re-score and override
- [ ] "Re-analyze" button on any venue — fetches a fresh satellite image and re-runs the Claude assessment (useful after seasonal changes or if confidence was low)
- [ ] Manual override: organizer can pin a custom score (0–100) with a note; composite uses the manual score instead of AI score; override is visually distinguished ("Manual — overrides AI")
- [ ] Score history: each assessment stored in `venue_ai_assessments` — organizer can see how the score changed across re-analyses

### Phase 4 — Owner Identification
- [ ] Auto-populate from Google Places: `formatted_phone_number`, `website`
- [ ] County assessor link helper: for a given address, surface a direct link to that county's public parcel search (static link table by county FIPS — no scraping)
- [ ] Manual override form: owner name, email, phone, how identified
- [ ] "Owner identified" status badge on venue card
- [ ] Notes field for ownership complexity ("Lot owned by LLC, managed by CBRE Atlanta — call regional leasing desk")

### Phase 5 — AI Outreach Drafting
- [ ] "Draft inquiry" button on any venue with owner email populated
- [ ] Prompt to Claude includes: org name, event type, event description (from org profile), venue name + address, estimated lot size, target event date range (if set)
- [ ] Claude generates a 3-paragraph email:
  1. Who we are + what the program does (safety focus, nonprofit backing if applicable)
  2. What the event involves (one day, N vehicles, full cleanup, no property modifications, certificate of insurance provided)
  3. The ask: would you be open to a brief conversation about hosting?
- [ ] Organizer edits before sending; character-counted preview
- [ ] Sent via Resend from the platform; outreach record logged with `ai_drafted = TRUE`
- [ ] Subject line also AI-generated with manual override

### Phase 6 — Pipeline Management
- [ ] Kanban-style pipeline view: one column per status stage; drag cards to advance
- [ ] Follow-up reminders: banner surfaces any `contacted` venue with no response after 7 days
- [ ] Response logging: "Mark response received" button + outcome notes; status auto-advances to `responded`
- [ ] Decline reason required when moving to `declined` (freeform + category: "No interest", "Insurance liability", "Capacity conflict", "Cost prohibitive", "No response after 3 attempts")
- [ ] Site visit checklist triggered on move to `site_visit`:
  - Actual usable acres (measured, not estimated)
  - Surface condition (1–5)
  - Perimeter description (fence, open, curb)
  - Restroom facilities on-site
  - Electrical access
  - Security / overnight storage available
  - Nearest hospital (for event safety planning)
  - Photos attached (links or uploads)

### Phase 7 — Institutional Memory & Multi-Org
- [ ] Approved venue library: all `approved` venues searchable by state/city/region, shared org-wide
- [ ] Declined venues visible with reasons — warns with a banner if another organizer attempts to contact the same `google_place_id`
- [ ] Full venue timeline: all status changes, outreach attempts, and notes in chronological order
- [ ] Cross-org sharing: program admin can mark venues "nationally approved" — visible to all orgs in the program
- [ ] Export: approved venues as JSON for import into event management platforms (e.g., arscca-VMS)

### Phase 8 — arscca-VMS Integration
- [ ] VMS event creation form: "Select from approved venues" dropdown replaces free-text location field
- [ ] Venue record pre-fills event: address, city, state, lot size, owner contact, site visit notes
- [ ] Implementation path: shared Neon DB (simpler for single-program use) or lightweight REST API (cleaner if VenueScout serves multiple orgs independently)

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
