import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

// Server-side admin read. Uses the service_role key, which BYPASSES RLS, so it
// must stay on the server only — never shipped to the browser. Gated by a
// shared admin password sent in the Authorization header over HTTPS.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ADMIN_PASSWORD) {
    return res.status(500).json({ ok: false, error: "Server not configured." });
  }

  const auth = req.headers.authorization || "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!provided || !safeEqual(provided, ADMIN_PASSWORD)) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("signups")
    .select("created_at, name, email, message")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase select error:", error);
    return res.status(500).json({ ok: false, error: "Could not load submissions." });
  }

  return res.status(200).json({ ok: true, data });
}

// Constant-time comparison to avoid leaking the password via timing.
function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
