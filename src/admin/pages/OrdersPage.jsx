import { useEffect, useState } from "react";
import {
  assignRider,
  listOpenAttention,
  listOrders,
  listPartners,
  recordKitchenAnswer,
  resolveAttention,
  retryMessage,
  setOrderStatus,
  tenDigits,
} from "../api";
import { Badge, ConfirmButton, LoadState, PageHead } from "../ui";
import { useLoad, useNotice } from "../helpers";
import { maskPhone, rupees } from "../../utils/format";
import "./orders.css";

/**
 * The orders board. Everything on it is read from the database -- tickets,
 * rider offers, WhatsApp messages -- and refreshed every 20 seconds, so what
 * the admin sees is where the order really stands, never a guess.
 *
 * Kitchens and riders answer on WhatsApp; this page is for when they answer
 * by phone instead, when nobody answers, and for moving the order on by hand.
 */

const TZ = "Asia/Kolkata";
const REFRESH_MS = 20000;

/* Midnight in Vrindavan, whatever timezone the admin's browser is set to.
   India has no daylight saving, so the offset is always +05:30. */
function istMidnight(daysBack = 0) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date()); // 2026-10-02
  return new Date(Date.parse(`${today}T00:00:00+05:30`) - daysBack * 86400000);
}

const PERIODS = [
  { key: "today", label: "Today", since: () => istMidnight(0), empty: "No paid orders today yet." },
  { key: "week", label: "Last 7 days", since: () => istMidnight(6), empty: "No paid orders in the last 7 days." },
];

const istDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const clock = (d) =>
  d.toLocaleTimeString("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });

/* "7:42 pm" today, "30 Sep, 7:42 pm" on any other day. */
function when(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (istDay(d) === istDay(new Date())) return clock(d);
  return `${d.toLocaleDateString("en-IN", { timeZone: TZ, day: "numeric", month: "short" })}, ${clock(d)}`;
}

const tel = (n) => `tel:+91${tenDigits(n)}`;

// Statuses an admin can still act on. pending_payment and failed never reach
// a kitchen; delivered and cancelled are final.
const OPEN = new Set(["paid", "sent_to_kitchen", "preparing", "out_for_delivery"]);
// The database only takes a kitchen's answer while the order is still with
// the kitchens (kitchen_decide in migration 0019).
const KITCHEN_OPEN = new Set(["paid", "sent_to_kitchen", "preparing"]);

const NEXT = {
  paid: { status: "preparing", label: "Preparing" },
  sent_to_kitchen: { status: "preparing", label: "Preparing" },
  preparing: { status: "out_for_delivery", label: "Out for delivery" },
  out_for_delivery: { status: "delivered", label: "Delivered" },
};

const FILTERS = [
  { key: "all", label: "All", match: () => true, none: "" },
  {
    key: "kitchens",
    label: "With kitchens",
    match: (o) => o.status === "paid" || o.status === "sent_to_kitchen",
    none: "Nothing is waiting on a kitchen.",
  },
  { key: "preparing", label: "Preparing", match: (o) => o.status === "preparing", none: "Nothing is being prepared." },
  { key: "out", label: "Out for delivery", match: (o) => o.status === "out_for_delivery", none: "Nothing is out for delivery." },
  { key: "delivered", label: "Delivered", match: (o) => o.status === "delivered", none: "Nothing delivered yet." },
  { key: "cancelled", label: "Cancelled", match: (o) => o.status === "cancelled", none: "No cancelled orders." },
];

const TICKET_LABEL = { pending: "Not sent yet", sent: "Waiting", accepted: "Accepted", rejected: "Rejected" };

const MESSAGE_KIND = {
  kitchen_order: "Order to kitchen",
  kitchen_ack: "Reply to kitchen",
  property_order: "Order to accommodation partner",
  guest_confirmation: "Order placed, to guest",
  guest_accepted: "Order accepted, to guest",
  guest_out_for_delivery: "On its way, to guest",
  guest_delivered: "Delivered, to guest",
  delivery_offer: "Delivery offer to rider",
  delivery_details: "Pickup details to rider",
  delivery_taken: "Taken, to rider",
  delivery_ack: "Reply to rider",
  admin_alert: "Alert to admin",
};
const RECIPIENT = { kitchen: "Kitchen", delivery: "Rider", property: "Accommodation partner", guest: "Guest", admin: "Admin" };
const MESSAGE_STATUS = {
  queued: "Queued",
  sending: "Sending",
  retry: "Retrying",
  accepted: "With WhatsApp",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed",
};

async function loadBoard(period) {
  const since = PERIODS.find((p) => p.key === period).since();
  const [orders, attention] = await Promise.all([listOrders(since.toISOString()), listOpenAttention()]);
  return { orders: orders ?? [], attention: attention ?? [], at: new Date() };
}

// ------------------------------------------------------------------ sections
function Kitchens({ order, busy, run }) {
  const tickets = order.tickets ?? [];
  const items = order.items ?? [];
  const canAnswer = KITCHEN_OPEN.has(order.status);

  // An order with no tickets yet still has dishes worth seeing.
  if (!tickets.length)
    return (
      <ul className="adm-orders-lines">
        {items.map((i) => (
          <li key={i.id}>
            {i.qty} × {i.name_snapshot}
          </li>
        ))}
      </ul>
    );

  return (
    <ul className="adm-orders-lines">
      {tickets.map((t) => {
        const name = t.kitchen?.place_name ?? "Kitchen";
        const mine = items.filter((i) => i.kitchen_id === t.kitchen_id);
        const waiting = t.status === "pending" || t.status === "sent";
        return (
          <li key={t.id} className="adm-orders-ticket">
            <div className="adm-orders-ticket__head">
              <strong>{name}</strong>
              <Badge status={t.status}>{TICKET_LABEL[t.status] ?? t.status}</Badge>
              {t.responded_by === "admin" && <span className="adm-muted">by admin</span>}
              {t.kitchen?.whatsapp_number && (
                <a className="adm-orders-tel" href={tel(t.kitchen.whatsapp_number)}>
                  {maskPhone(t.kitchen.whatsapp_number)}
                </a>
              )}
            </div>
            <p className="adm-orders-dishes">
              {mine.map((i) => `${i.qty} × ${i.name_snapshot}`).join(", ") || "—"}
            </p>
            {waiting && canAnswer && (
              <div className="adm-orders-actions">
                <span className="adm-muted">Answered by phone?</span>
                <button
                  type="button"
                  className="btn btn-ghost adm-btn-sm"
                  disabled={busy}
                  onClick={() =>
                    run(order.id, () => recordKitchenAnswer(t.id, true), {
                      done: `${name} marked as accepted`,
                      outcome: true,
                    })
                  }
                >
                  Mark accepted
                </button>
                <button
                  type="button"
                  className="btn btn-ghost adm-btn-sm adm-orders-reject"
                  disabled={busy}
                  onClick={() =>
                    run(order.id, () => recordKitchenAnswer(t.id, false), {
                      done: `${name} marked as rejected. The order is flagged for you.`,
                      outcome: true,
                    })
                  }
                >
                  Mark rejected
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function offerSummary(order) {
  const offers = order.offers ?? [];
  if (!offers.length)
    return order.riders_offered_at ? "No riders were on duty to ask." : "Riders are asked once the kitchens accept.";
  const count = (s) => offers.filter((o) => o.status === s).length;
  const parts = [`Offered to ${offers.length}`];
  if (count("declined")) parts.push(`${count("declined")} declined`);
  if (count("offered")) parts.push(count("offered") === 1 ? "1 waiting" : `${count("offered")} waiting`);
  else parts.push("nobody has accepted");
  return parts.join(" · ");
}

function Delivery({ order, partners, busy, run }) {
  const [pick, setPick] = useState("");
  const rider = order.rider;
  const open = OPEN.has(order.status);
  const choices = partners.filter((p) => p.is_active && p.id !== rider?.id);

  return (
    <div className="adm-orders-delivery">
      {rider ? (
        <p>
          <strong>{rider.name}</strong>{" "}
          <a className="adm-orders-tel" href={tel(rider.whatsapp_number)}>
            {maskPhone(rider.whatsapp_number)}
          </a>
          {order.rider_assigned_at && <span className="adm-muted"> · since {when(order.rider_assigned_at)}</span>}
        </p>
      ) : (
        <p className="adm-muted">{offerSummary(order)}</p>
      )}

      {open &&
        (choices.length ? (
          <div className="adm-orders-assign">
            <label className="adm-orders-sr" htmlFor={`rider-${order.id}`}>
              {rider ? "Change rider" : "Assign rider"}
            </label>
            <select
              id={`rider-${order.id}`}
              className="input"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              disabled={busy}
            >
              <option value="">{rider ? "Change rider…" : "Assign rider…"}</option>
              {choices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn adm-btn-action adm-btn-sm"
              disabled={busy || !pick}
              onClick={async () => {
                const name = choices.find((p) => p.id === pick)?.name ?? "The rider";
                const ok = await run(order.id, () => assignRider(order.id, pick), {
                  done: `${name} is the rider. Pickup details are on their way.`,
                });
                if (ok) setPick("");
              }}
            >
              Assign
            </button>
          </div>
        ) : (
          !rider && <p className="adm-muted">No delivery partners are on duty.</p>
        ))}
    </div>
  );
}

function MoveOn({ order, busy, run }) {
  const next = NEXT[order.status];
  if (!OPEN.has(order.status)) return null;
  return (
    <div className="adm-orders-actions">
      {next && (
        <button
          type="button"
          className="btn adm-btn-action adm-btn-sm"
          disabled={busy}
          onClick={() =>
            run(order.id, () => setOrderStatus(order.id, next.status), {
              done: `Order ${order.order_no} is now ${next.label.toLowerCase()}`,
            })
          }
        >
          {next.label}
        </button>
      )}
      <ConfirmButton
        className="btn btn-ghost adm-btn-sm adm-orders-reject"
        disabled={busy}
        confirm={`Cancel order ${order.order_no}? This does not refund the guest. Refund it in the Razorpay dashboard.`}
        onConfirm={() =>
          run(order.id, () => setOrderStatus(order.id, "cancelled"), {
            done: `Order ${order.order_no} cancelled. Refund it in the Razorpay dashboard.`,
          })
        }
      >
        Cancel order
      </ConfirmButton>
    </div>
  );
}

function Messages({ order, busy, run }) {
  const messages = [...(order.messages ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (!messages.length) return null;
  const failed = messages.filter((m) => m.status === "failed").length;
  return (
    <details className="adm-orders-messages">
      <summary>
        WhatsApp messages ({messages.length})
        {failed > 0 && <span className="adm-orders-failed"> · {failed} failed</span>}
      </summary>
      <ul>
        {messages.map((m) => (
          <li key={m.id}>
            <div className="adm-orders-msg__head">
              <span>{MESSAGE_KIND[m.kind] ?? m.kind ?? "Message"}</span>
              <Badge status={m.status}>{MESSAGE_STATUS[m.status] ?? m.status}</Badge>
            </div>
            <p className="adm-muted">
              {RECIPIENT[m.recipient_type] ?? m.recipient_type}
              {m.recipient_number ? ` · ${maskPhone(m.recipient_number)}` : " · no number"}
              {" · "}
              {when(m.created_at)}
              {m.attempts > 1 && ` · ${m.attempts} tries`}
            </p>
            {m.status === "failed" && (
              <div className="adm-orders-msg__fail">
                {m.error && <p className="adm-orders-error">{m.error}</p>}
                {m.recipient_number ? (
                  <button
                    type="button"
                    className="btn btn-ghost adm-btn-sm"
                    disabled={busy}
                    onClick={() => run(order.id, () => retryMessage(m.id), { done: "Message queued again" })}
                  >
                    Retry
                  </button>
                ) : (
                  <span className="adm-muted">No number on this message, so it cannot be retried.</span>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

// --------------------------------------------------------------------- cards
function OrderHead({ order }) {
  const room = order.room;
  return (
    <>
      <div className="adm-orders-card__top">
        <span className="adm-mono adm-orders-no">{order.order_no}</span>
        <span className="adm-muted">{when(order.created_at)}</span>
        <Badge status={order.status} />
        <strong className="adm-orders-total">{rupees(order.total_paise)}</strong>
      </div>
      <p className="adm-orders-where">
        {room?.place?.name ?? "Unknown place"}
        {room?.room_number && ` · Room ${room.room_number}`}
      </p>
      <p className="adm-orders-guest">
        {order.guest_name || "Guest"}
        {order.guest_phone && (
          <>
            {" · "}
            <a className="adm-orders-tel" href={tel(order.guest_phone)}>
              {maskPhone(order.guest_phone)}
            </a>
          </>
        )}
      </p>
      {order.coupon_code && (
        <p className="adm-muted">
          Coupon <span className="adm-mono">{order.coupon_code}</span>
          {order.discount_paise > 0 && ` · ${rupees(order.discount_paise)} off`}
        </p>
      )}
      {order.note && <p className="adm-orders-note">“{order.note}”</p>}
    </>
  );
}

function OrderBody({ order, partners, busy, run }) {
  return (
    <>
      <section className="adm-orders-sec">
        <h3>Kitchens</h3>
        <Kitchens order={order} busy={busy} run={run} />
      </section>
      <section className="adm-orders-sec">
        <h3>Delivery</h3>
        <Delivery order={order} partners={partners} busy={busy} run={run} />
      </section>
      {OPEN.has(order.status) && (
        <section className="adm-orders-sec">
          <h3>Move on</h3>
          <MoveOn order={order} busy={busy} run={run} />
        </section>
      )}
      <Messages order={order} busy={busy} run={run} />
    </>
  );
}

function OrderCard({ order, partners, busy, run }) {
  return (
    <article className={`adm-card adm-orders-card ${order.needs_attention ? "is-flagged" : ""}`} aria-busy={busy}>
      <OrderHead order={order} />
      {order.needs_attention && order.attention_note && (
        <p className="adm-orders-flag">{order.attention_note}</p>
      )}
      <OrderBody order={order} partners={partners} busy={busy} run={run} />
    </article>
  );
}

/* An order waiting on the admin. The full order folds away beneath it, so it
   can be handled here even when it is older than the period being shown. */
function AttentionCard({ order, partners, busy, run }) {
  return (
    <article className="adm-card adm-orders-card adm-orders-attn" aria-busy={busy}>
      <p className="adm-orders-attn__note">{order.attention_note || "Needs a look"}</p>
      <OrderHead order={order} />
      <div className="adm-orders-actions">
        <button
          type="button"
          className="btn adm-btn-action adm-btn-sm"
          disabled={busy}
          onClick={() => run(order.id, () => resolveAttention(order.id), { done: "Marked handled", quiet: true })}
        >
          Mark handled
        </button>
      </div>
      <details className="adm-orders-more">
        <summary>Kitchens, delivery and messages</summary>
        <OrderBody order={order} partners={partners} busy={busy} run={run} />
      </details>
    </article>
  );
}

// ---------------------------------------------------------------------- page
export default function OrdersPage() {
  const [period, setPeriod] = useState("today");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState({});
  const notify = useNotice();
  const { data, error, loading, reload, setData } = useLoad(() => loadBoard(period), [period]);
  const partnersLoad = useLoad(listPartners);
  const partners = partnersLoad.data ?? [];
  const reloadPartners = partnersLoad.reload;

  // Every 20 seconds while the tab is in view, and at once when it comes back.
  useEffect(() => {
    const tick = () => {
      if (!document.hidden) reload();
    };
    const id = setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [reload]);

  /**
   * Runs one admin action on one order. `sent: false` is not a failure: the
   * messages it queued are safe and the minute sweep sends them.
   */
  const run = async (orderId, action, { done, outcome, quiet }) => {
    setBusy((b) => ({ ...b, [orderId]: true }));
    try {
      const out = await action();
      let msg = done;
      if (outcome && out?.outcome === "already") msg = "That kitchen had already answered.";
      else if (outcome && out?.outcome === "closed") msg = "That order is no longer with the kitchens.";
      else if (!quiet && out?.sent === false)
        msg = `${done.replace(/\.$/, "")}. Any WhatsApp messages will go out within a minute.`;
      notify(msg);
      await reload();
      return true;
    } catch (e) {
      notify(e.message, "error");
      return false;
    } finally {
      setBusy((b) => {
        const next = { ...b };
        delete next[orderId];
        return next;
      });
    }
  };

  const orders = data?.orders ?? [];
  const attention = data?.attention ?? [];
  const current = FILTERS.find((f) => f.key === filter);
  const shown = orders.filter(current.match);
  const periodInfo = PERIODS.find((p) => p.key === period);

  return (
    <>
      <PageHead title="Orders" sub={data?.at ? `Updated ${clock(data.at)} · refreshes every 20 seconds` : null}>
        <div className="adm-orders-seg" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={period === p.key}
              onClick={() => {
                if (p.key === period) return;
                setData(null);
                setPeriod(p.key);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-ghost adm-btn-sm adm-orders-refresh"
          onClick={() => {
            reload();
            reloadPartners();
          }}
        >
          {loading && data ? "Refreshing…" : "Refresh"}
        </button>
      </PageHead>

      {attention.length > 0 && (
        <section className="adm-orders-block" aria-labelledby="attn-title">
          <h2 id="attn-title" className="adm-orders-block__title adm-orders-block__title--attn">
            Needs attention ({attention.length})
          </h2>
          <div className="adm-orders-grid">
            {attention.map((o) => (
              <AttentionCard key={o.id} order={o} partners={partners} busy={Boolean(busy[o.id])} run={run} />
            ))}
          </div>
        </section>
      )}

      <div className="adm-orders-chips" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label} <span className="adm-orders-chip-n">{orders.filter(f.match).length}</span>
          </button>
        ))}
      </div>

      <LoadState
        loading={loading && !data}
        error={error}
        onRetry={reload}
        empty={data && !shown.length}
        emptyText={orders.length ? current.none : periodInfo.empty}
      />

      {shown.length > 0 && (
        <div className="adm-orders-grid">
          {shown.map((o) => (
            <OrderCard key={o.id} order={o} partners={partners} busy={Boolean(busy[o.id])} run={run} />
          ))}
        </div>
      )}
    </>
  );
}
