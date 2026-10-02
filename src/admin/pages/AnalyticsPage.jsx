import { useEffect, useMemo, useRef, useState } from "react";
import { loadAnalytics } from "../api";
import { Badge, LoadState, PageHead } from "../ui";
import { STATUS_LABEL, useLoad } from "../helpers";
import { rupees } from "../../utils/format";
import "./analytics.css";

/**
 * The super admin's view of the business. Everything comes from one call,
 * admin_analytics() (migration 0020), which works in IST and returns the
 * period and the one before it, so each headline can say which way it moved.
 *
 * Read only. Nothing on this page changes anything.
 */

const PERIODS = [
  { id: "today", label: "Today", prev: "yesterday" },
  { id: "daily", label: "Daily", prev: "the 30 days before", span: "Last 30 days, by day" },
  { id: "weekly", label: "Weekly", prev: "the 12 weeks before", span: "Last 12 weeks, by week" },
  { id: "monthly", label: "Monthly", prev: "the 12 months before", span: "Last 12 months, by month" },
];

const IST = "Asia/Kolkata";
const n0 = (v) => Number(v ?? 0);
const int = (v) => n0(v).toLocaleString("en-IN");
/* Analytics round to the rupee: a headline of ₹1,24,503.47 is noise. */
const money = (paise) => "₹" + Math.round(n0(paise) / 100).toLocaleString("en-IN");
const mins = (v) => (v == null ? "—" : `${Number(v).toLocaleString("en-IN")} min`);
const pct = (num, den) => (den ? `${Math.round((num / den) * 100)}%` : "—");

function bucketLabel(iso, unit, long = false) {
  const d = new Date(iso);
  const opt = { timeZone: IST };
  if (unit === "hour") return d.toLocaleTimeString("en-IN", { ...opt, hour: "numeric", hour12: true });
  if (unit === "month") return d.toLocaleDateString("en-IN", { ...opt, month: "short", year: long ? "numeric" : "2-digit" });
  if (unit === "week") return (long ? "Week of " : "") + d.toLocaleDateString("en-IN", { ...opt, day: "numeric", month: "short" });
  return d.toLocaleDateString("en-IN", { ...opt, day: "numeric", month: "short", ...(long ? { weekday: "short" } : {}) });
}

/* Clean axis maximum: 1, 2 or 5 times a power of ten. */
function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].map((m) => m * p).find((m) => m >= v);
}

function Delta({ now, prev, invert }) {
  if (prev == null || n0(prev) === 0) return <span className="adm-an-delta">—</span>;
  const change = (n0(now) - n0(prev)) / n0(prev);
  const up = change > 0;
  const good = invert ? !up : up;
  if (Math.abs(change) < 0.005) return <span className="adm-an-delta">no change</span>;
  return (
    <span className={`adm-an-delta ${good ? "is-good" : "is-bad"}`}>
      {up ? "▲" : "▼"} {Math.abs(Math.round(change * 100))}%
    </span>
  );
}

function Tile({ label, value, now, prev, invert, foot }) {
  return (
    <div className="adm-an-tile">
      <span className="adm-an-tile__label">{label}</span>
      <strong className="adm-an-tile__value">{value}</strong>
      <span className="adm-an-tile__foot">
        {now !== undefined && <Delta now={now} prev={prev} invert={invert} />} {foot}
      </span>
    </div>
  );
}

/**
 * Columns over time, one series. Hover or focus a column for its exact value;
 * a hidden table carries the same numbers for screen readers.
 */
/* Drawn at the container's real width, so axis text stays 11px on a phone
   instead of being scaled down with a fixed viewBox. */
