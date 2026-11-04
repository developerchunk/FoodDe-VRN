import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listReceipts, fetchReceipt, fetchMyOrders } from "../lib/orders";
import { payForOrder } from "../lib/payments";
import { useAuth } from "../hooks/useAuth";
import SignInButton from "../components/SignInButton";
import { rupees, formatDateTime } from "../utils/format";
import { Cloche } from "../components/Icons";

/* Still on its way, so a cash-on-delivery order can be paid for online. */
const OPEN = new Set(["paid", "sent_to_kitchen", "preparing", "out_for_delivery"]);
const payable = (o) => o.payment_method === "cod" && !o.is_paid && OPEN.has(o.status);

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
  /* One payment window at a time: the token being paid, and any problem. */
  const [paying, setPaying] = useState(null);
  const [payNote, setPayNote] = useState({});

  async function pay(token) {
    setPaying(token);
    setPayNote((n) => ({ ...n, [token]: null }));
    try {
      const result = await payForOrder({ token });
      if (result.paid) {
        /* Read it back rather than assume: the server says whether it is paid. */
        const fresh = await fetchReceipt(token);
        if (fresh)
          setOrders((list) =>
            list.map((o) => (o.token === token ? { ...o, ...fresh, token } : o)),
          );
      } else if (result.reason !== "dismissed") {
        setPayNote((n) => ({
          ...n,
          [token]: result.message ?? "The payment did not go through.",
        }));
      }
    } catch (err) {
      setPayNote((n) => ({
        ...n,
        [token]: err.message ?? "Could not start the payment.",
      }));
    } finally {
      setPaying(null);
    }
  }

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
            {payable(o) && (
              <p className="history-card__due">
                Cash on delivery · <strong className="rupee">{rupees(o.total_paise)}</strong> to pay
              </p>
            )}
            <div className="history-card__actions">
              {payable(o) && (
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={() => pay(o.token)}
                  disabled={paying !== null}
                >
                  {paying === o.token ? (
                    <>
                      <span className="spinner" aria-hidden="true" /> Opening…
                    </>
                  ) : (
                    <>Pay {rupees(o.total_paise)} online</>
                  )}
                </button>
              )}
              <Link to={`/receipt/${o.token}`} className="btn btn-ghost">
                View receipt
              </Link>
              <Link to={`/order/${o.token}`} className="btn btn-ghost">
                Track order
              </Link>
            </div>
            {payNote[o.token] && (
              <p className="pay-card__note" role="alert">
                {payNote[o.token]}
              </p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
