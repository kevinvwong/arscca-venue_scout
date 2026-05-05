import { NextResponse } from "next/server";
import { sql, initDb } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  await initDb();

  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "Invalid outreach ID." }, { status: 400 });

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { to, subject, body: emailBody } = body;

  if (!to || !subject || !emailBody) {
    return NextResponse.json({ error: "to, subject, and body are required." }, { status: 400 });
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }

  let emailSent = false;

  if (process.env.RESEND_API_KEY) {
    try {
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || "VenueScout <outreach@venuescount.dev>",
          to: [to],
          subject,
          text: emailBody,
        }),
      });
      if (resendRes.ok) {
        emailSent = true;
      } else {
        const resendErr = await resendRes.json().catch(() => ({}));
        console.error("Resend error:", resendErr);
      }
    } catch (e) {
      console.error("Resend request failed:", e);
    }
  }

  await sql`
    UPDATE venue_outreach
    SET sent_at = NOW(), follow_up_due_at = NOW() + INTERVAL '7 days'
    WHERE id = ${id}
  `;

  return NextResponse.json({ ok: true, sent: emailSent });
}
