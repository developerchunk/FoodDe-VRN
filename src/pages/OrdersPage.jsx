import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listReceipts, fetchReceipt } from "../lib/orders";
import { rupees, formatDateTime } from "../utils/format";
import { MorPankh } from "../components/Motifs";

/**
 * Orders placed from this device.
 *
 * The orders themselves live in the database; this device only keeps the
 * receipt tokens, which is what lets a guest who never signed in still find
 * their way back. Signing in with Google later gives the same list on any
 * device, because the anonymous account becomes the real one.
 */
export default function OrdersPage() {
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const held = listReceipts();
      const loaded = await Promise.all(
        held.map(async (r) => {
          const order = await fetchReceipt(r.token);
          return order ? { ...order, token: r.token } : null;
        }),
      );
      if (!cancelled) setOrders(loaded.filter(Boolean));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (orders === null) {
    return (
      <main className="wrap page page--narrow" id="main">
        <div className="empty-state card empty-state--page">
          <span className="spinner spinner--dark" aria-hidden="true" />
          <h1 className="section-title">Fetching your orders…</h1>
        </div>
      </main>
    );
  }

  if (orders.length === 0) {
    return (
      <main className="wrap page page--narrow" id="main">
        <div className="empty-state card empty-state--page">
          <MorPankh size={42} />
          <h1 className="section-title">No orders from this device yet</h1>
          <p className="muted">
            Scan the QR code in your room to order. Your receipts will appear
            here afterwards.
          </p>
          <Link to="/" className="btn btn-primary">
            Browse the menu
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap page page--narrow" id="main">
      <header className="page__head">
        <div>
          <p className="eyebrow">On this device</p>
          <h1 className="page__title">Your orders</h1>
          <p className="page__sub">
            Sign in with Google and these follow you to any device, along with
            every receipt.
          </p>
        </div>
      </header>

      <ul className="order-history">
        {orders.map((o) => (
          <li key={o.token} className="card history-card">
            <div className="history-card__top">
              <div>
                <strong>{o.order_no}</strong>
                <p className="muted">{formatDateTime(o.created_at)}</p>
              </div>
              <strong className="rupee history-card__amt">
                {rupees(o.total_paise)}
              </strong>
            </div>
            <p className="history-card__items">
              {o.items.map((i) => `${i.qty} × ${i.name}`).join(" · ")}
            </p>
            <div className="history-card__actions">
              <Link to={`/receipt/${o.token}`} className="btn btn-ghost">
                View receipt
              </Link>
              <Link to={`/order/${o.token}`} className="btn btn-ghost">
                Track order
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
