/**
 * Reading the csv/ sheets, in one place.
 *
 * The import writes the sheets to the database and check:menu compares the two.
 * If they each parsed a sheet their own way, a disagreement between them would
 * mean nothing — so both read through here.
 */
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";

/* Headers in the sheets have stray spaces and a typo (menue_id). Normalise
   rather than making whoever maintains the sheet fix it by hand. */
export const read = (name) =>
  parse(readFileSync(`csv/${name}.csv`), {
    columns: (hdrs) => hdrs.map((h) => h.trim().toLowerCase()),
    skip_empty_lines: true,
    trim: true,
  });

export const yes = (v) => String(v || "").trim().toLowerCase() === "yes";
export const orNull = (v) => (v === "" || v == null ? null : v);
export const toTime = (v) => (v ? String(v).trim().padStart(5, "0") : null);
/* Rupees in the sheet, paise in the database — money never touches a float. */
export const toPaise = (v) => Math.round(Number(String(v).replace(/[^\d.]/g, "")) * 100);
export const slugOf = (n) =>
  n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/* The sheet's id column is misspelled; accept either spelling. */
export const menuId = (m) => (m.menue_id?.trim() || m.menu_id?.trim() || "");

/* The meal slots menu_items.meal_time may hold. It is a foreign key in the
   database, so a typo in the sheet aborts an import partway through; both the
   import and check:menu normalise through here so they cannot disagree about
   what counts as valid. */
export const MEAL_SLOTS = ["all_day", "breakfast", "brunch", "lunch", "dinner"];
export const mealSlot = (v) => {
  const slot = String(v || "all_day").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return MEAL_SLOTS.includes(slot) ? slot : null;
};
