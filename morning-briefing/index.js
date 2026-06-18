import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import Anthropic from "@anthropic-ai/sdk";
import { pathToFileURL } from "node:url";

const BRAND = process.env.BRAND || "RK Empires";
// Until a domain is verified in Resend, onboarding@resend.dev is the only
// guaranteed-deliverable sender. Swap RESEND_FROM in once a domain is set up.
const FROM = process.env.RESEND_FROM || `${BRAND} <onboarding@resend.dev>`;

function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

// Returns the UTC start/end timestamps for "yesterday" relative to now.
function yesterdayRangeUTC(now = new Date()) {
  const start = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 0, 0, 0, 0,
  ));
  const end = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 23, 59, 59, 999,
  ));
  // ISO date label (YYYY-MM-DD) for the subject line.
  const label = start.toISOString().slice(0, 10);
  return { start, end, label };
}

async function fetchSignups(supabase, start, end) {
  const { data, error } = await supabase
    .from("signups")
    .select("name, email, message, created_at")
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString())
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Supabase query failed: ${error.message}`);
  return data || [];
}

async function summarizeWithClaude(anthropic, signups) {
  const lines = signups.map((s, i) => {
    const when = s.created_at;
    const msg = s.message ? ` — "${s.message}"` : "";
    return `${i + 1}. ${s.name} <${s.email}> (${when})${msg}`;
  }).join("\n");

  const prompt =
`Below is the list of people who signed up / reached out to ${BRAND} yesterday.

${lines}

Write a concise briefing for the team covering:
- The total count of signups.
- A brief overview of who reached out.
- Any patterns worth noting (e.g. common domains, themes in their messages, timing, repeat interest).

Keep it to a few short paragraphs. Plain text, no markdown headers.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: prompt }],
  });

  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function formatSignupList(signups) {
  return signups.map((s, i) => {
    const msg = s.message ? `\n   Message: ${s.message}` : "";
    return `${i + 1}. ${s.name} <${s.email}>\n   Signed up: ${s.created_at}${msg}`;
  }).join("\n\n");
}

async function sendEmail(resend, { subject, text }) {
  const { error } = await resend.emails.send({
    from: FROM,
    to: process.env.MY_EMAIL,
    subject,
    text,
  });
  if (error) throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
}

export async function runBriefing(now = new Date()) {
  requireEnv(["SUPABASE_URL", "RESEND_API_KEY", "ANTHROPIC_API_KEY", "MY_EMAIL"]);

  // Prefer the service-role key: this is a trusted server-side job, and the
  // signups table grants anon INSERT only (no SELECT), so the anon key would
  // return zero rows every day. Service-role bypasses RLS. Fall back to anon
  // only if a SELECT policy has been added for it.
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseKey) {
    throw new Error("Missing Supabase key: set SUPABASE_SERVICE_ROLE_KEY (preferred) or SUPABASE_ANON_KEY");
  }

  const supabase = createClient(process.env.SUPABASE_URL, supabaseKey, {
    auth: { persistSession: false },
  });
  const resend = new Resend(process.env.RESEND_API_KEY);
  const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

  const { start, end, label } = yesterdayRangeUTC(now);
  console.log(`Fetching signups for ${label} (UTC ${start.toISOString()} – ${end.toISOString()})`);

  const signups = await fetchSignups(supabase, start, end);
  console.log(`Found ${signups.length} signup(s).`);

  if (signups.length === 0) {
    await sendEmail(resend, {
      subject: `Daily signups for ${BRAND}: ${label}`,
      text: "No new signups yesterday.",
    });
    console.log("Sent 'no signups' email.");
    return;
  }

  const summary = await summarizeWithClaude(anthropic, signups);
  const text =
`${summary}

────────────────────────────────────────
Signups (${signups.length}):

${formatSignupList(signups)}`;

  await sendEmail(resend, {
    subject: `Daily signups for ${BRAND}: ${label}`,
    text,
  });
  console.log("Sent daily briefing email.");
}

// Execute once when run directly (node index.js), then exit. Guarded so that
// importing runBriefing (e.g. from scheduler.js) does NOT trigger a run.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBriefing()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Briefing failed:", err.message);
      process.exit(1);
    });
}
