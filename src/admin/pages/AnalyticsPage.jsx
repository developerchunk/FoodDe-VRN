import { useMemo, useState } from "react";
import { loadAnalytics } from "../api";
import { Badge, LoadState, PageHead } from "../ui";
import { STATUS_LABEL, useLoad } from "../helpers";
import { rupees } from "../../utils/format";
import { Columns, Table, Tile } from "./charts";
import { int, mins, money, n0, pct } from "./chartFormat";

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
            title="Accommodation Partners"
            sub="Orders and revenue by accommodation partner, and how many of its rooms ordered."
            empty="No accommodation partners yet."
            rows={a.places ?? []}
            columns={[
              {
                label: "Accommodation Partner",
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
