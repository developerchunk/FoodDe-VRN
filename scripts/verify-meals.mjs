/**
 * Proves the meal-window rule against the live database.
 *
 *   npm run verify:meals
 *
 * 0009 carries its own do-block, but a migration that did not abort is only
 * negative evidence — it says nothing ran into an exception, not that the
 * answers are right. This asks the deployed function, one instant at a time,
 * and prints what it actually said.
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
  ["all_day    03:00 IST", "all_day", null, null, "2026-09-28T21:30:00Z", true, "all day means the kitchen's hours only"],
  ["breakfast  08:00 IST", "breakfast", "07:00", "11:00", "2026-09-28T02:30:00Z", true, "inside the window"],
  ["breakfast  06:30 IST", "breakfast", "07:00", "11:00", "2026-09-28T01:00:00Z", false, "before it opens"],
  ["breakfast  12:00 IST", "breakfast", "07:00", "11:00", "2026-09-28T06:30:00Z", false, "after it closes"],
  ["brunch     11:30 IST", "brunch", "10:00", "13:00", "2026-09-28T06:00:00Z", true, "overlapping windows are fine"],
  ["lunch      12:00 IST", "lunch", "12:00", "16:00", "2026-09-28T06:30:00Z", true, "exactly at the boundary"],
  ["lunch      16:00 IST", "lunch", "12:00", "16:00", "2026-09-28T10:30:00Z", true, "closing boundary is inclusive"],
  ["dinner     20:00 IST", "dinner", "19:00", "23:00", "2026-09-28T14:30:00Z", true, "inside the window"],
  ["dinner     08:00 IST", "dinner", "19:00", "23:00", "2026-09-28T02:30:00Z", false, "a dinner dish at breakfast"],
  ["supper     01:00 IST", "supper", "22:00", "02:00", "2026-09-28T19:30:00Z", true, "window running past midnight"],
  ["supper     12:00 IST", "supper", "22:00", "02:00", "2026-09-28T06:30:00Z", false, "past-midnight window, midday"],
  ["no window  12:00 IST", "breakfast", null, null, "2026-09-28T06:30:00Z", true, "unfilled window must not hide a dish"],
  ["null slot  12:00 IST", null, null, null, "2026-09-28T06:30:00Z", true, "no slot means no restriction"],
];

let failures = 0;
console.log("\nmeal_is_on(), asked of the live database\n");

for (const [label, slot, starts, ends, at, expected, why] of CASES) {
  const { data, error } = await db.rpc("meal_is_on", {
    p_slot: slot,
    p_starts: starts,
    p_ends: ends,
    p_at: at,
  });
  const ok = !error && data === expected;
  if (!ok) failures++;
  const got = error ? `error: ${error.message.slice(0, 44)}` : data ? "on" : "off";
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label.padEnd(22)} -> ${got.padEnd(8)} ${why}`);
}

/* meal_is_on on its own does not decide anything. dish_is_on is the rule the
   menu and place_order actually apply, and the point of it is that a dish with
   a window of its own ignores the kitchen's opening time. */
const DISH_CASES = [
  ["breakfast 07:30, kitchen 08:00", "breakfast", "07:00", "11:00", "08:00", "23:00", false, "2026-09-28T02:00:00Z", true, "the window wins — this is the whole point"],
  ["all_day   07:30, kitchen 08:00", "all_day", null, null, "08:00", "23:00", false, "2026-09-28T02:00:00Z", false, "no window, so the kitchen decides"],
  ["all_day   09:00, kitchen 08:00", "all_day", null, null, "08:00", "23:00", false, "2026-09-28T03:30:00Z", true, "kitchen open, dish on"],
  ["breakfast 12:00, kitchen open", "breakfast", "07:00", "11:00", "08:00", "23:00", false, "2026-09-28T06:30:00Z", false, "window over, kitchen open is not enough"],
  ["dinner    23:30, kitchen shut", "dinner", "19:00", "23:00", "08:00", "23:00", false, "2026-09-28T18:00:00Z", false, "both say no"],
  ["breakfast 07:30, Sunday off", "breakfast", "07:00", "11:00", "08:00", "23:00", true, "2026-09-27T02:00:00Z", false, "shut for the day beats the window"],
  ["breakfast 07:30, Monday", "breakfast", "07:00", "11:00", "08:00", "23:00", true, "2026-09-28T02:00:00Z", true, "same kitchen, not Sunday"],
];

console.log("\ndish_is_on(), the rule the menu actually applies\n");

for (const [label, slot, starts, ends, opens, closes, sundayOff, at, expected, why] of DISH_CASES) {
  const { data, error } = await db.rpc("dish_is_on", {
    p_slot: slot,
    p_starts: starts,
    p_ends: ends,
    p_opens: opens,
    p_closes: closes,
    p_sunday_off: sundayOff,
    p_at: at,
  });
  const ok = !error && data === expected;
  if (!ok) failures++;
  const got = error ? `error: ${error.message.slice(0, 44)}` : data ? "on" : "off";
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label.padEnd(32)} -> ${got.padEnd(5)} ${why}`);
}

const total = CASES.length + DISH_CASES.length;

console.log(
  failures === 0
    ? `\nAll ${total} cases match.\n`
    : `\n${failures} case(s) FAILED.\n` +
      "If every case errored, migration 0009 has not been applied yet.\n",
);
process.exit(failures === 0 ? 0 : 1);
