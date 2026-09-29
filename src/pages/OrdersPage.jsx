import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listReceipts, fetchReceipt, fetchMyOrders } from "../lib/orders";
import { useAuth } from "../hooks/useAuth";
import SignInButton from "../components/SignInButton";
import { rupees, formatDateTime } from "../utils/format";
import { Cloche } from "../components/Icons";

/**
 * Orders placed from this device.
 *
 * Signed in, the list comes from the database and follows the guest to any
 * device. Otherwise it is built from the receipt tokens this device kept, which
 * is what lets someone who never signed in find their way back at all.
 *
 * Linking Google keeps the same user id, so an order placed as a guest is still
 * theirs afterwards — the list does not empty out when they sign in.
 */
export default function OrdersPage() {
  const [orders, setOrders] = useState(null);
  const { signedIn, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return undefined;
    let cancelled = false;
    (async () => {
      if (signedIn) {
        const mine = await fetchMyOrders();
        if (!cancelled)
          setOrders(mine.map((o) => ({ ...o, token: o.receipt_token })));
        return;
      }
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
  }, [signedIn, authLoading]);

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
          <Cloche size={42} />
          <h1 className="section-title">No orders from this device yet</h1>
          <Link to="/menu" className="btn btn-primary">
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
            {signedIn
              ? "Signed in — these follow you to any device."
              : "These orders are saved on this device. Order confirmations and receipts are sent on WhatsApp."}
          </p>
          {/* The header nav is hidden on a phone, so this is the only place a
              guest can sign in on the device most of them are holding. */}
          <p className="orders-auth">
            <SignInButton variant="button" />
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
            {/* Two sources feed this list and they must agree on the shape.
                They did not once, and .map() on undefined blanked the whole
                page rather than dropping one line. */}
            {o.items?.length > 0 && (
              <p className="history-card__items">
                {o.items.map((i) => `${i.qty} × ${i.name}`).join(" · ")}
              </p>
            )}
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
