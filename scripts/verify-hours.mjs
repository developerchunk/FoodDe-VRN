/**
 * Proves the kitchen-hours rule against the live database.
 *
 *   npm run verify:hours
 *
 * The migration's own do-block aborts on failure, but a silent pass is only
 * negative evidence. This asks the deployed function directly, one case at a
 * time, and prints what it actually answered.
 */
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const db = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false } },
);

/* IST wall-clock times, written as the UTC instant they correspond to. */
const CASES = [
  ["Fri 07:30  08:00-23:00", "08:00", "23:00", false, "2026-09-25T02:00:00Z", false, "before opening"],
  ["Fri 09:00  08:00-23:00", "08:00", "23:00", false, "2026-09-25T03:30:00Z", true,  "during hours"],
  ["Fri 22:59  08:00-23:00", "08:00", "23:00", false, "2026-09-25T17:29:00Z", true,  "a minute before close"],
  ["Fri 23:30  08:00-23:00", "08:00", "23:00", false, "2026-09-25T18:00:00Z", false, "after closing"],
  ["Fri 23:30  18:00-02:00", "18:00", "02:00", false, "2026-09-25T18:00:00Z", true,  "late kitchen, before midnight"],
  ["Sat 01:00  18:00-02:00", "18:00", "02:00", false, "2026-09-25T19:30:00Z", true,  "late kitchen, after midnight"],
  ["Fri 09:00  18:00-02:00", "18:00", "02:00", false, "2026-09-25T03:30:00Z", false, "late kitchen, daytime"],
  ["Sun 12:00  sunday off",  "08:00", "23:00", true,  "2026-09-27T06:30:00Z", false, "Sunday-off kitchen, Sunday"],
  ["Fri 09:00  sunday off",  "08:00", "23:00", true,  "2026-09-25T03:30:00Z", true,  "Sunday-off kitchen, Friday"],
  ["Fri 07:30  no hours set", null,   null,    false, "2026-09-25T02:00:00Z", true,  "unknown hours count as open"],
];

let failures = 0;
console.log("\nkitchen_is_open(), asked of the live database\n");

for (const [label, opens, closes, sundayOff, at, expected, why] of CASES) {
  const { data, error } = await db.rpc("kitchen_is_open", {
    p_opens: opens,
    p_closes: closes,
    p_sunday_off: sundayOff,
    p_at: at,
  });
  const ok = !error && data === expected;
  if (!ok) failures++;
  const got = error ? `error: ${error.message.slice(0, 40)}` : data ? "open" : "closed";
  console.log(
    `${ok ? "  ok  " : "  FAIL"}  ${label.padEnd(26)} -> ${got.padEnd(7)} ${why}`,
  );
}

console.log(
  failures === 0
    ? `\nAll ${CASES.length} cases match.\n`
    : `\n${failures} case(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
