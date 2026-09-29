/**
 * Places real orders against the live database and checks what actually landed.
 *
 *   npm run verify:order
 *
 * This WRITES. Every order it creates is named "ZZ Verification Run" so the
 * rows can be found and deleted afterwards. It uses only the publishable key
 * and an anonymous session — exactly what a guest's browser has.
 */
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const db = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false } },
);

const TEST_NAME = "ZZ Verification Run";
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name.padEnd(52)} ${detail}`);
};

/* Some checks need a kitchen that is actually open. Outside opening hours the
   server correctly refuses every order, which is not a failure and must not be
   reported as one — a red run that means "it is early" teaches people to ignore
   red runs. Neither may it be reported as a pass. */
let skipped = 0;
const skip = (name, why) => {
  skipped++;
  console.log(`  skip  ${name.padEnd(52)} ${why}`);
};

/* ---------------------------------------------------- a guest's session */
const { data: auth, error: authErr } = await db.auth.signInAnonymously();
check("anonymous sign-in", !authErr && !!auth?.user, authErr?.message ?? `uid ${auth?.user?.id?.slice(0, 8)}…`);
check(
  "the session is anonymous, not a real account",
  auth?.user?.is_anonymous === true,
  `is_anonymous=${auth?.user?.is_anonymous}`,
);
if (authErr) process.exit(1);

/* ------------------------------------------------------ what is on offer */
const { data: menu } = await db.rpc("get_menu");
const openNow = (menu || []).filter((m) => m.is_available_now);
const dish = openNow[0] ?? (menu || [])[0];
check("a dish to order", !!dish, dish ? `${dish.name} @ ${dish.price_paise}p` : "menu empty");
if (!dish) process.exit(1);

/* Availability is decided in Asia/Kolkata by the kitchens' own hours. */
const kitchenOpen = openNow.length > 0;
if (!kitchenOpen) {
  const ist = new Date().toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  console.log(
    `\n  No kitchen is open at ${ist} IST, so the checks that place a real\n` +
      "  order are skipped rather than failed. Re-run during opening hours to\n" +
      "  exercise them.",
  );
}

const { data: addr } = await db.rpc("resolve_address", { p_code: "25dhh3fgsq" });
const addressCode = addr?.[0]?.address_id;
check("a room to deliver to", !!addressCode, addr?.[0]?.place_name);

const guest = { name: TEST_NAME, phone: "9876543210", email: null };
const order = (items, extra = {}) =>
  db.rpc("place_order", {
    p_address_code: addressCode,
    p_items: items,
    p_guest: guest,
    p_coupon: null,
    p_donate: false,
    p_note: "verification",
    ...extra,
  });

/* ------------------------------------------------- the money is the server's */
console.log("\nPricing\n");
const { data: placed, error: placeErr } = kitchenOpen
  ? await order([{ id: dish.id, qty: 2 }])
  : { data: null, error: null };
if (kitchenOpen) {
  check("an order can be placed", !placeErr && !!placed?.order_no, placeErr?.message ?? placed?.order_no);
} else {
  skip("an order can be placed", "needs an open kitchen");
  skip("the order's totals, receipt token and tickets", "no order to inspect");
}

if (placed) {
  const bill = placed.bill;
  const subtotal = dish.price_paise * 2;
  const delivery = subtotal >= 29900 ? 0 : 2900;
  const gst = Math.round(subtotal * 0.05);
  const expected = subtotal + delivery + 1500 + gst;

  check("subtotal is the database price x qty", bill.subtotal_paise === subtotal, `${bill.subtotal_paise} = ${dish.price_paise} x 2`);
  check("total matches the rule exactly", bill.total_paise === expected, `${bill.total_paise} vs ${expected}`);
  check("every amount is an integer paise", Object.values(bill).every((v) => v === null || typeof v === "string" || Number.isInteger(v)));
  check("a receipt token came back", typeof placed.receipt_token === "string" && placed.receipt_token.length > 30);
  check("it starts unpaid", placed.status === "pending_payment", placed.status);
  check("one ticket per kitchen", placed.kitchens === 1, `${placed.kitchens} kitchen(s)`);
  check(
    "the tickets were actually written",
    placed.tickets === undefined || placed.tickets === placed.kitchens,
    placed.tickets === undefined
      ? "migration 0007 not applied — count is intent, not fact"
      : `${placed.tickets} row(s) in order_tickets = ${placed.kitchens} kitchen(s)`,
  );
}

/* ------------------------------------------------- what a client cannot do */
console.log("\nWhat a browser cannot do\n");

/* The function takes no total at all, so the classic forgery is impossible by
   construction. Prove the extra field is simply not accepted. */
const { error: forgeErr } = await db.rpc("place_order", {
  p_address_code: addressCode,
  p_items: [{ id: dish.id, qty: 1 }],
  p_guest: guest,
  p_total_paise: 1,
});
check("a forged total is not even a parameter", !!forgeErr, forgeErr?.message?.slice(0, 44));

if (!kitchenOpen) {
  skip("an absurd quantity is clamped, not honoured", "needs an open kitchen");
} else {
  const { data: clamped, error: clampErr } = await order([{ id: dish.id, qty: 9999 }]);
  /* Accepting a rejection here would let a closed kitchen turn this green
     without the clamp ever being exercised. */
  check(
    "an absurd quantity is clamped, not honoured",
    !!clamped && clamped.bill.subtotal_paise === dish.price_paise * 20,
    clamped
      ? `${clamped.bill.subtotal_paise}p = 20 x ${dish.price_paise}`
      : `refused outright: ${clampErr?.message?.slice(0, 40)}`,
  );
}

const { error: ghostErr } = await order([{ id: "nosuchdish", qty: 1 }]);
check("a dish that does not exist is refused", !!ghostErr, ghostErr?.message?.slice(0, 44));

const { error: roomErr } = await db.rpc("place_order", {
  p_address_code: "nosuchroom",
  p_items: [{ id: dish.id, qty: 1 }],
  p_guest: guest,
});
check("an invalid room code is refused", !!roomErr, roomErr?.message?.slice(0, 44));

const { error: phoneErr } = await db.rpc("place_order", {
  p_address_code: addressCode,
  p_items: [{ id: dish.id, qty: 1 }],
  p_guest: { name: TEST_NAME, phone: "12345" },
});
check("a bogus phone number is refused", !!phoneErr, phoneErr?.message?.slice(0, 44));

const { error: emptyErr } = await order([]);
check("an empty order is refused", !!emptyErr, emptyErr?.message?.slice(0, 44));

/* --------------------------------------------------------- reading it back */
console.log("\nReading it back\n");
if (placed) {
  const { data: receipt } = await db.rpc("get_receipt", { p_token: placed.receipt_token });
  check("the receipt token returns the order", !!receipt, receipt?.order_no);
  check("the receipt shows the room", receipt?.room_number === "101", `room ${receipt?.room_number}`);
  check("the receipt total matches", receipt?.total_paise === placed.bill.total_paise);
  check("no kitchen is named anywhere in the receipt", !JSON.stringify(receipt).match(/kitchen/i));

  const { data: wrong } = await db.rpc("get_receipt", { p_token: "00000000-0000-0000-0000-000000000000" });
  check("a wrong token returns nothing", wrong === null, JSON.stringify(wrong));
}

/* A second guest must not see the first guest's order. */
const other = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});
await other.auth.signInAnonymously();
const { data: theirs } = await other.from("orders").select("id, guest_phone");
check("another guest sees none of these orders", (theirs ?? []).length === 0, `${(theirs ?? []).length} row(s)`);

/* ------------------------------------------------- the split across kitchens
 * This is the mechanic the business rests on: one order, several kitchens, one
 * ticket each. It cannot be aimed deliberately from here — `kitchen_id` is
 * hidden from the browser on purpose, so this script cannot tell which dishes
 * come from which kitchen. Ordering the entire menu sidesteps that: whatever
 * kitchens exist, an order for everything must touch all of them.
 */
console.log("\nThe split across kitchens\n");

const everything = (menu || [])
  .filter((m) => m.is_available_now)
  .map((m) => ({ id: m.id, qty: 1 }));

if (!kitchenOpen) {
  skip("one order splits into a ticket per kitchen", "needs an open kitchen");
}

const { data: wide, error: wideErr } = kitchenOpen
  ? await order(everything)
  : { data: null, error: null };

if (!kitchenOpen) {
  /* nothing to assert */
} else if (wideErr) {
  check("an order spanning the whole menu", false, wideErr.message.slice(0, 50));
} else if (wide.kitchens >= 2) {
  check(
    "one order splits into a ticket per kitchen",
    wide.tickets === undefined || wide.tickets === wide.kitchens,
    `${everything.length} dishes -> ${wide.kitchens} kitchens, ` +
      (wide.tickets === undefined
        ? "ticket rows unverified (apply 0007)"
        : `${wide.tickets} ticket row(s) written`) +
      `, order ${wide.order_no}`,
  );
} else {
  console.log(
    `  ----  the split is UNTESTED: every available dish comes from the same\n` +
      `        kitchen, so no order can span two. Add a second kitchen to\n` +
      `        csv/kitchen_map.csv and a dish for it in csv/menu_map.csv,\n` +
      `        re-import, and this check will exercise it.`,
  );
}

console.log(
  failures === 0
    ? skipped === 0
      ? "\nAll checks passed.\n"
      : `\nAll checks passed, ${skipped} skipped because no kitchen was open.\n` +
        "Re-run during opening hours before trusting a green result.\n"
    : `\n${failures} check(s) FAILED.\n`,
);
console.log(`Test orders are named "${TEST_NAME}" — delete them when done:`);
console.log(`  delete from orders where guest_name = '${TEST_NAME}';\n`);
process.exit(failures === 0 ? 0 : 1);
