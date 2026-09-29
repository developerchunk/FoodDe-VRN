/**
 * Asserts that csv/ and the database still describe the same menu.
 *
 *   npm run check:menu                      the menu, with the publishable key
 *   SUPABASE_SECRET_KEY=... npm run check:menu   also compares the kitchen sheet
 *
 * Why this exists: menu_items upserts on id, so if the sheet's id column ever
 * slips out of step with the database, the next import silently renames dishes
 * instead of failing. That happened — a write-back bug shifted the whole column
 * by one row, so eight ids pointed at the dish above them and one dish was
 * missing from the sheet entirely. Nothing complained, because every id was
 * individually well-formed. Only comparing the two sides catches it.
 *
 * Name and price are checked as well as the id: a mismatch there is the symptom
 * that makes an id mismatch expensive, since order_items records what was
 * charged and the sheet is what a human reads.
 */
import { createClient } from "@supabase/supabase-js";
import { read, yes, toTime, toPaise, slugOf, menuId } from "./lib/sheets.mjs";
import { SELLER } from "../src/utils/seller.js";
import "dotenv/config";

let failures = 0;
/* Two kinds of disagreement, needing opposite advice. If ids and names line up
   and only content differs, the sheet holds an edit that has not been imported
   yet and the import is the fix. If an id points at a different dish, the
   column has slipped and importing would write that slip into the database. */
