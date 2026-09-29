import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useReceipt } from "../hooks/useReceipt";
import { useCart } from "../context/cart-context";
import { PAY_WINDOW_S, closePayment, payForOrder } from "../lib/payments";
import { rupees, maskPhone, formatDateTime } from "../utils/format";
import { Cloche, ClockIcon } from "../components/Icons";

const STAGES = [
  { id: "confirmed", title: "Order received", body: "We have your order." },
  { id: "cooking", title: "On the chulha", body: "Cooking fresh." },
  { id: "packed", title: "Packed & sealed", body: "Sealed in paper and clay." },
  { id: "out", title: "Out for delivery", body: "On its way. Keep your phone close." },
];

/* The stage comes from the order's real status, never from a timer. A tracker
   that advances on its own tells a guest their food is on the way when nobody
   has cooked it. */
const STAGE_FOR = {
  paid: 0,
  sent_to_kitchen: 0,
  preparing: 1,
  out_for_delivery: 3,
  delivered: 3,
};

/* Where the order has got to, read from its status. */

export default function OrderSuccessPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { add, clear } = useCart();
  const { order, loading, refresh } = useReceipt(id);
  const [paying, setPaying] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(PAY_WINDOW_S);
  const [payNote, setPayNote] = useState(null);
  const unpaid = order?.status === "pending_payment";

  /* Back to the cart they still have, with a reason. The cart is deliberately
     not cleared until a payment succeeds, so trying again costs nothing. */
  const backToCheckout = useCallback(
    (reason) => {
      /* Shut the payment window first, or it stays over the checkout page. */
      closePayment();
      navigate("/checkout", { replace: true, state: { paymentFailed: reason } });
    },
    [navigate],
  );

  const pay = useCallback(async () => {
    setPaying(true);
    setPayNote(null);
    try {
      const result = await payForOrder({ token: id });
      if (result.paid) {
        /* Only now is the order real. */
        clear();
        await refresh();
        return;
      }
      if (result.reason === "dismissed") {
        /* They closed the window themselves; leave them here to try again. */
        setPayNote(null);
      } else {
        backToCheckout(result.message ?? "Your last payment did not go through.");
      }
    } catch (err) {
      setPayNote(err.message ?? "Could not start the payment.");
    } finally {
      setPaying(false);
    }
  }, [id, refresh, clear, backToCheckout]);

  /* Open the modal once, as soon as the order is known to be unpaid. Placing
     the order and paying for it are one act from the guest's side. */
  const autoOpened = useRef(false);
  useEffect(() => {
    if (!unpaid || autoOpened.current) return;
    autoOpened.current = true;
    pay();
  }, [unpaid, pay]);

  /* Nobody waits forever in front of a payment window. */
  useEffect(() => {
    if (!unpaid) return undefined;
    if (secondsLeft <= 0) {
      backToCheckout("Your last payment timed out.");
      return undefined;
    }
    const t = setTimeout(() => setSecondsLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [unpaid, secondsLeft, backToCheckout]);

  /* Derived, not animated. */
  const stage = STAGE_FOR[order?.status] ?? 0;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  if (loading) {
    return (
      <main className="wrap page page--narrow" id="main">
        <div className="empty-state card empty-state--page">
          <span className="spinner spinner--dark" aria-hidden="true" />
          <h1 className="section-title">Fetching your order…</h1>
        </div>
      </main>
    );
  }

  /* Unpaid: no tick, no order number to keep, no tracker, no arriving-by. None
     of that is true yet — no money has moved and no kitchen has been told. All
     there is to show is that we are waiting for the payment. */
  if (order && unpaid) {
    const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
    const ss = String(secondsLeft % 60).padStart(2, "0");
    return (
      <main className="wrap page page--narrow" id="main">
        <section className="card waiting" aria-live="polite">
          <span className="spinner spinner--dark" aria-hidden="true" />
          <h1 className="waiting__title">Waiting for your payment</h1>
          <p className="waiting__sub">
            Finish the payment in the window that opened. Nothing is ordered
            until it goes through.
          </p>

          <p className="waiting__amount rupees">{rupees(order.total_paise)}</p>
          <p className="waiting__timer" aria-label={`${mm} minutes ${ss} seconds left`}>
            <ClockIcon size={15} /> {mm}:{ss}
          </p>

          <button
            type="button"
            className="btn btn-gold btn-block"
            onClick={pay}
            disabled={paying}
          >
            {paying ? "Opening payment…" : "Open payment again"}
          </button>
          {payNote && (
            <p className="side-card__error" role="alert">
              {payNote}
            </p>
          )}
        </section>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="wrap page page--narrow" id="main">
        <div className="empty-state card empty-state--page">
          <Cloche size={42} />
          <h1 className="section-title">We couldn’t find that order</h1>
          <Link to="/menu" className="btn btn-primary">
            Back to the menu
          </Link>
        </div>
      </main>
    );
  }

  /* A rough promise while the kitchen has not accepted yet. Once tickets are
     acknowledged this should come from the kitchen, not from a constant. */
  const eta = new Date(new Date(order.created_at).getTime() + 40 * 60000);
  const etaText = eta.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const reorder = () => {
    order.items.forEach((l) => {
      for (let i = 0; i < l.qty; i++) add(l);
    });
    navigate("/cart");
  };

  return (
    <main className="wrap page" id="main">
      <section className="success card">
        <div className="success__burst" aria-hidden="true">
          <svg viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="56" fill="#dfeed4" />
            <circle cx="60" cy="60" r="44" fill="#4a7a3b" opacity="0.13" />
            <path
              d="M38 62 l14 14 l30 -32"
              fill="none"
              stroke="#4a7a3b"
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1 className="success__title">Your order is confirmed</h1>
        <p className="success__sub">
          Thank you, <strong>{order.guest_name.split(" ")[0]}</strong>. We have
          sent the confirmation to{" "}
          <strong>{maskPhone(order.guest_phone)}</strong> on WhatsApp, and we
          will call this number if the rider needs directions.
        </p>

        <div className="success__meta">
          <div>
            <small>Order number</small>
            <strong>{order.order_no}</strong>
          </div>
          <div>
            <small>Placed at</small>
            <strong>{formatDateTime(order.created_at)}</strong>
          </div>
          <div>
            <small>Arriving by</small>
            <strong className="success__eta">
              <ClockIcon size={16} /> {etaText}
            </strong>
          </div>
          <div>
            <small>To pay</small>
            <strong className="rupee">{rupees(order.total_paise)}</strong>
          </div>
        </div>

        <div className="success__actions">
          {/* /receipt/:id is the receipt TOKEN, which is what `id` already is
              here. Passing order_no instead looked right and found nothing. */}
          <Link
            to={`/receipt/${id}`}
            state={{ from: `/order/${id}` }}
            className="btn btn-primary"
          >
            View receipt
          </Link>
          <Link to="/orders" state={{ from: `/order/${id}` }} className="btn btn-ghost">
            Your orders
          </Link>
          <button type="button" className="btn btn-ghost" onClick={reorder}>
            Order this again
          </button>
          <Link to="/menu" className="btn btn-ghost">
            Back to menu
          </Link>
        </div>
      </section>

      <div className="success-grid">
        {unpaid && (
          <section className="card pay-card" aria-label="Payment">
            <h2 className="pay-card__title">This order is not paid yet</h2>
            <p className="pay-card__body">
              Nothing is sent to be cooked until the payment goes through. If
              the payment window did not open, or you closed it, you can open it
              again here.
            </p>
            <button
              type="button"
              className="btn btn-gold btn-block"
              onClick={pay}
              disabled={paying}
            >
              {paying ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Opening
                  payment…
                </>
              ) : (
                <>Pay {rupees(order.total_paise)}</>
              )}
            </button>
            {payNote && (
              <p className="pay-card__note" role="alert">
                {payNote}
              </p>
            )}
          </section>
        )}
        <section className="card track" aria-label="Order progress">
          <h2 className="track__title">Following your order</h2>
          <ol className="track__list">
            {STAGES.map((s, i) => (
              <li
                key={s.id}
                className={`track__item ${i < stage ? "is-done" : ""} ${i === stage ? "is-now" : ""}`}
              >
                <span className="track__dot" aria-hidden="true">
                  {i < stage ? (
                    <svg viewBox="0 0 16 16" width="11" height="11">
                      <path
                        d="M3 8.5 6 12l7-8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <span className="track__pip" />
                  )}
                </span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </li>
            ))}
          </ol>

        </section>

        <section className="card summary-card" aria-label="Order summary">
          <h2 className="summary-card__title">What is coming</h2>
          <ul className="mini-lines mini-lines--roomy">
            {order.items.map((l) => (
              <li key={l.id}>
                <span className="veg-mark" aria-hidden="true" />
                <span className="mini-lines__name">
                  {l.name} <em>× {l.qty}</em>
                </span>
                <span className="rupee">{rupees(l.pricePaise * l.qty)}</span>
              </li>
            ))}
          </ul>

          <div className="summary-card__total">
            <span>
              {order.status === "pending_payment"
                ? "Awaiting payment"
                : "Total"}
            </span>
            <strong className="rupee">{rupees(order.total_paise)}</strong>
          </div>

          <div className="summary-card__addr">
            <h3>Delivering to</h3>
            <p>
              {order.place_name}
              <br />
              Room {order.room_number}
            </p>
            {order.note && <p className="summary-card__note">“{order.note}”</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
