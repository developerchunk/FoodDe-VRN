/**
 * Printable QR codes, one per address, straight from Supabase.
 *
 *   node scripts/generate-qr.mjs
 *
 * Writes qr/<address_id>-<room>.svg (the full sticker, fonts inside, ready
 * for a print shop) plus qr/sheet.html — open that in a browser and print it,
 * four stickers to an A4 page. Each label carries the rest house name and room number
 * so whoever is sticking them up can tell which goes where; getting that wrong
 * means a guest's food goes to someone else's room.
 *
 * Needs SUPABASE_SECRET_KEY: `addresses` is deliberately unreadable with the
 * publishable key, so that nobody can enumerate every room in every property.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import QRCode from "qrcode";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { STICKER_FONTS_LINK, STICKER_SHEET_CSS, stickerFontCss, stickerSvg } from "../src/utils/sticker.js";

const url = process.env.VITE_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const base = process.env.IRD_SITE_URL || "https://www.inroomdining.in";

if (!url || !secret) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SECRET_KEY — see scripts/import-addresses.mjs");
  process.exit(1);
}

const db = createClient(url, secret, { auth: { persistSession: false } });

/* The admin site prints the same stickers per place (Places & rooms). This is
   the whole set at once, for a first print run. */
const { data: rooms, error } = await db
  .from("addresses")
  .select("id, room_number, place:places(name, address)")
  .eq("is_active", true)
  .order("id");
const addresses = (rooms ?? []).map((r) => ({
  id: r.id,
  room_number: r.room_number,
  place_name: r.place?.name ?? "",
  address: r.place?.address ?? "",
}));

if (error) {
  console.error("Could not read addresses:", error.message);
  process.exit(1);
}
if (!addresses.length) {
  console.error("No active addresses. Run `npm run import` first.");
  process.exit(1);
}

mkdirSync("qr", { recursive: true });

const cards = [];
for (const a of addresses) {
  const target = `${base}/menu?id=${a.id}`;
  /* 'M' tolerates ~15% damage — these live on walls and get scuffed */
  const { modules } = QRCode.create(target, { errorCorrectionLevel: "M" });
  const sticker = { house: a.place_name, room: String(a.room_number), code: a.id, modules };

  const slug = `${a.id}-room-${String(a.room_number).replace(/\W+/g, "")}`;
  const fontCss = await stickerFontCss(sticker.house + sticker.room + sticker.code);
  writeFileSync(`qr/${slug}.svg`, stickerSvg({ ...sticker, fontCss }));

  cards.push(`<div class="card">${stickerSvg({ ...sticker, width: "100%", height: "100%" })}</div>`);
  console.log(`  ${String(a.id).padStart(3)}  ${a.place_name} — room ${a.room_number}  ->  ${target}`);
}

/* Same sheet as the admin site's "Print QR stickers". */
writeFileSync(
  "qr/sheet.html",
  `<!doctype html><meta charset="utf-8"><title>QR stickers</title>
<link rel="stylesheet" href="${STICKER_FONTS_LINK}">
<style>${STICKER_SHEET_CSS}</style>
${cards.join("\n")}`,
);

console.log(`\n${addresses.length} QR code(s) written to qr/`);
console.log("Open qr/sheet.html and print it.");
