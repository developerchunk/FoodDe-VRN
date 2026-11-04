/**
 * Anonymous activity: what happens on the site, never who did it.
 *
 *   track("cart_add", { item: dish.id, value: dish.pricePaise })
 *
 * Each event carries a visit id this tab makes up (random, kept in
 * sessionStorage, gone when the tab closes), the route without its ids, the
 * room the guest scanned, and a coarse device class. Nothing else: no user id,
 * no phone, no email, no IP. The request goes out with the publishable key
 * alone -- deliberately not through the Supabase client, which would attach
 * the guest's session token -- so the database cannot tell who is signed in
 * even if it wanted to. Migration 0033 checks every field on the way in.
 *
 * Fire and forget. A lost event costs a number on the super admin's page;
 * an error here must never cost a guest their order.
 */
import { isConfigured } from "./supabase";

const URL_ = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const VISIT_KEY = "ird.visit.v1";
const ONCE_KEY = "ird.visitOnce.v1";
/* Only a "has been here before" flag, never an id: returning visitors can be
   counted without any visit being linked to another. */
const SEEN_KEY = "ird.seen.v1";
/* The stay utils/property holds for this tab; read here rather than imported
   so tracking never pulls the property module into a cycle. */
const STAY_KEY = "ird.stay.v1";

/* Staff and riders are not guests: their pages are never counted. */
const UNTRACKED = /^\/(admin|collect)(\/|$)/;

/* Developing locally must not fill the production numbers; the events are
   logged to the console instead, to check the wiring. */
const LOG_ONLY = import.meta.env.DEV;

const KNOWN_PAGES = new Set([
  "/", "/menu", "/cart", "/cart/coupons", "/orders", "/profile", "/about",
  "/terms", "/privacy", "/refunds", "/delivery", "/contact",
]);

/** The route, with any receipt token or room code taken out. */
export function pageOf(pathname) {
  if (pathname.startsWith("/order/")) return "/order";
  if (pathname.startsWith("/receipt/")) return "/receipt";
  if (pathname.startsWith("/pay/")) return "/pay";
  if (pathname.startsWith("/r/")) return "/menu";
  return KNOWN_PAGES.has(pathname) ? pathname : "/other";
}

const store = (s, fn) => {
  try {
    return fn(s);
  } catch {
    return null; /* private mode or storage blocked */
  }
};

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function device() {
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  if (!coarse) return "desktop";
  return Math.min(window.screen.width, window.screen.height) < 600 ? "phone" : "tablet";
}

const roomCode = () =>
  store(sessionStorage, (s) => JSON.parse(s.getItem(STAY_KEY))?.addressId) ?? undefined;

let visit = null;
let queue = [];
let timer = null;

function visitId() {
  if (visit) return visit;
  visit = store(sessionStorage, (s) => s.getItem(VISIT_KEY));
  if (visit) return visit;

  visit = uuid();
  store(sessionStorage, (s) => s.setItem(VISIT_KEY, visit));
  /* The start of a visit says how it began: whether this browser has been
     here before, whether it came in on a room's QR, and which site (only
     the site) sent it, if any. */
  const returning = Boolean(store(localStorage, (s) => s.getItem(SEEN_KEY)));
  store(localStorage, (s) => s.setItem(SEEN_KEY, "1"));
  let from;
  try {
    const ref = document.referrer && new window.URL(document.referrer).hostname;
    if (ref && ref !== window.location.hostname) from = ref.replace(/^www\./, "").slice(0, 60);
  } catch {
    /* no referrer */
  }
  const qr = new URLSearchParams(window.location.search).has("id") || /^\/r\//.test(window.location.pathname);
  enqueue("session_start", { returning, entry: qr ? "qr" : "direct", ...(from ? { from } : {}) });
  return visit;
}

function enqueue(name, { item, value, ...props }) {
  queue.push({
    n: name,
    p: pageOf(window.location.pathname),
    r: roomCode(),
    i: item || undefined,
    v: Number.isFinite(value) ? Math.round(value) : undefined,
    x: Object.keys(props).length ? props : undefined,
    t: Date.now(),
  });
}

function flush(leaving = false) {
  clearTimeout(timer);
  timer = null;
  if (!queue.length) return;
  const sid = visitId();
  const now = Date.now();
  const batch = queue.splice(0, 50).map(({ t, ...e }) => ({ ...e, ago: now - t }));

  if (LOG_ONLY) {
    console.debug("[track]", ...batch.map((e) => e.n), batch);
  } else {
    fetch(`${URL_}/rest/v1/rpc/track_events`, {
      method: "POST",
      /* keepalive lets the last events out as the tab closes */
      keepalive: leaving,
      headers: { apikey: KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ p_sid: sid, p_device: device(), p_events: batch }),
    }).catch(() => {});
  }
  if (queue.length) flush(leaving);
}

if (typeof window !== "undefined") {
  /* A tab being hidden is often the last chance: phones rarely fire unload. */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush(true);
  });
  window.addEventListener("pagehide", () => flush(true));
}

/**
 * Records one thing a guest did. `item` is a dish id, `value` an amount in
 * paise; anything else goes along as small details (keep them short, and
 * never put a name, number or address in them).
 */
export function track(name, details = {}) {
  if (!isConfigured || typeof window === "undefined") return;
  if (UNTRACKED.test(window.location.pathname)) return;
  try {
    visitId();
    enqueue(name, details);
    /* Gathered for a moment so a burst of taps is one request. A payment's
       outcome goes at once: the next thing may be a redirect. */
    if (name.startsWith("payment_") || name === "cod_confirmed") flush();
    else if (!timer) timer = setTimeout(flush, 2000);
  } catch {
    /* never let counting break the page */
  }
}

/** As track(), but at most once per visit for the same key. */
export function trackOnce(key, name, details) {
  const seen = store(sessionStorage, (s) => JSON.parse(s.getItem(ONCE_KEY))) ?? [];
  if (seen.includes(key)) return;
  store(sessionStorage, (s) => s.setItem(ONCE_KEY, JSON.stringify([...seen, key].slice(-50))));
  track(name, details);
}
