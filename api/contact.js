import { createClient } from "@supabase/supabase-js";

// Server-side only — reads from environment variables (never exposed to the browser).
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // req.body is parsed automatically by Vercel for JSON requests.
  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
  const name = (body.name || "").trim();
  const email = (body.email || "").trim();
  const message = (body.message || "").trim() || null;

  if (!name || !email) {
    return res.status(400).json({ ok: false, error: "Name and email are required." });
  }

  const { data, error } = await supabase
    .from("signups")
    .insert({ name, email, message })
    .select()
    .single();

  if (error) {
    console.error("Supabase insert error:", error);
    return res.status(500).json({ ok: false, error: "Could not save your submission." });
  }

  return res.status(200).json({ ok: true, data });
}

function safeParse(str) {
  try { return JSON.parse(str); } catch { return {}; }
}
