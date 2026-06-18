import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ ok: false, error: "Server not configured." });
  }

  // Server-side only — env vars are never exposed to the browser.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // req.body is parsed automatically by Vercel for JSON requests.
  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
  const name = (body.name || "").trim();
  const email = (body.email || "").trim();
  const message = (body.message || "").trim() || null;

  if (!name || !email) {
    return res.status(400).json({ ok: false, error: "Name and email are required." });
  }

  // No .select() here: RLS grants anon INSERT only (no SELECT), so reading
  // the row back would fail. Insert with return=minimal instead.
  const { error } = await supabase
    .from("signups")
    .insert({ name, email, message });

  if (error) {
    console.error("Supabase insert error:", error);
    return res.status(500).json({ ok: false, error: "Could not save your submission." });
  }

  // Notify the site owner of the new submission — best effort. A Resend
  // failure must NOT fail the submission, since the row is already saved.
  await notifyOwner({ name, email, message }).catch((err) => {
    console.error("Resend owner-notification error (non-fatal):", err);
  });

  // Send a confirmation email to the visitor — best effort. Note: with the
  // Resend sandbox sender this only delivers to the account owner's address;
  // arbitrary visitors require a verified domain. Failure is non-fatal.
  await sendConfirmation({ name, email }).catch((err) => {
    console.error("Resend email error (non-fatal):", err);
  });

  return res.status(200).json({ ok: true });
}

async function notifyOwner({ name, email, message }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set — skipping owner notification.");
    return;
  }

  // Where submission alerts are sent. Must be the Resend account owner's
  // address while on the sandbox sender (onboarding@resend.dev).
  const notifyTo = process.env.NOTIFY_EMAIL || process.env.MY_EMAIL;
  if (!notifyTo) {
    console.warn("NOTIFY_EMAIL/MY_EMAIL not set — skipping owner notification.");
    return;
  }

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM || "RK Empires <onboarding@resend.dev>";
  const msg = message || "(no message)";

  const { error } = await resend.emails.send({
    from,
    to: notifyTo,
    // Lets you reply straight to the visitor from your inbox.
    replyTo: email,
    subject: `New contact submission from ${name}`,
    text:
`New submission from the RK Empires contact form:

Name:    ${name}
Email:   ${email}
Message: ${msg}`,
    html:
`<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#2a241b;">
  <p style="margin:0 0 12px;"><strong>New submission from the RK&nbsp;Empires contact form:</strong></p>
  <p style="margin:0;"><strong>Name:</strong> ${escapeHtml(name)}</p>
  <p style="margin:0;"><strong>Email:</strong> ${escapeHtml(email)}</p>
  <p style="margin:12px 0 0;"><strong>Message:</strong><br/>${escapeHtml(msg).replace(/\n/g, "<br/>")}</p>
</div>`,
  });

  if (error) throw error;
}

async function sendConfirmation({ name, email }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set — skipping confirmation email.");
    return;
  }

  const resend = new Resend(apiKey);
  // Use onboarding@resend.dev until a domain is verified, then swap to it.
  const from = process.env.RESEND_FROM || "RK Empires <onboarding@resend.dev>";
  const firstName = name.split(/\s+/)[0] || name;

  const { error } = await resend.emails.send({
    from,
    to: email,
    subject: `Thanks for reaching out, ${firstName}`,
    text:
`Hi ${firstName},

Thank you for reaching out to RK Empires — your message landed with us, and we're glad you did.

We build intelligent automations that give teams back their time, and we'll be in touch shortly to talk through what you're looking to do.

Talk soon,
The RK Empires Team`,
    html:
`<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#2a241b;">
  <p>Hi ${escapeHtml(firstName)},</p>
  <p>Thank you for reaching out to <strong>RK&nbsp;Empires</strong> — your message landed with us, and we're glad you did.</p>
  <p>We build intelligent automations that give teams back their time, and we'll be in touch shortly to talk through what you're looking to do.</p>
  <p style="margin-top:24px;">Talk soon,<br/>The RK&nbsp;Empires Team</p>
</div>`,
  });

  if (error) throw error;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function safeParse(str) {
  try { return JSON.parse(str); } catch { return {}; }
}
