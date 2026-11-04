import { useMemo, useState } from "react";
import { loadActivity, loadActivityLog } from "../api";
import { LoadState, PageHead } from "../ui";
import { useLoad, useNotice } from "../helpers";
import { Columns, Table, Tile } from "./charts";
import { IST, int, mins, money, n0, pct } from "./chartFormat";
import "./activity.css";

/**
 * What guests do on the site, from scanning a room's QR to paying, for any
 * stretch of time. Everything comes from admin_activity() and
 * admin_activity_log() (migration 0033), which only a super admin may call.
 *
 * Anonymous throughout: a "visit" is one browser tab, identified by a random
 * id the tab made up and forgot when it closed. Nothing here can lead from a
 * visit to a guest, a phone number or an order, and nothing should be added
 * that tries to.
 *
 * Read only. Nothing on this page changes anything.
 */

// ---------------------------------------------------------------- IST dates
/* Dates are handled as "YYYY-MM-DD" strings of the Vrindavan calendar and
   turned into instants only at the edge, so the browser's own time zone
   never moves a boundary. */
const ymdOf = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const at = (ymd, hm = "00:00") => new Date(`${ymd}T${hm}:00+05:30`);
const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const addMonths = (ym, n) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};
const mondayOf = (ymd) => addDays(ymd, -((new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7));
const DAY = 86_400_000;

const dayLabel = (ymd) =>
  at(ymd).toLocaleDateString("en-IN", { timeZone: IST, weekday: "short", day: "numeric", month: "short", year: "numeric" });
const monthLabel = (ym) =>
  at(`${ym}-01`).toLocaleDateString("en-IN", { timeZone: IST, month: "long", year: "numeric" });
const stamp = (iso) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: IST, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

const PRESETS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "12m", label: "12 months" },
  { id: "day", label: "A day…" },
  { id: "pickmonth", label: "A month…" },
  { id: "custom", label: "Custom…" },
];

/** The window a preset means right now, the one it is compared with, and
    words for both. */
function rangeFor(c) {
  const today = ymdOf();
  const now = new Date();
  switch (c.preset) {
    case "today":
      return {
        from: at(today), to: at(addDays(today, 1)),
        prevFrom: at(addDays(today, -1)), prevTo: new Date(now - DAY),
        label: "Today", prev: "yesterday up to this time",
      };
    case "yesterday":
      return {
        from: at(addDays(today, -1)), to: at(today),
        label: `Yesterday, ${dayLabel(addDays(today, -1))}`, prev: "the day before",
      };
    case "7d":
      return { from: at(addDays(today, -6)), to: at(addDays(today, 1)), label: "Last 7 days", prev: "the 7 days before" };
    case "30d":
      return { from: at(addDays(today, -29)), to: at(addDays(today, 1)), label: "Last 30 days", prev: "the 30 days before" };
    case "week": {
      const from = at(mondayOf(today));
      return {
        from, to: at(addDays(today, 1)),
        prevFrom: new Date(from - 7 * DAY), prevTo: new Date(now - 7 * DAY),
        label: "This week", prev: "the same days last week",
      };
    }
    case "month": {
      const ym = today.slice(0, 7);
      const from = at(`${ym}-01`);
      const prevFrom = at(`${addMonths(ym, -1)}-01`);
      return {
        from, to: at(addDays(today, 1)),
        prevFrom, prevTo: new Date(Math.min(+prevFrom + (now - from), +from)),
        label: monthLabel(ym), prev: "the same days last month",
      };
    }
    case "12m": {
      const ym = addMonths(today.slice(0, 7), -11);
      return { from: at(`${ym}-01`), to: at(addDays(today, 1)), label: "Last 12 months", prev: "the 12 months before" };
    }
    case "day": {
      const d = c.day || today;
      return { from: at(d), to: at(addDays(d, 1)), label: dayLabel(d), prev: "the day before" };
    }
    case "pickmonth": {
      const ym = c.month || today.slice(0, 7);
      return {
        from: at(`${ym}-01`), to: at(`${addMonths(ym, 1)}-01`),
        prevFrom: at(`${addMonths(ym, -1)}-01`), prevTo: at(`${ym}-01`),
        label: monthLabel(ym), prev: monthLabel(addMonths(ym, -1)),
      };
    }
    default: {
      const [fd, ft] = (c.from || `${today}T00:00`).split("T");
      const [td, tt] = (c.to || `${addDays(today, 1)}T00:00`).split("T");
      const from = at(fd, ft || "00:00");
      const to = at(td, tt || "00:00");
      return { from, to, label: `${stamp(from)} – ${stamp(to)}`, prev: "the same length of time before" };
    }
  }
}

