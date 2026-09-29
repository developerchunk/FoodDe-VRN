/**
 * csv/ -> Supabase. Kitchens, then the menu, then addresses.
 *
 *   node scripts/import-csv.mjs --dry-run    shows the plan, writes nothing
 *   node scripts/import-csv.mjs              needs SUPABASE_SECRET_KEY
 *
 * Order matters: menu rows reference a kitchen_id, so kitchens go first.
 *
 * Ids are the shared 10-character code. Where a sheet already has one it is
 * kept — those are the numbers printed on QR stickers and quoted in the
 * kitchen sheet, so re-minting them would break things in the physical world.
 * Where a sheet leaves it blank (menue_id), one is minted and written back so
 * the sheet and the database agree from then on.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { makePublicCode } from "./lib/code.mjs";
import {
  read, yes, orNull, toTime, toPaise, slugOf, menuId, mealSlot, MEAL_SLOTS,
} from "./lib/sheets.mjs";
import "dotenv/config";

const dryRun = process.argv.includes("--dry-run");


const kitchens = read("kitchen_map");
const menu = read("menu_map");
const addresses = read("address_map");

const kitchenRows = kitchens.map((k) => ({
  id: k.kitchen_id?.trim() || makePublicCode(),
  place_name: k.place_name,
  owner_name: orNull(k.owner_name),
  address: orNull(k.address),
  area: orNull(k.area),
  pin_code: orNull(k.pin_code),
  city: k.city || "Vrindavan",
  latitude: k.latitude ? Number(k.latitude) : null,
  longitude: k.longitude ? Number(k.longitude) : null,
  whatsapp_number: k.phone_number,
  opens_at: toTime(k.open_time_24h),
  closes_at: toTime(k.close_time_24h),
  is_sunday_off: yes(k.is_sunday_off),
  fssai_license: orNull(k.fssai_license),
  gst_number: orNull(k.gst_number),
  is_active: true,
}));

/* Two constraints in the database would catch these, but an aborted import
   halfway through is a worse way to learn about a typo than a message naming
   the dish. */
const badWindows = menu.flatMap((m) => {
  const a = toTime(m.meal_start);
  const b = toTime(m.meal_end);
  if (!a && !b) return [];
  if (!a || !b)
    return [`${m.dish}: needs both meal_start and meal_end, or neither`];
  if (mealSlot(m.meal_time) === "all_day")
    return [`${m.dish}: an all_day dish cannot also have ${a}-${b}`];
  return [];
});
if (badWindows.length) {
  console.error(`\nBad meal window in csv/menu_map.csv:\n  ${badWindows.join("\n  ")}\n`);
  process.exit(1);
}

const badMeals = menu
  .filter((m) => mealSlot(m.meal_time) === null)
  .map((m) => `${m.dish} -> "${m.meal_time}"`);
if (badMeals.length) {
  console.error(
    `\nUnknown meal_time in csv/menu_map.csv:\n  ${badMeals.join("\n  ")}\n` +
      `Use one of: ${MEAL_SLOTS.join(", ")}\n`,
  );
  process.exit(1);
}

const categoryNames = [...new Set(menu.map((m) => m.category).filter(Boolean))];
/* No id yet: a category that already exists must keep the id menu_items.
   category_id points at. Minting one here and upserting on slug would try to
   change a primary key out from under a foreign key. */
const categoryRows = categoryNames.map((name, i) => ({
  slug: slugOf(name),
  name,
  sort_order: i,
  is_active: true,
}));

const mintedMenuIds = [];
const menuRows = menu.map((m, i) => {
  const existing = menuId(m);
  const id = existing || makePublicCode();
  if (!existing) mintedMenuIds.push({ dish: m.dish, id });
  return {
    id,
    kitchen_id: m.kitchen_id?.trim(),
    category_slug: slugOf(m.category || ""),
    name: m.dish,
    description: orNull(m.description),
    price_paise: toPaise(m.base_price),
    ingredients: orNull(m.ingredients),
    cooking_time_mins: m.cooking_time_mins ? Number(m.cooking_time_mins) : null,
    is_sattvic: yes(m.is_satvik),
    is_spicy: yes(m.is_spicy),
    is_loved: yes(m.is_loved),
    meal_time: mealSlot(m.meal_time),
    /* Blank means "inherit the slot's window", which is null in the database. */
    meal_starts_at: toTime(m.meal_start),
    meal_ends_at: toTime(m.meal_end),
    is_available: true,
    sort_order: i,
  };
});

/* A dish pointing at a kitchen that does not exist cannot be cooked, and would
   fail on insert anyway — say so plainly instead. */
const kitchenIds = new Set(kitchenRows.map((k) => k.id));
const orphans = menuRows.filter((m) => !kitchenIds.has(m.kitchen_id));
if (orphans.length) {
  console.error("\nThese dishes name a kitchen that is not in kitchen_map.csv:");
  for (const o of orphans) console.error(`  ${o.name} -> kitchen_id ${o.kitchen_id || "(blank)"}`);
  console.error("\nNothing was written. Fix the sheet and run again.\n");
  process.exit(1);
}