function useWidth(fallback) {
  const ref = useRef(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function Columns({ title, series, unit, valueOf, format, integer }) {
  const [hover, setHover] = useState(null);
  const [plotRef, W] = useWidth(720);
  const H = 220;
  const pad = { l: 52, r: 8, t: 12, b: 28 };
  const values = series.map(valueOf);
  const max = niceMax(Math.max(0, ...values));
  const band = (W - pad.l - pad.r) / Math.max(series.length, 1);
  const barW = Math.min(24, Math.max(3, band - 2));
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  /* A count has no half orders: drop a fractional middle tick. */
  const ticks = [0, max / 2, max].filter((t) => !integer || Number.isInteger(t));
  /* Label every nth bucket so the axis never collides with itself. */
  const every = Math.ceil(series.length / Math.max(3, Math.floor(W / 80)));
  const peak = values.indexOf(Math.max(...values));

  return (
    <figure className="adm-an-chart">
      <figcaption>{title}</figcaption>
      <div className="adm-an-chart__plot" ref={plotRef}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="adm-an-grid" />
              <text x={pad.l - 8} y={y(t) + 4} className="adm-an-axis" textAnchor="end">
                {format(t, true)}
              </text>
            </g>
          ))}
          {series.map((b, i) => {
            const v = values[i];
            const x = pad.l + band * i + (band - barW) / 2;
            const top = y(v);
            const h = Math.max(0, H - pad.b - top);
            const r = Math.min(4, h, barW / 2);
            return (
              <g key={b.at}>
                {h > 0 && (
                  /* 4px rounded data-end, square at the baseline */
                  <path
                    className={`adm-an-bar ${hover === i ? "is-hover" : ""}`}
                    d={`M${x},${H - pad.b} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${H - pad.b} Z`}
                  />
                )}
                {i % every === 0 && (
                  <text x={pad.l + band * i + band / 2} y={H - 8} className="adm-an-axis" textAnchor="middle">
                    {bucketLabel(b.at, unit)}
                  </text>
                )}
                {/* the hit target is the whole column of the band, not the bar */}
                <rect
                  x={pad.l + band * i}
                  y={pad.t}
                  width={band}
                  height={H - pad.t - pad.b}
                  fill="transparent"
                  tabIndex={0}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  aria-label={`${bucketLabel(b.at, unit, true)}: ${format(v)}`}
                />
              </g>
            );
          })}
          {values[peak] > 0 && hover == null && (
            /* The one direct label: the busiest bucket. Anchored inward near
               either edge so it is never clipped. */
            <text
              x={pad.l + band * peak + band / 2}
              y={Math.max(pad.t + 10, y(values[peak]) - 6)}
              className="adm-an-peak"
              textAnchor={peak > series.length * 0.85 ? "end" : peak < series.length * 0.15 ? "start" : "middle"}
            >
              {format(values[peak])}
            </text>
          )}
        </svg>
        {hover != null && (
          <div
            className="adm-an-tip"
            style={{ left: Math.min(Math.max(pad.l + band * hover + band / 2, 70), W - 70) }}
            role="status"
          >
            <span>{bucketLabel(series[hover].at, unit, true)}</span>
            <strong>{format(values[hover])}</strong>
          </div>
        )}
      </div>
      <table className="sr-only">
        <tbody>
          {series.map((b, i) => (
            <tr key={b.at}>
              <th>{bucketLabel(b.at, unit, true)}</th>
              <td>{format(values[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/* A sortable-looking but deliberately plain table: the numbers are the point. */
function Table({ title, sub, columns, rows, empty, limit }) {
  const [all, setAll] = useState(false);
  const shown = limit && !all ? rows.slice(0, limit) : rows;
  return (
    <section className="adm-an-section">
      <h2>{title}</h2>
      {sub && <p className="adm-muted">{sub}</p>}
      {rows.length === 0 ? (
        <p className="adm-state">{empty}</p>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.label} className={c.num ? "num" : ""}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.id ?? r.code ?? i} className={r.is_active === false || r.is_available === false ? "is-off" : ""}>
                  {columns.map((c, j) => (
                    <td
                      key={c.label}
                      className={j === 0 ? "adm-cell-main" : c.num ? "num" : ""}
                      data-label={j === 0 ? undefined : c.label}
                    >
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {limit && rows.length > limit && (
        <button type="button" className="btn btn-ghost adm-btn-sm adm-an-more" onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </section>
  );
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState("today");
  const { data: a, error, loading, reload } = useLoad(() => loadAnalytics(period), [period]);
  const meta = PERIODS.find((p) => p.id === period);

  const derived = useMemo(() => {
    if (!a) return null;
    const now = a.kpis?.now ?? {};
    const prev = a.kpis?.prev ?? null;
    const earning = (k) => n0(k?.orders) - n0(k?.cancelled);
    return {
      now,
      prev,
      aov: earning(now) ? n0(now.revenue_paise) / earning(now) : 0,
      prevAov: prev && earning(prev) ? n0(prev.revenue_paise) / earning(prev) : null,
      unsold: (a.dishes ?? []).filter((d) => n0(d.qty) === 0),
    };
  }, [a]);

  return (
    <>
      <PageHead
        title="Analytics"
        sub={`${meta.span ?? "Since midnight, by hour"} · Vrindavan time · compared with ${meta.prev}`}
      >
        <div className="adm-an-periods" role="tablist" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={period === p.id}
              className={period === p.id ? "is-on" : ""}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-ghost adm-btn-sm" onClick={reload} disabled={loading}>
          {loading && a ? "Refreshing…" : "Refresh"}
        </button>
      </PageHead>

      <LoadState loading={loading && !a} error={error} onRetry={reload} />

      {a && derived && (
        <div className={loading ? "adm-an is-stale" : "adm-an"}>
          <div className="adm-an-tiles">
            <Tile label="Revenue" value={money(derived.now.revenue_paise)} now={derived.now.revenue_paise} prev={derived.prev?.revenue_paise} foot="excl. cancelled" />
            <Tile label="Paid orders" value={int(derived.now.orders)} now={derived.now.orders} prev={derived.prev?.orders} />
            <Tile label="Average order" value={money(derived.aov)} now={derived.aov} prev={derived.prevAov} />
            <Tile label="Dishes sold" value={int(derived.now.items)} now={derived.now.items} prev={derived.prev?.items} />
            <Tile label="Guests" value={int(derived.now.guests)} now={derived.now.guests} prev={derived.prev?.guests} foot="by phone" />
            <Tile
              label="Kitchen accepts in"
              value={mins(a.timing?.avg_mins_to_accept)}
              foot="paid → last kitchen accepted"
            />
            <Tile
              label="Delivered in"
              value={mins(a.timing?.avg_mins_to_deliver)}
              foot="paid → delivered"
            />
            <Tile
              label="Unpaid checkouts"
              value={int(a.abandoned?.now)}
              now={a.abandoned?.now}
              prev={a.abandoned?.prev}
              invert
              foot="started, never paid"
            />
          </div>

          <div className="adm-an-strip">
            {Object.entries(a.statuses ?? {}).map(([s, count]) => (
              <span key={s}>
                <Badge status={s}>{STATUS_LABEL[s] ?? s}</Badge> {int(count)}
              </span>
            ))}
            {n0(derived.now.discount_paise) > 0 && (
              <span className="adm-muted">Discounts given: {money(derived.now.discount_paise)}</span>
            )}
            {n0(a.timing?.some_rejected) > 0 && (
              <span className="adm-muted">{int(a.timing.some_rejected)} order(s) had a kitchen reject</span>
            )}
          </div>

          <div className="adm-an-charts">
            <Columns
              title="Paid orders"
              series={a.series ?? []}
              unit={a.unit}
              valueOf={(b) => n0(b.orders)}
              format={(v) => int(v)}
              integer
            />
            <Columns
              title="Revenue"
              series={a.series ?? []}
              unit={a.unit}
              valueOf={(b) => n0(b.revenue_paise)}
              format={(v, axis) =>
                axis && v >= 100000
                  ? `₹${(v / 100000).toLocaleString("en-IN", { maximumFractionDigits: 1 })}k`
                  : money(v)
              }
            />
          </div>

          <Table
            title="Kitchens"
            sub="Orders each kitchen was part of, how it answered, and the food value it cooked."
            empty="No kitchens yet."
            rows={a.kitchens ?? []}
            columns={[
              { label: "Kitchen", cell: (k) => <strong>{k.name}</strong> },
              { label: "Orders", num: true, cell: (k) => int(k.orders) },
              { label: "Dishes", num: true, cell: (k) => int(k.items) },
              { label: "Food value", num: true, cell: (k) => money(k.food_paise) },
              { label: "Accepted", num: true, cell: (k) => `${int(k.accepted)} · ${pct(k.accepted, k.orders)}` },
              { label: "Rejected", num: true, cell: (k) => int(k.rejected) },
              { label: "Went silent", num: true, cell: (k) => int(k.went_silent) },
              { label: "Avg. accept", num: true, cell: (k) => mins(k.avg_mins_to_accept) },
            ]}
          />

          <Table
            title="Dishes"
            sub={`Best sellers first. ${derived.unsold.length} dish(es) sold nothing in this period.`}
            empty="No dishes yet."
            limit={12}
            rows={a.dishes ?? []}
            columns={[
              {
                label: "Dish",
                cell: (d) => (
                  <>
                    <strong>{d.name}</strong>
                    <small>
                      {d.kitchen} · {d.category}
                      {d.is_available ? "" : " · off the menu"}
                    </small>
                  </>
                ),
              },
              { label: "Sold", num: true, cell: (d) => int(d.qty) },
              { label: "Orders", num: true, cell: (d) => int(d.orders) },
              { label: "Revenue", num: true, cell: (d) => money(d.revenue_paise) },
              { label: "Price", num: true, cell: (d) => rupees(d.price_paise) },
            ]}
          />

          <Table
            title="Places"
            sub="Orders and revenue by guest house, and how many of its rooms ordered."
            empty="No places yet."
            rows={a.places ?? []}
            columns={[
              {
                label: "Place",
                cell: (p) => (
                  <>
                    <strong>{p.name}</strong>
                    <small>{p.area || "—"}</small>
                  </>
                ),
              },
              { label: "Orders", num: true, cell: (p) => int(p.orders) },
              { label: "Revenue", num: true, cell: (p) => money(p.revenue_paise) },
              { label: "Rooms ordering", num: true, cell: (p) => `${int(p.rooms_ordering)} of ${int(p.rooms)}` },
            ]}
          />

          <Table
            title="Top rooms"
            empty="No orders in this period."
            rows={a.rooms ?? []}
            columns={[
              { label: "Room", cell: (r) => <strong>{`${r.place} · Room ${r.room_number}`}</strong> },
              { label: "Orders", num: true, cell: (r) => int(r.orders) },
              { label: "Revenue", num: true, cell: (r) => money(r.revenue_paise) },
            ]}
          />

          <Table
            title="Delivery partners"
            sub="Pickups offered, taken and delivered. “Missed” means another partner accepted first."
            empty="No delivery partners yet."
            rows={a.riders ?? []}
            columns={[
              { label: "Partner", cell: (r) => <strong>{r.name}</strong> },
              { label: "Offered", num: true, cell: (r) => int(r.offered) },
              { label: "Accepted", num: true, cell: (r) => `${int(r.accepted)} · ${pct(r.accepted, r.offered)}` },
              { label: "Declined", num: true, cell: (r) => int(r.declined) },
              { label: "Missed", num: true, cell: (r) => int(r.missed) },
              { label: "No answer", num: true, cell: (r) => int(r.unanswered) },
              { label: "Delivered", num: true, cell: (r) => int(r.delivered) },
              { label: "Avg. to accept", num: true, cell: (r) => mins(r.avg_mins_to_accept) },
              { label: "Avg. to deliver", num: true, cell: (r) => mins(r.avg_mins_to_deliver) },
            ]}
          />

          <Table
            title="Coupons"
            empty="No coupon was used in this period."
            rows={a.coupons ?? []}
            columns={[
              { label: "Code", cell: (c) => <strong className="adm-mono">{c.code}</strong> },
              { label: "Uses", num: true, cell: (c) => int(c.uses) },
              { label: "Discount given", num: true, cell: (c) => money(c.discount_paise) },
              { label: "Revenue", num: true, cell: (c) => money(c.revenue_paise) },
            ]}
          />
        </div>
      )}
    </>
  );
}
