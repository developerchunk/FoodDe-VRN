/**
 * The room sticker: one SVG, drawn the same way by the admin site (PNG and the
 * print sheet) and by scripts/generate-qr.mjs, so a sticker looks the same
 * whichever way it was made. Plain strings and no DOM, so Node can run it.
 *
 * The layout is fixed on a 1024 x 1536 card (2 : 3). Only the QR, the house
 * name, the room and the room's code change from one sticker to the next.
 */

export const STICKER_W = 1024;
export const STICKER_H = 1536;

const C = {
  paper: "#f7f1e3",
  teal: "#075b55",
  tealDeep: "#04322f",
  gold: "#d99a2b",
  ember: "#d95f3f",
  goldDeep: "#b37c17",
  faint: "#8c9894",
};

const FONT_BODY = "Jost, ui-sans-serif, system-ui, -apple-system, sans-serif";
const FONT_DISPLAY = "Fraunces, 'Iowan Old Style', Georgia, serif";

/* Every fixed word on the card, so a font subset can carry just these glyphs
   plus whatever the house, room and code add. */
const FIXED_TEXT = "IRDIN ROOM DININGSCANORDERENJOYRoominroomdining.inGOOD FOODBETTER STAYS";

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* A QR's dark modules as one path, a run of modules per segment. */
function qrPath(modules) {
  const n = modules.size;
  let d = "";
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (!modules.get(y, x)) {
        x++;
        continue;
      }
      const start = x;
      while (x < n && modules.get(y, x)) x++;
      d += `M${start} ${y}h${x - start}v1h${start - x}z`;
    }
  }
  return d;
}

/* A leaf from base to tip, `w` wide at its middle, with its midrib. */
function leaf([bx, by], [tx, ty], w, bend = 1) {
  const mx = (bx + tx) / 2;
  const my = (by + ty) / 2;
  const len = Math.hypot(tx - bx, ty - by);
  const nx = (-(ty - by) / len) * w;
  const ny = ((tx - bx) / len) * w;
  const r = (v) => Math.round(v * 10) / 10;
  const outline = `M${bx} ${by}Q${r(mx + nx)} ${r(my + ny)} ${tx} ${ty}Q${r(mx - nx)} ${r(my - ny)} ${bx} ${by}`;
  const rx = bx + (tx - bx) * 0.72;
  const ry = by + (ty - by) * 0.72;
  const rib = `M${bx} ${by}Q${r(mx + nx * 0.18 * bend)} ${r(my + ny * 0.18 * bend)} ${r(rx)} ${r(ry)}`;
  return outline + rib;
}

/* Jost's widths, roughly: enough to shrink a long name before it runs off the
   card. A real measurement is not available outside a browser. */
const estWidth = (text, size, em = 0.5) => text.length * size * em;

/**
 * @param {object} o
 * @param {string} o.house    rest house name
 * @param {string} o.room     room number, as printed
 * @param {string} o.code     the room's opaque id (typed in when a camera will not scan)
 * @param {{size:number,get:(r:number,c:number)=>any}} o.modules  QRCode.create(url).modules
 * @param {string} [o.fontCss] @font-face rules to embed (see stickerFontCss)
 * @param {string|number} [o.width]  SVG width attribute, default 1024
 * @param {string|number} [o.height] SVG height attribute, default 1536
 */