const UNITS = [
  { id: "hour", label: "By hour", ms: 3_600_000 },
  { id: "day", label: "By day", ms: DAY },
  { id: "week", label: "By week", ms: 7 * DAY },
  { id: "month", label: "By month", ms: 30 * DAY },
];
const autoUnit = (span) => (span <= 2 * DAY ? "hour" : span <= 62 * DAY ? "day" : span <= 190 * DAY ? "week" : "month");

/* Parts of the day, as guests in a rest house live it. */
const HOURS = [
  { id: "all", label: "All day", from: 0, to: 24 },
  { id: "breakfast", label: "Morning 6–11", from: 6, to: 11 },
  { id: "lunch", label: "Lunch 11–4", from: 11, to: 16 },
  { id: "evening", label: "Evening 4–7", from: 16, to: 19 },
  { id: "dinner", label: "Dinner 7–11", from: 19, to: 23 },
  { id: "late", label: "Late night 11–6", from: 23, to: 6 },
  { id: "custom", label: "Chosen hours…" },
];
const hourName = (h) => (h === 0 || h === 24 ? "12 am" : h === 12 ? "12 pm" : h < 12 ? `${h} am` : `${h - 12} pm`);

// ------------------------------------------------------------------- labels
const EVENT_LABEL = {
  session_start: "Visit started",
  page_view: "Opened a page",
  qr_scan: "Scanned a room",
  qr_invalid: "Unknown room code",
  room_needed: "Tried to pay without a room",
  dish_view: "Opened a dish",
  menu_search: "Searched the menu",
  cart_add: "Added to cart",
  cart_remove: "Removed from cart",
  coupon_apply: "Tried a coupon",
  checkout_view: "Reached checkout",
  checkout_submit: "Tapped pay",
  order_placed: "Order created",
  order_error: "Order refused",
  payment_open: "Payment window opened",
  payment_success: "Payment succeeded",
  payment_failed: "Payment failed",
  payment_dismissed: "Closed the payment window",
  payment_unverified: "Payment not yet confirmed",
  payment_error: "Payment could not start",
  payment_timeout: "Payment timed out",
  cod_confirmed: "Cash on delivery confirmed",
};
const PAGE_LABEL = {
  "/": "Home", "/menu": "Menu", "/cart": "Checkout", "/cart/coupons": "Coupons",
  "/order": "Order status", "/pay": "Pay link", "/receipt": "Receipt", "/orders": "My orders",
  "/profile": "Profile", "/about": "About us", "/terms": "Terms", "/privacy": "Privacy",
  "/refunds": "Refunds", "/delivery": "Delivery", "/contact": "Contact", "/other": "Other",
};
const METHOD_LABEL = { online: "Pay online", cod: "Cash on delivery", camera: "Camera", typed: "Typed code", link: "QR link" };

/** The small details an event carries, in words. */
function details(e) {
  const p = e.props ?? {};
  const out = [];
  if (p.method) out.push(METHOD_LABEL[p.method] ?? p.method);
  if (p.q) out.push(`“${p.q}” · ${int(p.results)} found`);
  if (p.code) out.push(p.code);
  if (p.reason) out.push(p.reason);
  if (e.name === "cart_remove" && n0(p.qty) > 1) out.push(`${p.qty} removed`);
  if (e.name === "session_start") {
    out.push(p.returning ? "returning" : "first visit");
    out.push(p.entry === "qr" ? "came in on a QR" : "came in directly");
    if (p.from) out.push(`from ${p.from}`);
  }
  if (p.items != null && !Array.isArray(p.items)) out.push(`${p.items} item(s)`);
  if (Array.isArray(p.items)) out.push(`${p.items.length} dish(es)`);
  return out.join(" · ");
}

