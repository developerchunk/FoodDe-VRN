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
  db.from("addresses").select("id, place_id, room_number"),
);
await check("places — rest houses cannot be listed", blocked, () =>
  db.from("places").select("id, name, whatsapp_number"),
);
await check("admin_users — who the admins are stays private", blocked, () =>
  db.from("admin_users").select("email, role"),
);
await check("settings — private", blocked, () => db.from("settings").select("key, value"));
await check("coupons — table closed (get_coupons is the way)", blocked, () =>
  db.from("coupons").select("code, value"),
);
await check("delivery_offers — private", blocked, () => db.from("delivery_offers").select("id"));
await check("order_status_history — private", blocked, () =>
  db.from("order_status_history").select("id"),
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
  /* The WhatsApp flow: only the edge functions, holding the secret key, may
     record a kitchen's or rider's answer. A browser that could would accept
     orders on a kitchen's behalf. */
  whatsapp_button_reply: { args: { p_payload: "k:x:a", p_from: "1", p_inbound_id: "x" }, exposed: false },
  kitchen_decide: {
    args: { p_ticket_id: "00000000-0000-0000-0000-000000000000", p_accept: true, p_actor: "kitchen" },
    exposed: false,
  },
  rider_decide: { args: { p_offer_id: "00000000-0000-0000-0000-000000000000", p_accept: true }, exposed: false },
  escalate_overdue: { args: { p_minutes: 10 }, exposed: false },
  unavailable_in_order: { args: { p_order_id: "00000000-0000-0000-0000-000000000000" }, exposed: false },
  /* Admin actions need a signed-in admin; the publishable key alone gets none. */
  admin_whoami: { args: {}, exposed: false },
  admin_analytics: { args: { p_period: "today" }, exposed: false },
  admin_set_order_status: {
    args: { p_order_id: "00000000-0000-0000-0000-000000000000", p_status: "cancelled" },
    exposed: false,
  },
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

/* The admin site's grants go to `authenticated`, and every guest who orders
   is authenticated (anonymously). So the same questions again, as a guest:
   being signed in must not be mistaken for being an admin. */
console.log("\nAs a signed-in (anonymous) guest\n");
const { error: anonErr } = await db.auth.signInAnonymously();
if (anonErr) {
  failures++;
  console.log(`  FAIL  could not start a guest session: ${anonErr.message}`);
} else {
  await check("kitchens — still private", blocked, () => db.from("kitchens").select("id"));
  await check("places — still private", blocked, () => db.from("places").select("id"));
  await check("addresses — still private", blocked, () => db.from("addresses").select("id"));
  await check("menu_items — kitchen_id still hidden", blocked, () =>
    db.from("menu_items").select("id, kitchen_id"),
  );
  await check("settings — still private", blocked, () => db.from("settings").select("key"));
  await check("coupons — still private", blocked, () => db.from("coupons").select("code"));
  await check("message_log — still private", blocked, () => db.from("message_log").select("id"));
  await check("menu_items — still cannot be repriced", blocked, () =>
    db.from("menu_items").update({ price_paise: 1 }).neq("id", "").select("id"),
  );
  await check("kitchens — cannot be added", refused, () =>
    db.from("kitchens").insert({ place_name: "x", whatsapp_number: "9999999999" }),
  );
  await check("admin_whoami — a guest has no roles", (data, error) =>
    !error && Array.isArray(data?.roles) && data.roles.length === 0, () => db.rpc("admin_whoami"),
  );
  await check("admin_analytics — refused to a guest", refused, () =>
    db.rpc("admin_analytics", { p_period: "today" }),
  );
  await check("admin_set_order_status — refused to a guest", refused, () =>
    db.rpc("admin_set_order_status", {
      p_order_id: "00000000-0000-0000-0000-000000000000",
      p_status: "cancelled",
    }),
  );
  await db.auth.signOut();
}

console.log(
  failures === 0
    ? "\nAll checks passed.\n"
    : `\n${failures} check(s) FAILED — do not ship.\n`,
);
process.exit(failures === 0 ? 0 : 1);
