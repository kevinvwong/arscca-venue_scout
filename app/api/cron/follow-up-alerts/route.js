export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sql, initDb } from "@/lib/db";

export async function GET(req) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await initDb();

  const result = await sql`
    SELECT v.id, v.name, v.city, v.state, v.owner_name, v.owner_email,
           MAX(o.sent_at) AS last_sent_at
    FROM venues v
    JOIN venue_outreach o ON o.venue_id = v.id
    WHERE v.status = 'contacted'
      AND o.sent_at IS NOT NULL
      AND o.response_received_at IS NULL
    GROUP BY v.id, v.name, v.city, v.state, v.owner_name, v.owner_email
    HAVING MAX(o.sent_at) < NOW() - INTERVAL '7 days'
    ORDER BY MAX(o.sent_at) ASC
  `;

  const venues = result.rows;

  if (venues.length === 0) {
    return NextResponse.json({ ok: true, sent: false, count: 0 });
  }

  const resendKey = process.env.RESEND_API_KEY;

  if (resendKey) {
    const adminEmails = process.env.ADMIN_EMAILS || "";
    const toEmail = adminEmails.split(",")[0].trim();

    const count = venues.length;
    const subject = `VenueScout: ${count} venue${count === 1 ? "" : "s"} awaiting follow-up`;

    const lines = venues.map((v) => {
      const date = new Date(v.last_sent_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      return `- ${v.name} (${v.city}, ${v.state}) — last contacted ${date}`;
    });

    const text = [
      `The following ${count === 1 ? "venue has" : "venues have"} not responded in over 7 days:`,
      "",
      ...lines,
      "",
      "Log in to VenueScout to send follow-up outreach.",
    ].join("\n");

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "VenueScout <alerts@venuescount.dev>",
        to: toEmail,
        subject,
        text,
      }),
    });
  }

  return NextResponse.json({ ok: true, sent: !!resendKey, count: venues.length });
}
