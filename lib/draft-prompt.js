// Builds the inquiry-email prompt sent to Claude for venue outreach drafting.
//
// The prompt incorporates concrete observations from the most recent
// venue_ai_assessments row (surface, usable acres, obstacle density) and
// converts the venue's highway_access_score (1–100, where ≤2 min = 100 and
// ≥20 min = 0) back to a qualitative phrase. When confidence is 'low' or
// individual fields are null, we instruct the model NOT to fabricate
// specifics for those fields and instead use generic phrasing.

/**
 * Convert highway_access_score (1–100) to a short phrase suitable for prose.
 * Returns null when the score is too low to be worth mentioning, or when no
 * score is available.
 */
function highwayPhraseFromScore(score) {
  if (score === null || score === undefined) return null;
  if (score >= 90) return "minutes from the highway";
  if (score >= 60) return "close to highway access";
  if (score >= 30) return "near major roads";
  return null;
}

/**
 * @param {object} args
 * @param {object} args.venue           Row from venues (name, address, city, state, estimated_acres, lot_type, owner_name, highway_access_score)
 * @param {object|null} args.assessment Most recent venue_ai_assessments row, or null
 * @param {string} args.eventType
 * @param {string} args.orgName
 * @param {string|null} args.eventDate
 * @param {string|null} args.contactName
 */
export function buildDraftPrompt({
  venue,
  assessment,
  eventType,
  orgName,
  eventDate,
  contactName,
}) {
  const lowConfidence = assessment?.confidence === "low";

  // Acres: prefer estimated_clear_acres (usable), fall back to total, then
  // venues.estimated_acres. Skip entirely if confidence is low.
  let acresLine = null;
  if (!lowConfidence) {
    const clear = assessment?.estimated_clear_acres;
    const total = assessment?.estimated_total_acres;
    if (clear) {
      acresLine = `Usable (clear) lot area: ~${clear} acres`;
    } else if (total) {
      acresLine = `Estimated lot size: ~${total} acres`;
    } else if (venue.estimated_acres) {
      acresLine = `Estimated lot size: ~${venue.estimated_acres} acres`;
    }
  }

  // Surface type: only include when present and not 'unknown', and confidence
  // is acceptable.
  const surfaceLine =
    !lowConfidence &&
    assessment?.surface_type &&
    assessment.surface_type !== "unknown"
      ? `Surface type: ${assessment.surface_type}`
      : null;

  // Obstacle density: only include if present and confidence acceptable.
  const obstacleLine =
    !lowConfidence && assessment?.obstacle_density
      ? `Obstacle density (light poles, curbs, islands): ${assessment.obstacle_density}`
      : null;

  // Lot type from venues (e.g. 'stadium overflow', 'mall'). Always safe to use.
  const lotTypeLine = venue.lot_type ? `Lot type: ${venue.lot_type}` : null;

  // Highway access: convert numeric score to phrase.
  const highwayPhrase = highwayPhraseFromScore(venue.highway_access_score);
  const highwayLine = highwayPhrase
    ? `Highway access: ${highwayPhrase}`
    : null;

  // Assemble the observed-details block. Only emit lines we actually have.
  const observedLines = [
    lotTypeLine,
    acresLine,
    surfaceLine,
    obstacleLine,
    highwayLine,
  ].filter(Boolean);

  const observedBlock = observedLines.length
    ? `Observed venue details (from satellite assessment — use these to make paragraph 2 or 3 specific to THIS lot, e.g. "your ~12-acre paved overflow lot, close to highway access"):
${observedLines.map((l) => `- ${l}`).join("\n")}

IMPORTANT: Only reference the specific details listed above. Do NOT invent surface types, acreage, distances, highway names, or other specifics that are not in this list. If a detail is missing, use generic phrasing for that aspect.`
    : `No detailed satellite assessment is available for this venue yet — keep the venue description generic and do not invent specifics about surface, size, or surroundings.`;

  return `Draft a professional outreach email to the owner or property manager of ${venue.name} (${venue.address}, ${venue.city}, ${venue.state}) to ask if they would be willing to host a ${eventType}.

Organization: ${orgName}
Event type: ${eventType}
${eventDate ? `Target event date: ${eventDate}` : ""}
${venue.owner_name ? `Recipient: ${venue.owner_name}` : ""}
${contactName ? `Sender name: ${contactName}` : ""}

${observedBlock}

Write a 3-paragraph email:
1. Who we are and what the program does — safety focus, volunteer-run, community service
2. What the event involves — one day, 40–60 vehicles max, full cleanup afterward, no property modifications, certificate of insurance provided, no cost to the property owner. Where natural, weave in the observed venue details so the recipient knows we've looked at their specific lot.
3. A respectful ask — would they be open to a brief conversation about the possibility?

Tone: professional, warm, not pushy. Treat the recipient as a capable adult making a business decision.

Return a JSON object with exactly two fields:
{
  "subject": "<concise subject line, under 60 characters>",
  "body": "<full email body — plain text, no HTML, paragraphs separated by \\n\\n>"
}

Return ONLY the JSON object. No markdown. No explanation.`;
}