// ---------------------------------------------------------------- the parts
/** Visits reaching each step, as bars of one hue: the drop between steps is
    the thing to read. */
function Funnel({ steps }) {
  const top = Math.max(1, n0(steps[0]?.n));
  return (
    <ol className="adm-act-funnel">
      {steps.map((s, i) => {
        const prev = i ? n0(steps[i - 1].n) : null;
        return (
          <li key={s.label}>
            <span className="adm-act-funnel__label">{s.label}</span>
            <span className="adm-act-funnel__track" aria-hidden="true">
              <span className="adm-act-funnel__bar" style={{ width: `${(n0(s.n) / top) * 100}%` }} />
            </span>
            <strong className="adm-act-funnel__n">{int(s.n)}</strong>
            <span className="adm-act-funnel__pct">
              {pct(s.n, top)} of visits
              {/* steps can be skipped, so a step may outnumber the one before */}
              {prev != null && prev > 0 && n0(s.n) <= prev && <> · {pct(s.n, prev)} of the step before</>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Day of the week by hour of the day: one teal, darker for busier. */
function Heatmap({ cells }) {
  const [hover, setHover] = useState(null);
  const grid = useMemo(() => {
    const g = {};
    for (const c of cells) g[`${c.d}-${c.h}`] = c;
    return g;
  }, [cells]);
  const max = Math.max(1, ...cells.map((c) => n0(c.visits)));
  const shown = hover && grid[hover];
  const [hd, hh] = hover ? hover.split("-").map(Number) : [];

  return (
    <figure className="adm-an-chart adm-act-heat">
      <figcaption>When guests visit</figcaption>
      <div className="adm-act-heat__scroll">
        <div className="adm-act-heat__grid" role="group" aria-label="Visits by day of the week and hour of the day">
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="adm-act-heat__hour">
              {h % 3 === 0 ? hourName(h).replace(" ", "") : ""}
            </span>
          ))}
          {DAYS.map((name, di) => (
            <div key={name} className="adm-act-heat__row">
              <span className="adm-act-heat__day">{name}</span>
              {Array.from({ length: 24 }, (_, h) => {
                const key = `${di + 1}-${h}`;
                const v = n0(grid[key]?.visits);
                return (
                  <span
                    key={key}
                    className={`adm-act-heat__cell ${hover === key ? "is-hover" : ""}`}
                    style={{ "--a": v ? 0.12 + 0.88 * (v / max) : 0 }}
                    tabIndex={0}
                    onMouseEnter={() => setHover(key)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(key)}
                    onBlur={() => setHover(null)}
                    aria-label={`${name} ${hourName(h)}: ${int(v)} visits`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="adm-act-heat__read" role="status">
        {hover
          ? `${DAYS[hd - 1]}, ${hourName(hh)}–${hourName(hh + 1)}: ${int(shown?.visits)} visit(s), ${int(shown?.bought)} paid or confirmed`
          : `Darkest is the busiest hour: ${int(max)} visit(s). Hover or focus a square for its numbers.`}
      </p>
    </figure>
  );
}

function Rank({ now, prev }) {
  if (prev == null) return null;
  const d = n0(now) - n0(prev);
  if (!d) return null;
  return <small className={d > 0 ? "adm-act-up" : "adm-act-down"}>{d > 0 ? "▲" : "▼"} {int(Math.abs(d))} vs before</small>;
}

function csv(rows) {
  const cols = ["time", "event", "accommodation_partner", "room", "dish", "amount_rupees", "page", "device", "visit", "details"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((e) =>
    [
      new Date(e.at).toLocaleString("en-IN", { timeZone: IST }),
      EVENT_LABEL[e.name] ?? e.name,
      e.place, e.room, e.item,
      e.value_paise == null ? "" : (e.value_paise / 100).toFixed(2),
      PAGE_LABEL[e.page] ?? e.page, e.device, String(e.sid).slice(0, 8), details(e),
    ].map(esc).join(","),
  );
  return [cols.join(","), ...lines].join("\n");
}

/** Every event in the range, newest first: the history, a page at a time. */
function ActivityLog({ range }) {
  const notify = useNotice();
  const [name, setName] = useState("");
  const [sid, setSid] = useState(null);
  const [more, setMore] = useState([]);
  const [end, setEnd] = useState(false);
  const [busy, setBusy] = useState(false);
  const args = { from: range.from.toISOString(), to: range.to.toISOString(), name, sid };
  const key = JSON.stringify(args);
  const { data, error, loading, reload } = useLoad(async () => {
    setMore([]);
    const first = await loadActivityLog({ ...args, limit: 100 });
    setEnd(first.length < 100);
    return first;
  }, [key]);
  const rows = [...(data ?? []), ...more];

  async function loadMore() {
    setBusy(true);
    try {
      const next = await loadActivityLog({ ...args, before: rows[rows.length - 1]?.id, limit: 100 });
      setMore((m) => [...m, ...next]);
      setEnd(next.length < 100);
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    setBusy(true);
    try {
      const all = await loadActivityLog({ ...args, limit: 5000 });
      const url = URL.createObjectURL(new Blob([csv(all)], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `activity-${ymdOf(range.from)}-to-${ymdOf(new Date(range.to - 1))}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      if (all.length === 5000) notify("Downloaded the newest 5,000 events. Choose a shorter range for the rest.");
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="adm-an-section">
      <h2>History</h2>
      <p className="adm-muted">
        Every event in this range, newest first. A visit is one browser tab; follow one to see its whole journey.
      </p>
      <div className="adm-toolbar">
        <select className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Kind of event">
          <option value="">Every kind of event</option>
          {Object.entries(EVENT_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        {sid && (
          <button type="button" className="btn btn-ghost adm-btn-sm" onClick={() => setSid(null)}>
            Visit {sid.slice(0, 8)} ✕
          </button>
        )}
        <button type="button" className="btn btn-ghost adm-btn-sm" onClick={download} disabled={busy}>
          Download CSV
        </button>
      </div>
      <LoadState loading={loading && !data} error={error} onRetry={reload} empty={data && !rows.length} emptyText="Nothing happened in this range." />
      {rows.length > 0 && (
        <div className="adm-table-wrap">
          <table className="adm-table adm-act-log">
            <thead>
              <tr>
                <th>When</th>
                <th>What</th>
                <th>Where</th>
                <th>Details</th>
                <th>Visit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="adm-cell-main">
                    <strong>{stamp(e.at)}</strong>
                    <small>{e.device ?? ""}</small>
                  </td>
                  <td data-label="What">
                    {EVENT_LABEL[e.name] ?? e.name}
                    {e.item && <small>{e.item}</small>}
                    {e.value_paise != null && <small>{money(e.value_paise)}</small>}
                  </td>
                  <td data-label="Where">
                    {e.place ? `${e.place} · Room ${e.room}` : "No room yet"}
                    <small>{PAGE_LABEL[e.page] ?? e.page ?? ""}</small>
                  </td>
                  <td data-label="Details">{details(e) || "—"}</td>
                  <td data-label="Visit">
                    <button
                      type="button"
                      className="adm-act-visit"
                      onClick={() => setSid(e.sid)}
                      title="Show only this visit"
                    >
                      {String(e.sid).slice(0, 8)}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && !end && (
        <button type="button" className="btn btn-ghost adm-btn-sm adm-an-more" onClick={loadMore} disabled={busy}>
          {busy ? "Loading…" : "Show older"}
        </button>
      )}
    </section>
  );
}

// --------------------------------------------------------------------- page
export default function ActivityPage() {
  const [c, setC] = useState({ preset: "today", unit: "auto", hours: "all", hFrom: 19, hTo: 23 });
  /* Bumped by Refresh: "today" and "this week" end at now, so they must be
     worked out again, not just fetched again. */
  const [tick, setTick] = useState(0);
  const set = (patch) => setC((s) => ({ ...s, ...patch }));

  const range = useMemo(() => rangeFor(c), [c, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const span = range.to - range.from;
  const bad = !(span > 0);
  const unit = c.unit === "auto" ? autoUnit(span) : c.unit;
  const tooMany = span / UNITS.find((u) => u.id === unit).ms > 1000;
  const hours = HOURS.find((h) => h.id === c.hours);
  const [hourFrom, hourTo] = c.hours === "custom" ? [c.hFrom, c.hTo] : [hours.from, hours.to];

  const params = {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    prevFrom: range.prevFrom?.toISOString(),
    prevTo: range.prevTo?.toISOString(),
    unit,
    hourFrom,
    hourTo,
  };
  const key = JSON.stringify(params);
  const { data: a, error, loading, reload } = useLoad(
    () => (bad || tooMany ? Promise.resolve(null) : loadActivity(params)),
    [key],
  );

  const now = a?.kpis?.now ?? {};
  const prev = a?.kpis?.prev ?? null;
  const hoursText = hourFrom === hourTo || (hourFrom === 0 && hourTo === 24) ? "all day" : `${hourName(hourFrom)}–${hourName(hourTo)} only`;
  const items = useMemo(() => a?.items ?? [], [a]);
  const leftBehind = useMemo(
    () => items.filter((i) => n0(i.not_ordered_visits) > 0).sort((x, y) => n0(y.not_ordered_visits) - n0(x.not_ordered_visits)),
    [items],
  );
  const pay = a?.payments ?? {};
  const outcomes = pay.outcomes ?? {};

  return (
    <>
      <PageHead
        title="Activity"
        sub={`${range.label} · ${hoursText} · Vrindavan time · compared with ${range.prev}`}
      >
        <button
          type="button"
          className="btn btn-ghost adm-btn-sm"
          onClick={() => (c.preset === "today" || c.preset === "week" || c.preset === "month" ? setTick((t) => t + 1) : reload())}
          disabled={loading}
        >
          {loading && a ? "Refreshing…" : "Refresh"}
        </button>
      </PageHead>

      <p className="adm-act-privacy">
        Anonymous: a visit is one browser tab with a random id that is forgotten when the tab closes. Nothing here is
        linked to a guest’s name, number, email, sign-in or order.
      </p>

      <div className="adm-act-controls">
        <div className="adm-an-periods adm-act-presets" role="tablist" aria-label="Time range">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={c.preset === p.id}
              className={c.preset === p.id ? "is-on" : ""}
              onClick={() => set({ preset: p.id })}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="adm-act-row">
          {c.preset === "day" && (
            <label className="adm-act-ctl">
              <span>Day</span>
              <input className="input" type="date" max={ymdOf()} value={c.day ?? ymdOf()} onChange={(e) => set({ day: e.target.value })} />
            </label>
          )}
          {c.preset === "pickmonth" && (
            <label className="adm-act-ctl">
              <span>Month</span>
              <input className="input" type="month" max={ymdOf().slice(0, 7)} value={c.month ?? ymdOf().slice(0, 7)} onChange={(e) => set({ month: e.target.value })} />
            </label>
          )}
          {c.preset === "custom" && (
            <>
              <label className="adm-act-ctl">
                <span>From</span>
                <input className="input" type="datetime-local" value={c.from ?? `${ymdOf()}T00:00`} onChange={(e) => set({ from: e.target.value })} />
              </label>
              <label className="adm-act-ctl">
                <span>To</span>
                <input className="input" type="datetime-local" value={c.to ?? `${addDays(ymdOf(), 1)}T00:00`} onChange={(e) => set({ to: e.target.value })} />
              </label>
            </>
          )}
          <label className="adm-act-ctl">
            <span>Group</span>
            <select className="input" value={c.unit} onChange={(e) => set({ unit: e.target.value })}>
              <option value="auto">Automatically ({UNITS.find((u) => u.id === autoUnit(span))?.label.toLowerCase()})</option>
              {UNITS.map((u) => (
                <option key={u.id} value={u.id} disabled={span / u.ms > 1000}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
          <label className="adm-act-ctl">
            <span>Hours</span>
            <select className="input" value={c.hours} onChange={(e) => set({ hours: e.target.value })}>
              {HOURS.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.label}
                </option>
              ))}
            </select>
          </label>
          {c.hours === "custom" && (
            <>
              <label className="adm-act-ctl">
                <span>From</span>
                <select className="input" value={c.hFrom} onChange={(e) => set({ hFrom: Number(e.target.value) })}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {hourName(h)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="adm-act-ctl">
                <span>To</span>
                <select className="input" value={c.hTo} onChange={(e) => set({ hTo: Number(e.target.value) })}>
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                    <option key={h} value={h}>
                      {hourName(h)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
      </div>

      {bad && <p className="adm-state adm-state--error">The end of the range must be after its start.</p>}
      {tooMany && !bad && <p className="adm-state adm-state--error">That is too many points to draw. Group by a longer step.</p>}
      <LoadState loading={loading && !a} error={error} onRetry={reload} />

      {a && (
        <div className={loading ? "adm-an is-stale" : "adm-an"}>
          <div className="adm-an-tiles">
            <Tile label="Visits" value={int(now.visits)} now={now.visits} prev={prev?.visits} foot={`${pct(now.returning, now.visits)} returning`} />
            <Tile label="Room scans" value={int(now.scanned)} now={now.scanned} prev={prev?.scanned} foot={`${int(now.rooms)} room(s) · ${int(now.places)} partner(s)`} />
            <Tile label="Added to cart" value={int(now.added)} now={now.added} prev={prev?.added} foot={`${int(now.adds)} dishes added`} />
            <Tile label="Reached checkout" value={int(now.checkout)} now={now.checkout} prev={prev?.checkout} foot="visits" />
            <Tile label="Tapped pay" value={int(now.submitted)} now={now.submitted} prev={prev?.submitted} foot="visits" />
            <Tile label="Paid or confirmed" value={int(now.bought)} now={now.bought} prev={prev?.bought} foot={`${pct(now.bought, now.visits)} of visits`} />
            <Tile
              label="Left at checkout"
              value={int(now.checkouts_abandoned)}
              now={now.checkouts_abandoned}
              prev={prev?.checkouts_abandoned}
              invert
              foot={`${money(now.abandoned_value_paise)} in carts`}
            />
            <Tile label="Payments failed" value={int(now.payments_failed)} now={now.payments_failed} prev={prev?.payments_failed} invert foot={`of ${int(now.payments_opened)} opened`} />
            <Tile label="Carts left behind" value={int(now.carts_abandoned)} now={now.carts_abandoned} prev={prev?.carts_abandoned} invert foot="added, never paid" />
            <Tile label="Time to order" value={mins(now.mins_to_order)} foot="median, first tap → paid" />
            <Tile label="Dishes removed" value={int(now.removes)} now={now.removes} prev={prev?.removes} invert foot={`${int(now.removes_at_checkout)} at checkout`} />
            <Tile label="Unknown codes" value={int(now.bad_scans)} invert foot="QR or typed codes we did not know" />
          </div>

          <section className="adm-an-section">
            <h2>From scan to payment</h2>
            <p className="adm-muted">How many visits reached each step. A visit can skip a step, such as browsing without scanning.</p>
            <Funnel
              steps={[
                { label: "Visited", n: now.visits },
                { label: "Opened the menu", n: now.saw_menu },
                { label: "Scanned a room", n: now.scanned },
                { label: "Added to cart", n: now.added },
                { label: "Reached checkout", n: now.checkout },
                { label: "Tapped pay", n: now.submitted },
                { label: "Paid or confirmed", n: now.bought },
              ]}
            />
          </section>

          <div className="adm-an-charts">
            <Columns title="Visits" series={a.series ?? []} unit={a.unit} valueOf={(b) => n0(b.visits)} format={int} integer />
            <Columns title="Room scans" series={a.series ?? []} unit={a.unit} valueOf={(b) => n0(b.scans)} format={int} integer />
            <Columns title="Visits that added to cart" series={a.series ?? []} unit={a.unit} valueOf={(b) => n0(b.added)} format={int} integer />
            <Columns title="Visits that paid or confirmed" series={a.series ?? []} unit={a.unit} valueOf={(b) => n0(b.bought)} format={int} integer />
          </div>

          <div className="adm-an-charts">
            <Heatmap cells={a.heat ?? []} />
          </div>

          <Table
            title="Accommodation Partners"
            sub="Ranked by visits that scanned one of their rooms. Hidden rows had no activity."
            empty="No activity at any accommodation partner in this range."
            rows={(a.places ?? []).filter((p) => n0(p.visits) || n0(p.prev_scans)).map((p, i) => ({ ...p, rank: i + 1 }))}
            columns={[
              {
                label: "Accommodation Partner",
                cell: (p) => (
                  <>
                    <strong>{`${p.rank}. ${p.name}`}</strong>
                    <small>{p.area || "—"}</small>
                  </>
                ),
              },
              { label: "Scans", num: true, cell: (p) => <>{int(p.scans)}<Rank now={p.scans} prev={p.prev_scans} /></> },
              { label: "Visits", num: true, cell: (p) => int(p.visits) },
              { label: "Rooms active", num: true, cell: (p) => `${int(p.rooms_active)} of ${int(p.rooms)}` },
              { label: "Added", num: true, cell: (p) => int(p.added) },
              { label: "Checkout", num: true, cell: (p) => int(p.checkout) },
              { label: "Paid", num: true, cell: (p) => int(p.bought) },
              { label: "Converts", num: true, cell: (p) => pct(p.bought, p.visits) },
              { label: "Last seen", num: true, cell: (p) => (p.last_seen ? stamp(p.last_seen) : "—") },
            ]}
          />

          <Table
            title="Rooms"
            sub="The 30 most active rooms."
            empty="No room was scanned in this range."
            limit={10}
            rows={(a.rooms ?? []).map((r, i) => ({ ...r, rank: i + 1 }))}
            columns={[
              { label: "Room", cell: (r) => <><strong>{`${r.rank}. ${r.place} · Room ${r.room_number}`}</strong></> },
              { label: "Scans", num: true, cell: (r) => int(r.scans) },
              { label: "Visits", num: true, cell: (r) => int(r.visits) },
              { label: "Added", num: true, cell: (r) => int(r.added) },
              { label: "Checkout", num: true, cell: (r) => int(r.checkout) },
              { label: "Paid", num: true, cell: (r) => int(r.bought) },
              { label: "Last seen", num: true, cell: (r) => stamp(r.last_seen) },
            ]}
          />

          <Table
            title="Dishes"
            sub="Opened, added, and whether the visit that added it then paid for it. Most added first."
            empty="No dish was opened or added in this range."
            limit={12}
            rows={items}
            columns={[
              {
                label: "Dish",
                cell: (d) => (
                  <>
                    <strong>{d.name}</strong>
                    <small>
                      {d.kitchen}
                      {d.is_available ? "" : " · off the menu"}
                    </small>
                  </>
                ),
              },
              { label: "Opened", num: true, cell: (d) => int(d.views) },
              { label: "Added", num: true, cell: (d) => int(d.adds) },
              { label: "Opened → added", num: true, cell: (d) => (n0(d.views) ? pct(Math.min(n0(d.add_visits), n0(d.views)), d.views) : "—") },
              { label: "Ordered", num: true, cell: (d) => int(d.ordered_visits) },
              { label: "Not ordered", num: true, cell: (d) => int(d.not_ordered_visits) },
              { label: "Removed", num: true, cell: (d) => `${int(d.removes)} · ${int(d.removes_at_checkout)} at checkout` },
            ]}
          />

          <Table
            title="Added but not ordered"
            sub="Dishes most often put in a cart by a visit that never paid for them."
            empty="Every dish added in this range was paid for."
            limit={10}
            rows={leftBehind}
            columns={[
              { label: "Dish", cell: (d) => <><strong>{d.name}</strong><small>{d.kitchen}</small></> },
              { label: "Visits", num: true, cell: (d) => int(d.not_ordered_visits) },
              { label: "Of all that added it", num: true, cell: (d) => pct(d.not_ordered_visits, d.add_visits) },
            ]}
          />

          <section className="adm-an-section">
            <h2>Payments</h2>
            <p className="adm-muted">Every attempt to pay, and how it ended.</p>
            <div className="adm-an-tiles">
              <Tile label="Chose pay online" value={int(pay.methods?.online)} />
              <Tile label="Chose cash on delivery" value={int(pay.methods?.cod)} foot={`${int(outcomes.cod_confirmed)} confirmed`} />
              <Tile label="Window opened" value={int(outcomes.payment_open)} />
              <Tile label="Succeeded" value={int(outcomes.payment_success)} foot={pct(outcomes.payment_success, outcomes.payment_open) + " of opened"} />
              <Tile label="Failed" value={int(outcomes.payment_failed)} />
              <Tile label="Closed by guest" value={int(outcomes.payment_dismissed)} />
              <Tile label="Timed out" value={int(outcomes.payment_timeout)} />
              <Tile label="Not yet confirmed" value={int(outcomes.payment_unverified)} foot="settled later by Razorpay" />
              <Tile label="Could not start" value={int(outcomes.payment_error)} />
              <Tile label="Order refused" value={int(outcomes.order_error)} foot="before any payment" />
            </div>
          </section>

          <Table
            title="Why payments and orders failed"
            empty="Nothing failed in this range."
            rows={pay.reasons ?? []}
            columns={[
              { label: "Reason", cell: (r) => <strong>{r.reason}</strong> },
              { label: "Where", cell: (r) => EVENT_LABEL[r.name] ?? r.name },
              { label: "Times", num: true, cell: (r) => int(r.n) },
            ]}
          />

          <div className="adm-act-pair">
            <Table
              title="Menu searches"
              sub="What guests typed, and how often nothing matched."
              empty="Nobody searched in this range."
              limit={10}
              rows={a.searches ?? []}
              columns={[
                { label: "Search", cell: (s) => <strong>“{s.q}”</strong> },
                { label: "Times", num: true, cell: (s) => int(s.n) },
                { label: "Nothing found", num: true, cell: (s) => int(s.empty) },
              ]}
            />
            <Table
              title="Pages"
              empty="No pages were opened in this range."
              rows={a.pages ?? []}
              columns={[
                { label: "Page", cell: (p) => <strong>{PAGE_LABEL[p.page] ?? p.page}</strong> },
                { label: "Views", num: true, cell: (p) => int(p.views) },
                { label: "Visits", num: true, cell: (p) => int(p.visits) },
              ]}
            />
            <Table
              title="Devices"
              empty="No visits in this range."
              rows={Object.entries(a.devices ?? {}).map(([d, n]) => ({ id: d, d, n })).sort((x, y) => y.n - x.n)}
              columns={[
                { label: "Device", cell: (r) => <strong>{r.d[0].toUpperCase() + r.d.slice(1)}</strong> },
                { label: "Visits", num: true, cell: (r) => `${int(r.n)} · ${pct(r.n, now.visits)}` },
              ]}
            />
            <Table
              title="Where visits came from"
              sub="The site that linked here, if any. A scanned QR counts as direct."
              empty="No visits started in this range."
              rows={a.sources ?? []}
              columns={[
                { label: "From", cell: (s) => <strong>{s.from === "direct" ? "Direct or QR" : s.from}</strong> },
                { label: "Visits", num: true, cell: (s) => int(s.n) },
              ]}
            />
            <Table
              title="Coupons tried"
              empty="No coupon was typed in this range."
              rows={a.coupons ?? []}
              columns={[
                { label: "Code", cell: (c2) => <strong className="adm-mono">{c2.code}</strong> },
                { label: "Times", num: true, cell: (c2) => int(c2.n) },
              ]}
            />
          </div>
        </div>
      )}

      {!bad && <ActivityLog range={range} />}
    </>
  );
}