const addressRows = addresses.map((a) => ({
  /* address_id in the sheet is still the old sequential 1. The real key is the
     code already minted and printed, so leave existing rows alone and only
     mint for genuinely new ones. */
  sheet_id: a.address_id,
  place_name: a.place_name,
  room_number: String(a.room_number),
  address: a.address,
  area: orNull(a.area),
  pin_code: a.pin_code ? String(a.pin_code) : null,
  city: a.city || "Vrindavan",
  latitude: a.latitude ? Number(a.latitude) : null,
  longitude: a.longitude ? Number(a.longitude) : null,
  phone_number: a.phone_number ? String(a.phone_number) : null,
  is_active: true,
}));

if (dryRun) {
  console.log(`\nDRY RUN — nothing is written.\n`);
  console.log(`Kitchens (${kitchenRows.length})`);
  for (const k of kitchenRows)
    console.log(
      `  ${k.id}  ${k.place_name}  ${k.opens_at}-${k.closes_at}` +
        `${k.is_sunday_off ? "  (closed Sundays)" : ""}  wa:${k.whatsapp_number}`,
    );
  console.log(`\nCategories (${categoryRows.length})`);
  for (const c of categoryRows) console.log(`  ${c.slug}  ${c.name}`);
  console.log(`\nMenu (${menuRows.length})`);
  for (const m of menuRows)
    console.log(
      `  ${m.id}  ${m.name}  Rs ${(m.price_paise / 100).toFixed(2)}` +
        `  kitchen:${m.kitchen_id}  ${m.is_sattvic ? "sattvic" : "has onion/garlic"}` +
          `  ${m.meal_time}${m.meal_starts_at ? ` ${m.meal_starts_at}-${m.meal_ends_at}` : ""}`,
    );
  console.log(`\nAddresses (${addressRows.length}) — existing codes preserved`);
  for (const a of addressRows) console.log(`  ${a.place_name} room ${a.room_number}`);
  if (mintedMenuIds.length)
    console.log(`\n${mintedMenuIds.length} menu id(s) would be minted and written back to csv/menu_map.csv`);
  console.log();
  process.exit(0);
}

const url = process.env.VITE_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SECRET_KEY.");
  process.exit(1);
}
const db = createClient(url, secret, { auth: { persistSession: false } });

const step = async (label, fn) => {
  const { error } = await fn();
  if (error) {
    console.error(`  FAILED  ${label}: ${error.message}`);
    process.exit(1);
  }
  console.log(`  ok      ${label}`);
};

console.log("\nImporting\n");

await step(`${kitchenRows.length} kitchen(s)`, () =>
  db.from("kitchens").upsert(kitchenRows, { onConflict: "id" }),
);
/* Reuse the id of any category that already exists; mint only for new slugs. */
const { data: priorCats, error: priorErr } = await db.from("categories").select("id, slug");
if (priorErr) {
  console.error(priorErr.message);
  process.exit(1);
}
const heldId = new Map((priorCats || []).map((c) => [c.slug, c.id]));

await step(`${categoryRows.length} categor(ies)`, () =>
  db.from("categories").upsert(
    categoryRows.map((c) => ({ id: heldId.get(c.slug) || makePublicCode(), ...c })),
    { onConflict: "slug" },
  ),
);

const { data: cats, error: catErr } = await db.from("categories").select("id, slug");
if (catErr) {
  console.error(catErr.message);
  process.exit(1);
}
const idBySlug = new Map(cats.map((c) => [c.slug, c.id]));

await step(`${menuRows.length} menu item(s)`, () =>
  db.from("menu_items").upsert(
    menuRows.map(({ category_slug, ...m }) => ({
      ...m,
      category_id: idBySlug.get(category_slug),
    })),
    { onConflict: "id" },
  ),
);

/* Addresses: match on place + room so a re-run never mints a second code for a
   room whose sticker is already on the wall. */
const { data: existingAddrs } = await db
  .from("addresses")
  .select("id, place_name, room_number");
const keyOf = (r) => `${r.place_name}|${r.room_number}`;
const addrIdByKey = new Map((existingAddrs || []).map((r) => [keyOf(r), r.id]));

await step(`${addressRows.length} address(es)`, () =>
  db.from("addresses").upsert(
    addressRows.map(({ sheet_id: _sheet_id, ...a }) => {
      const held = addrIdByKey.get(keyOf(a));
      return held ? { id: held, ...a } : a;
    }),
    { onConflict: "id" },
  ),
);

if (mintedMenuIds.length) {
  const raw = readFileSync("csv/menu_map.csv", "utf8");
  const lines = raw.split("\n");
  /* Only consume a minted id on a row that actually needs one. Advancing the
     counter on every row — including rows that already carry an id — shifts the
     whole column by one, so each dish inherits the id of the dish above it and
     the last row is left blank. That silently renames dishes on the next import,
     because menu_items upserts on id. */
  let n = 0;
  const blanks = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    if (lines[i].startsWith(",")) blanks.push(i);
  }
  if (blanks.length !== mintedMenuIds.length) {
    console.error(
      `\n  Refusing to write back: ${blanks.length} row(s) without an id, but ` +
        `${mintedMenuIds.length} id(s) were minted. csv/menu_map.csv is unchanged; ` +
        `the database already has the new rows, so copy their ids across by hand.`,
    );
    process.exit(1);
  }
  for (const i of blanks) lines[i] = mintedMenuIds[n++].id + lines[i];
  writeFileSync("csv/menu_map.csv", lines.join("\n"));
  console.log(`\n  Wrote ${mintedMenuIds.length} minted menu id(s) back into csv/menu_map.csv`);
}

console.log("\nDone. Run npm run verify:security next.\n");
