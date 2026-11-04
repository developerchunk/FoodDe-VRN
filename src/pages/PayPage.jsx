import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useReceipt } from "../hooks/useReceipt";
import { payForOrder } from "../lib/payments";
import { rupees } from "../utils/format";
import { Cloche } from "../components/Icons";

/**
 * Paying a cash-on-delivery order online: /pay/<receipt token>.
 *
 * The link the guest is sent on WhatsApp when the order leaves the kitchen,
 * and the page the rider's QR opens. Only a cash-on-delivery order still to be
 * paid offers to take money; anything else says where it stands.
 */
export default function PayPage() {
  const { id } = useParams();
  const { order, loading, refresh } = useReceipt(id);
  const [paying, setPaying] = useState(false);
  const [note, setNote] = useState(null);

  async function pay() {
    setPaying(true);
    setNote(null);
    try {
      const result = await payForOrder({ token: id });
      if (result.paid) await refresh();
      else if (result.reason !== "dismissed") setNote(result.message ?? "The payment did not go through.");
    } catch (err) {
      setNote(err.message ?? "Could not start the payment.");
    } finally {
      setPaying(false);
    }
  }

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

  if (!order) {
    return (
      <main className="wrap page page--narrow" id="main">
        <div className="empty-state card empty-state--page">
          <Cloche size={42} />
          <h1 className="section-title">We couldn’t find that order</h1>
        </div>
      </main>
    );
  }

  const due =
    order.payment_method === "cod" &&
    !order.is_paid &&
    !["cancelled", "failed"].includes(order.status);

  return (
    <main className="wrap page page--narrow" id="main">
      <section className="card waiting pay-page" aria-live="polite">
        <p className="eyebrow">Order {order.order_no}</p>
        <h1 className="waiting__title">
          {due
            ? "Pay for your order"
            : order.is_paid
              ? "Payment received"
              : order.status === "cancelled"
                ? "This order was cancelled"
                : "Nothing to pay here"}
        </h1>
        <p className="waiting__sub">
          {order.place_name}, Room {order.room_number}
        </p>

        <p className="waiting__amount rupees">{rupees(order.total_paise)}</p>

        {due ? (
          <>
            <button
              type="button"
              className="btn btn-gold btn-block pay-page__cta"
              onClick={pay}
              disabled={paying}
            >
              {paying ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Opening payment…
                </>
              ) : (
                <>Pay {rupees(order.total_paise)} online</>
              )}
            </button>
            {note && (
              <p className="side-card__error" role="alert">
                {note}
              </p>
            )}
          </>
        ) : (
          order.is_paid && (
            <p className="pay-page__done">
              {order.collected_via === "cash" ? "Paid in cash." : "Paid online."} Thank you.
            </p>
          )
        )}

        <Link to={`/order/${id}`} className="btn btn-ghost btn-block pay-page__back">
          Follow your order
        </Link>
      </section>
    </main>
  );
}
