/**
 * What can a stranger with the publishable key actually reach?
 *
 *   npm run verify:security
 *
 * The publishable key ships inside the browser bundle, so anyone who opens the
 * site has it. This asserts that RLS and column privileges hold it to exactly
 * what a guest needs and nothing more. Run it after every migration.
 */
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
let failures = 0;

const check = async (name, expectation, fn) => {
  const { data, error } = await fn();
  const ok = expectation(data, error);
  if (!ok) failures++;
  const detail = error ? error.message.slice(0, 60) : `${data?.length ?? 0} row(s)`;
  const note = error && !isSecurityError(error) ? "  <- not a security error, the check itself is broken" : "";
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name.padEnd(46)} ${detail}${note}`);
};

/* "Blocked" has to mean blocked *by security*, not blocked by a typo.
 *
 * Counting any error as a pass is how a check goes green for the wrong reason:
 * a renamed column makes PostgREST complain about the schema, and a test that
 * treats that as "cannot see it" is worse than no test, because it manufactures
 * confidence. So only two shapes count:
 *
 *   - no error and no rows  (RLS filters rather than refusing on SELECT)
 *   - a privilege or row-level-security error
 *
 * Anything else — undefined column, missing table — fails loudly. */
const isSecurityError = (error) =>
  error?.code === "42501" ||
  /permission denied|row-level security/i.test(error?.message ?? "");

const blocked = (data, error) =>
  error ? isSecurityError(error) : (data?.length ?? 0) === 0;
const refused = (data, error) => isSecurityError(error);
const allowed = (data, error) => !error;

console.log("\nWhat the publishable key can reach\n");

await check("kitchens — WhatsApp numbers stay private", blocked, () =>
  db.from("kitchens").select("id, place_name, whatsapp_number"),
);
await check("addresses — rooms cannot be enumerated", blocked, () =>
  db.from("addresses").select("id, place_name, phone_number"),
);
await check("delivery_partners — private", blocked, () =>
  db.from("delivery_partners").select("id, whatsapp_number"),
);
await check("order_items — private", blocked, () =>
  db.from("order_items").select("id"),
);
await check("order_tickets — private", blocked, () =>
  db.from("order_tickets").select("id"),
);
await check("message_log — private", blocked, () =>
  db.from("message_log").select("id"),
);

/* The menu tables are now fully closed: everything a guest sees arrives via
   get_menu(), which computes availability from kitchen hours internally and
   returns no kitchen id at all. */
await check("menu_items — table closed to the browser", blocked, () =>
  db.from("menu_items").select("id, name"),
);
await check("menu_items.kitchen_id — refused outright", refused, () =>
  db.from("menu_items").select("id, kitchen_id"),
);
await check("categories — table closed to the browser", blocked, () =>
  db.from("categories").select("id, name"),
);

await check("get_menu() — the only menu the browser gets", allowed, () =>
  db.rpc("get_menu"),
);
await check("get_menu() exposes no kitchen id", (data, error) =>
  !error && (data ?? []).every((r) => !("kitchen_id" in r)), () => db.rpc("get_menu"),
);

/* Writes must go through the edge function, which recomputes the price. */
await check("orders — cannot be inserted from a browser", refused, () =>
  db.from("orders").insert({
    order_no: "HACK-1",
    address_id: "aaaaaaaaaa",
    guest_name: "x",
    guest_phone: "9999999999",
    subtotal_paise: 1,
    total_paise: 1,
  }),
);
/* An UPDATE that RLS denies reports success with nothing changed rather than
   an error, so the assertion is "no row was actually altered", not "it threw". */
await check("menu_items — cannot be repriced from a browser", blocked, () =>
  db.from("menu_items").update({ price_paise: 1 }).neq("id", "").select("id"),
);

/* Postgres grants EXECUTE to PUBLIC by default, so a new function is reachable
   from a browser unless someone says otherwise. Assert the exposed set. */
const RPCS = {
  get_menu: { args: {}, exposed: true },
  resolve_address: { args: { p_code: "nope" }, exposed: true },
  get_receipt: { args: { p_token: "00000000-0000-0000-0000-000000000000" }, exposed: true },
  is_permanent_user: { args: {}, exposed: true },
  kitchen_is_open: {
    args: { p_opens: "08:00", p_closes: "23:00", p_sunday_off: false },
    exposed: true,
  },
  new_code: { args: {}, exposed: false },
};

console.log("\nWhich functions the browser may call\n");
for (const [fn, { args, exposed }] of Object.entries(RPCS)) {
  const { error } = await db.rpc(fn, args);
  const callable = !error || !isSecurityError(error);
  const ok = callable === exposed;
  if (!ok) failures++;
  console.log(
    `${ok ? "  ok  " : "  FAIL"}  ${fn.padEnd(20)} ${callable ? "callable" : "denied  "}` +
      `  ${exposed ? "(intended)" : "(must not be callable)"}`,
  );
}

console.log(
  failures === 0
    ? "\nAll checks passed.\n"
    : `\n${failures} check(s) FAILED — do not ship.\n`,
);
process.exit(failures === 0 ? 0 : 1);