let identityBroken = false;
const check = (ok, label, detail = "", { identity = false } = {}) => {
  if (!ok) {
    failures++;
    if (identity) identityBroken = true;
  }
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `\n          ${detail}` : ""}`);
};

const url = process.env.VITE_SUPABASE_URL;
const publishable = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !publishable) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY.");
  process.exit(1);
}

const menu = read("menu_map");
const kitchens = read("kitchen_map");

/* ---------------------------------------------- the sheet, on its own terms */
console.log("\ncsv/menu_map.csv, internally\n");

const blanks = menu.filter((m) => !menuId(m)).map((m) => m.dish);
check(
  blanks.length === 0,
  `every row carries an id (${menu.length} row(s))`,
  blanks.length ? `no id: ${blanks.join(", ")} — run the import to mint one` : "",
  { identity: true },
);

const dupIds = [...new Set(menu.map(menuId).filter((id, i, a) => id && a.indexOf(id) !== i))];
check(dupIds.length === 0, "ids are unique", dupIds.length ? `repeated: ${dupIds.join(", ")}` : "", { identity: true });

const dupNames = [
  ...new Set(menu.map((m) => m.dish).filter((d, i, a) => a.indexOf(d) !== i)),
];
check(
  dupNames.length === 0,
  "dish names are unique",
  dupNames.length ? `repeated: ${dupNames.join(", ")} — the name is how a broken id column gets repaired` : "",
  { identity: true },
);

const kitchenIds = new Set(kitchens.map((k) => k.kitchen_id?.trim()).filter(Boolean));
const orphanKitchens = menu
  .filter((m) => !kitchenIds.has(m.kitchen_id?.trim()))
  .map((m) => `${m.dish} -> ${m.kitchen_id}`);
check(
  orphanKitchens.length === 0,
  "every dish names a kitchen that exists in kitchen_map.csv",
  orphanKitchens.join("; "),
);

/* -------------------------------------------------- the sheet vs the database */
const db = createClient(url, publishable, { auth: { persistSession: false } });
const { data: live, error } = await db.rpc("get_menu");
if (error) {
  console.error(`\nget_menu() failed: ${error.message}\n`);
  process.exit(1);
}

console.log("\ncsv/menu_map.csv vs the database\n");

const liveById = new Map(live.map((d) => [d.id, d]));
const sheetIds = new Set(menu.map(menuId).filter(Boolean));

const missing = menu.filter((m) => menuId(m) && !liveById.has(menuId(m)));
check(
  missing.length === 0,
  "every id in the sheet exists in the database",
  missing.map((m) => `${menuId(m)} (${m.dish})`).join("; "),
  { identity: true },
);

const orphaned = live.filter((d) => !sheetIds.has(d.id));
check(
  orphaned.length === 0,
  "every dish in the database appears in the sheet",
  orphaned.length
    ? `${orphaned.map((d) => `${d.id} (${d.name})`).join("; ")} — in the database but not the sheet, so the next import leaves it behind`
    : "",
  { identity: true },
);

/* The one that matters: does each id still mean the same dish on both sides? */
const txt = (v) => String(v ?? "").trim();
/* Everything here is read by a guest, so sheet and database drifting apart is
   not cosmetic: the sheet is what someone edits, the database is what is shown.
   A fix typed into the sheet and never imported looks done and is not. */
const FIELDS = [
  ["each id means the same dish on both sides", (d) => txt(d.name), (m) => txt(m.dish)],
  ["prices agree, to the paise", (d) => d.price_paise, (m) => toPaise(m.base_price)],
  ["categories agree", (d) => d.category_slug, (m) => slugOf(m.category || "")],
  ["the no onion-garlic flag agrees", (d) => d.is_sattvic, (m) => yes(m.is_satvik)],
  ["descriptions agree", (d) => txt(d.description), (m) => txt(m.description)],
  ["ingredients agree", (d) => txt(d.ingredients), (m) => txt(m.ingredients)],
  ["cooking times agree", (d) => Number(d.cooking_time_mins), (m) => Number(m.cooking_time_mins)],
  ["the spicy flag agrees", (d) => d.is_spicy, (m) => yes(m.is_spicy)],
  ["the loved flag agrees", (d) => d.is_loved, (m) => yes(m.is_loved)],
];
for (const [label, fromDb, fromSheet] of FIELDS) {
  const diffs = [];
  for (const m of menu) {
    const d = liveById.get(menuId(m));
    if (!d) continue;
    const a = fromDb(d);
    const b = fromSheet(m);
    if (a !== b) diffs.push(`${d.id} ${d.name}: sheet ${JSON.stringify(b)}, database ${JSON.stringify(a)}`);
  }
  check(diffs.length === 0, label, diffs.join("\n          "), {
    identity: label.startsWith("each id"),
  });
}

/* ------------------------------------------ kitchens, only with the secret key */
const secret = process.env.SUPABASE_SECRET_KEY;
if (!secret) {
  console.log(
    "\ncsv/kitchen_map.csv vs the database\n\n" +
      "  skip  kitchens are unreadable with the publishable key, by design.\n" +
      "        Re-run as: SUPABASE_SECRET_KEY=... npm run check:menu",
  );
} else {
  console.log("\ncsv/kitchen_map.csv vs the database\n");
  const admin = createClient(url, secret, { auth: { persistSession: false } });
  const { data: rows, error: kErr } = await admin
    .from("kitchens")
    .select("id, place_name, opens_at, closes_at, is_sunday_off, whatsapp_number");
  if (kErr) {
    check(false, "read the kitchens table", kErr.message);
  } else {
    const byId = new Map(rows.map((k) => [k.id, k]));
    for (const k of kitchens) {
      const id = k.kitchen_id?.trim();
      const live = byId.get(id);
      if (!live) {
        check(false, `${id} is in the sheet`, "not in the database — run the import");
        continue;
      }
      /* Postgres hands back time as HH:MM:SS, the sheet usually writes HH:MM —
         but a sheet may carry seconds too, so normalise both sides rather than
         only the database's, or an agreeing pair reads as a difference. */
      const hm = (t) => (t ? String(t).slice(0, 5) : null);
      const diffs = [];
      const sheetOpens = hm(toTime(k.open_time_24h));
      const sheetCloses = hm(toTime(k.close_time_24h));
      if (hm(live.opens_at) !== sheetOpens) diffs.push(`opens_at: sheet ${sheetOpens}, database ${hm(live.opens_at)}`);
      if (hm(live.closes_at) !== sheetCloses) diffs.push(`closes_at: sheet ${sheetCloses}, database ${hm(live.closes_at)}`);
      if (live.is_sunday_off !== yes(k.is_sunday_off)) diffs.push(`is_sunday_off: sheet ${yes(k.is_sunday_off)}, database ${live.is_sunday_off}`);
      if (String(live.whatsapp_number).trim() !== String(k.phone_number).trim()) diffs.push(`whatsapp: sheet ${k.phone_number}, database ${live.whatsapp_number}`);
      check(diffs.length === 0, `${id} ${k.place_name}`, diffs.join("\n          "));
    }
    /* The footer prints one opening time for the whole service. It claimed
       7:00 am to 10:30 pm for months, matching no kitchen, because nothing
       compared it to anything. */
    const hm = (t) => (t ? String(t).slice(0, 5) : null);
    const opens = rows.map((r) => hm(r.opens_at)).filter(Boolean).sort();
    const closes = rows.map((r) => hm(r.closes_at)).filter(Boolean).sort();
    const earliest = opens[0];
    const latest = closes[closes.length - 1];
    const hoursDiffs = [];
    if (earliest !== SELLER.opensAt)
      hoursDiffs.push(`opens: SELLER says ${SELLER.opensAt}, earliest kitchen is ${earliest}`);
    if (latest !== SELLER.closesAt)
      hoursDiffs.push(`closes: SELLER says ${SELLER.closesAt}, latest kitchen is ${latest}`);
    check(
      hoursDiffs.length === 0,
      "the hours shown in the footer match when food is actually available",
      hoursDiffs.join("\n          "),
    );

    const extra = rows.filter((r) => !kitchenIds.has(r.id));
    check(
      extra.length === 0,
      "no kitchen in the database is missing from the sheet",
      extra.map((r) => `${r.id} (${r.place_name})`).join("; "),
    );
  }
}

if (failures === 0) {
  console.log("\nThe sheets and the database agree.\n");
} else if (identityBroken) {
  console.log(
    `\n${failures} check(s) FAILED, and the ids themselves disagree.\n` +
      "Do NOT run the import: menu_items upserts on id, so importing over a\n" +
      "slipped id column writes the slip into the database and renames dishes.\n" +
      "Repair the sheet's id column against the database first.\n",
  );
} else {
  console.log(
    `\n${failures} check(s) FAILED, but every id still names the same dish.\n` +
      "This is an edit made in the sheet and not yet imported. Push it with:\n" +
      "  SUPABASE_SECRET_KEY=... npm run import\n",
  );
}
process.exit(failures === 0 ? 0 : 1);