export function stickerSvg({ house, room, code, modules, fontCss = "", width = STICKER_W, height = STICKER_H }) {
  const cx = STICKER_W / 2;

  /* the house name: shrinks to fit, then squeezes as a last resort */
  const nameMax = 820;
  let nameSize = 58;
  if (estWidth(house, nameSize) > nameMax) nameSize = Math.max(32, Math.floor(nameMax / (house.length * 0.5)));
  const nameSqueeze = estWidth(house, nameSize) > nameMax ? ` textLength="${nameMax}" lengthAdjust="spacingAndGlyphs"` : "";

  const roomText = `Room ${room}`;
  const roomMax = 640;
  let roomSize = 56;
  if (estWidth(roomText, roomSize, 0.52) > roomMax) roomSize = Math.max(40, Math.floor(roomMax / (roomText.length * 0.52)));
  const roomW = Math.min(roomMax, estWidth(roomText, roomSize, 0.52));
  const roomSqueeze =
    estWidth(roomText, roomSize, 0.52) > roomMax ? ` textLength="${roomMax}" lengthAdjust="spacingAndGlyphs"` : "";
  /* the gold rules either side of the room, as long as there is space for them */
  const ruleIn = cx - roomW / 2 - 42;
  const ruleOut = Math.max(150, ruleIn - 136);
  const roomRules =
    ruleIn - ruleOut >= 30
      ? `<path d="M${ruleOut} 1153H${ruleIn}M${STICKER_W - ruleIn} 1153H${STICKER_W - ruleOut}" stroke="${C.gold}" stroke-width="2.5"/>`
      : "";

  /* the QR, inside its gold frame, with the code under it */
  const qrSize = 450;
  const qrX = cx - qrSize / 2;
  const qrY = 514;
  const scale = qrSize / modules.size;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${STICKER_W} ${STICKER_H}">
<title>${esc(house)}, Room ${esc(room)}</title>
<defs>
<style>${fontCss}
.b{font-family:${FONT_BODY}}
.d{font-family:${FONT_DISPLAY}}
</style>
<linearGradient id="tl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d6c64"/><stop offset="1" stop-color="${C.teal}"/></linearGradient>
<linearGradient id="br" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${C.tealDeep}"/><stop offset="1" stop-color="${C.teal}"/></linearGradient>
</defs>
<rect width="${STICKER_W}" height="${STICKER_H}" fill="${C.paper}"/>

<path d="M0 0H263A439.3 439.3 0 0 0 0 247Z" fill="url(#tl)"/>
<path d="M263 0A439.3 439.3 0 0 0 0 247V253A580.4 580.4 0 0 1 273 0Z" fill="${C.gold}"/>
<path d="M1024 1220A648.2 648.2 0 0 1 655 1536H1024Z" fill="url(#br)"/>
<path d="M1024 1204A763.7 763.7 0 0 1 648 1536H655A648.2 648.2 0 0 0 1024 1220Z" fill="${C.gold}"/>
<rect x="19.5" y="19.5" width="985" height="1496" rx="22" fill="none" stroke="${C.gold}" stroke-width="2.5"/>

<g fill="none" stroke="${C.goldDeep}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
<path d="M34 1512Q48 1478 54 1442Q58 1420 62 1404"/>
<path d="${leaf([56, 1438], [69, 1320], 24)}"/>
<path d="${leaf([58, 1452], [161, 1358], 22, -1)}"/>
<path d="${leaf([42, 1494], [152, 1441], 20, -1)}"/>
</g>
<g fill="none" stroke="${C.gold}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
<path d="M960 1512Q956 1480 958 1462"/>
<path d="${leaf([957, 1478], [981, 1374], 22)}"/>
<path d="${leaf([951, 1496], [874, 1445], 20)}"/>
</g>

<g fill="${C.gold}">
<path d="M296 186C284 175 284 164 291 154C297 145 296 137 290 130C304 138 309 150 302 161C297 169 299 178 296 186Z"/>
<path d="M310 190C298 176 300 162 310 150C320 138 320 122 313 102C332 116 338 136 326 154C318 166 316 178 310 190Z"/>
<circle cx="275" cy="194" r="11"/>
<path d="M182 292A92.5 88 0 0 1 367 292Z"/>
<rect x="164" y="299" width="221" height="19" rx="9.5"/>
</g>
<path d="M206 286C209 252 228 228 256 216" fill="none" stroke="${C.paper}" stroke-width="9" stroke-linecap="round"/>
<rect x="413" y="133" width="6" height="185" rx="3" fill="${C.gold}"/>
<text class="d" x="456" y="264" font-size="190" font-weight="700" fill="${C.tealDeep}" letter-spacing="2">IRD</text>
<text class="b" x="463" y="325" font-size="40" font-weight="500" fill="${C.tealDeep}" textLength="411" lengthAdjust="spacing">IN ROOM DINING</text>

<path d="M48 408H130M908 408H976" stroke="${C.gold}" stroke-width="2.5"/>
<g class="b" font-size="48" font-weight="600">
<text x="153" y="427" fill="${C.tealDeep}" textLength="135" lengthAdjust="spacing">SCAN</text>
<text x="355" y="427" fill="${C.ember}" textLength="315" lengthAdjust="spacing">ORDER FOOD</text>
<text x="738" y="427" fill="${C.tealDeep}" textLength="152" lengthAdjust="spacing">ENJOY</text>
</g>
<circle cx="322" cy="409" r="6" fill="${C.gold}"/>
<circle cx="705" cy="409" r="6" fill="${C.gold}"/>

<rect x="242" y="469" width="540" height="540" rx="24" fill="#fff" stroke="${C.gold}" stroke-width="7"/>
<path transform="translate(${qrX} ${qrY}) scale(${scale})" d="${qrPath(modules)}" fill="#000" shape-rendering="crispEdges"/>
<text class="b" x="${cx}" y="988" font-size="20" font-weight="500" fill="${C.faint}" text-anchor="middle" letter-spacing="5">${esc(code)}</text>

<text class="b" x="${cx}" y="1096" font-size="${nameSize}" font-weight="600" fill="${C.tealDeep}" text-anchor="middle"${nameSqueeze}>${esc(house)}</text>
${roomRules}
<text class="b" x="${cx}" y="1172" font-size="${roomSize}" font-weight="600" fill="${C.tealDeep}" text-anchor="middle"${roomSqueeze}>${esc(roomText)}</text>

<g fill="none" stroke="${C.gold}" stroke-width="3.5">
<circle cx="335" cy="1247" r="31"/>
<ellipse cx="335" cy="1247" rx="14" ry="31"/>
<path d="M304 1247H366M309 1231H361M309 1263H361"/>
</g>
<path d="M397 1220V1276" stroke="${C.gold}" stroke-width="2.5"/>
<text class="b" x="425" y="1260" font-size="40" font-weight="400" fill="${C.tealDeep}" textLength="300" lengthAdjust="spacing">inroomdining.in</text>

<path d="M340 1358H455M570 1358H685" stroke="${C.gold}" stroke-width="2.5"/>
<g fill="none" stroke="${C.gold}" stroke-width="2.4" stroke-linejoin="round" transform="translate(512 1358) scale(1.3) translate(-512 -1350)">
<path d="M512 1333C500 1343 500 1358 512 1368C524 1358 524 1343 512 1333Z"/>
<path d="M508 1368C496 1366 487 1356 485 1345C498 1346 506 1354 508 1368Z"/>
<path d="M516 1368C528 1366 537 1356 539 1345C526 1346 518 1354 516 1368Z"/>
</g>

<g class="b" font-size="21" font-weight="500" fill="${C.tealDeep}">
<text x="282" y="1424" textLength="185" lengthAdjust="spacing">GOOD FOOD</text>
<text x="531" y="1424" textLength="213" lengthAdjust="spacing">BETTER STAYS</text>
</g>
<circle cx="498" cy="1416" r="4" fill="${C.gold}"/>
</svg>`;
}

/**
 * The card's fonts as embedded @font-face rules, subset by Google to just the
 * glyphs this sticker uses. An SVG drawn as an image (the PNG) or opened as a
 * file cannot reach the page's fonts, so they travel inside it.
 */
export async function stickerFontCss(extraText = "") {
  const text = encodeURIComponent([...new Set(FIXED_TEXT + extraText)].join(""));
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@36,700&family=Jost:wght@400;500;600&text=${text}`,
  ).then((r) => {
    if (!r.ok) throw new Error(`fonts ${r.status}`);
    return r.text();
  });
  const urls = [...new Set([...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]))];
  let out = css;
  for (const url of urls) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`font ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const type = res.headers.get("content-type") || "font/woff2";
    out = out.split(url).join(`data:${type};base64,${btoa(bin)}`);
  }
  return out;
}

/* The same fonts for an HTML page of stickers, where a stylesheet link does. */
export const STICKER_FONTS_LINK =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@36,700&family=Jost:wght@400;500;600&display=block";

/* An A4 page of stickers, four to a page at 88 x 132 mm, colours printed as
   drawn rather than dropped as "background". */
export const STICKER_SHEET_CSS = `
  @page { size: A4; margin: 12mm; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; display: grid; grid-template-columns: repeat(2, 88mm);
         gap: 9mm 10mm; justify-content: center; }
  .card { width: 88mm; height: 132mm; break-inside: avoid; }
  .card svg { display: block; }
`;
