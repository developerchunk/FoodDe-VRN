/**
 * Printable QR codes, one per address, straight from Supabase.
 *
 *   node scripts/generate-qr.mjs
 *
 * Writes qr/<address_id>-<room>.svg plus qr/sheet.html — open that in a
 * browser and print it. Each label carries the rest house name and room number
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

const url = process.env.VITE_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const base = process.env.IRD_SITE_URL || "https://www.inroomdining.in";

if (!url || !secret) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SECRET_KEY — see scripts/import-addresses.mjs");
  process.exit(1);
}

const db = createClient(url, secret, { auth: { persistSession: false } });

const { data: addresses, error } = await db
  .from("addresses")
  .select("id, place_name, room_number, address")
  .eq("is_active", true)
  .order("id");

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
  const svg = await QRCode.toString(target, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });

  const slug = `${a.id}-room-${String(a.room_number).replace(/\W+/g, "")}`;
  writeFileSync(`qr/${slug}.svg`, svg);

  cards.push(`
    <article class="card">
      <div class="qr">${svg}</div>
      <h2>${escapeHtml(a.place_name)}</h2>
      <p class="room">Room ${escapeHtml(String(a.room_number))}</p>
      <p class="hint">Scan to order to your room</p>
      <p class="code">${a.id}</p>
    </article>`);
  console.log(`  ${String(a.id).padStart(3)}  ${a.place_name} — room ${a.room_number}  ->  ${target}`);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

writeFileSync(
  "qr/sheet.html",
  `<!doctype html><meta charset="utf-8"><title>IRD QR codes</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0;
         display: grid; grid-template-columns: repeat(2, 1fr); gap: 10mm; }
  .card { border: 1px dashed #bbb; border-radius: 6mm; padding: 8mm 6mm;
          text-align: center; break-inside: avoid; }
  .qr svg { width: 46mm; height: 46mm; }
  h2 { font-size: 13pt; margin: 4mm 0 1mm; color: #075b55; }
  .room { font-size: 18pt; font-weight: 700; margin: 0 0 2mm; color: #075b55; }
  .hint { font-size: 9pt; color: #666; margin: 0 0 3mm; }
  .code { font-size: 7pt; color: #aaa; letter-spacing: .12em; margin: 0; }
</style>
${cards.join("\n")}`,
);

console.log(`\n${addresses.length} QR code(s) written to qr/`);
console.log("Open qr/sheet.html and print it.");
