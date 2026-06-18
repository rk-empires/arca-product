import cron from "node-cron";
import { runBriefing } from "./index.js";

// 0 7 * * *  →  07:00 every day, in the machine's local time zone.
const SCHEDULE = "0 7 * * *";

console.log(`Scheduler started. Daily briefing scheduled for "${SCHEDULE}" (local time).`);
console.log("Process will stay alive until stopped (Ctrl+C).");

cron.schedule(SCHEDULE, async () => {
  const stamp = new Date().toLocaleString();
  console.log(`[${stamp}] Triggering scheduled briefing...`);
  try {
    await runBriefing();
    console.log(`[${new Date().toLocaleString()}] Briefing complete.`);
  } catch (err) {
    // Log and keep the scheduler alive — one failed run shouldn't kill it.
    console.error(`[${new Date().toLocaleString()}] Briefing failed:`, err.message);
  }
});