/**
 * Build a SHORT follow-up nudge email referencing a prior outreach.
 *
 * This is intentionally not a re-pitch: it references the date of the
 * original message and softly re-asks whether the recipient had a chance
 * to consider it. It carries over the venue/event/org context from
 * buildDraftPrompt so language stays consistent, but condenses any
 * observed-lot detail into at most a single brief clause (a soft
 * mention — not a re-introduction).
 *
 * @param {object} args
 * @param {object} args.venue            Row from venues
 * @param {object|null} args.assessment  Most recent venue_ai_assessments row, or null
 * @param {object} args.priorOutreach    The outreach being followed up on
 * @param {string} args.priorOutreach.sent_at  ISO date the original was sent
 * @param {string} args.priorOutreach.subject  Original subject (for context only)
 * @param {string} args.eventType
 * @param {string} args.orgName
 * @param {string|null} args.contactName
 */
export function buildFollowUpPrompt({
  venue,
  assessment,
  priorOutreach,
  eventType,
  orgName,
  contactName,
}) {
  const lowConfidence = assessment?.confidence === "low";

  // For the follow-up we surface ONE optional soft-mention detail —
  // whichever is the most recognizable about the lot (lot type, then
  // usable acres). Anything more is too much for a 5-sentence nudge.
  let softMention = null;
  if (venue.lot_type) {
    softMention = `your ${venue.lot_type}`;
  } else if (!lowConfidence) {
    const clear = assessment?.estimated_clear_acres;
    const total = assessment?.estimated_total_acres ?? venue.estimated_acres;
    if (clear) softMention = `your ~${clear}-acre lot`;
    else if (total) softMention = `your ~${total}-acre lot`;
  }

  // Format the original send date as a friendly "Month D" (e.g. "May 7").
  // The model also gets the ISO date so it can reason about it if needed.
  const sentDate = new Date(priorOutreach.sent_at);
  const friendlyDate = sentDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });

  return `Draft a SHORT follow-up email to the owner or property manager of ${venue.name} (${venue.city}, ${venue.state}). We previously emailed them on ${friendlyDate} (ISO: ${priorOutreach.sent_at.slice(0, 10)}) about hosting a ${eventType} and have not heard back.

Original subject (for your context — do NOT quote it verbatim): ${priorOutreach.subject ?? "(no subject)"}

Organization: ${orgName}
Event type: ${eventType}
${venue.owner_name ? `Recipient: ${venue.owner_name}` : ""}
${contactName ? `Sender name: ${contactName}` : ""}
${softMention ? `Soft venue mention you may use ONCE in passing: ${softMention}` : ""}

This is a NUDGE, not a re-introduction. Do NOT re-pitch the program. Do NOT re-list event logistics (vehicle count, insurance, cleanup, etc.). Assume the recipient already has the original email.

Hard constraints:
- Single paragraph, ~5 sentences (4–6 acceptable). No paragraph breaks.
- Open by referencing the prior message: e.g. "I emailed you on ${friendlyDate} about ..." (one sentence).
- One short sentence acknowledging they're busy / no pressure.
- One sentence softly re-asking if they had a chance to consider it, or whether someone else on their team would be a better contact.
- Close with a brief thank-you. No long sign-off boilerplate beyond "Thanks,".
- Tone: warm, polite, low-pressure. Do not apologize excessively. Do not guilt.
- Plain text only. No HTML, no bullet points, no markdown.

Return a JSON object with exactly two fields:
{
  "subject": "<concise subject line, under 60 characters — ideally start with 'Following up:' or 'Quick check-in:' >",
  "body": "<single-paragraph email body, plain text>"
}

Return ONLY the JSON object. No markdown. No explanation.`;
}
