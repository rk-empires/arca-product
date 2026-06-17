import { createClient } from "@supabase/supabase-js";

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
