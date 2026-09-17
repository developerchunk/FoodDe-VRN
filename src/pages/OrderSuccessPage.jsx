import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { getOrder } from "../utils/orders";
import { getItem } from "../data/menu";
import { useCart } from "../context/cart-context";
import { rupees, maskPhone, formatDateTime } from "../utils/format";
import { MorPankh, TulsiLeaf, Diya, Lotus } from "../components/Motifs";

const STAGES = [
  {
    id: "confirmed",
    title: "Order received",
    body: "The kitchen has your order and the WhatsApp confirmation is on its way.",
  },
  {
    id: "cooking",
    title: "On the chulha",
    body: "Your dishes are being cooked fresh — nothing is pre-plated here.",
  },
  {
    id: "packed",
    title: "Packed & sealed",
    body: "Sealed in paper and clay, with the note you left us.",
  },
  {
    id: "out",
    title: "Out for delivery",
    body: "Our rider has left the kitchen. Keep your phone close.",
  },
];

/* The demo walks the order through its stages so the flow can be seen end to end. */
const STAGE_MS = 7000;

export default function OrderSuccessPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { add } = useCart();
  const order = useMemo(() => getOrder(id), [id]);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!order) return;
    if (stage >= STAGES.length - 1) return;
    const t = setTimeout(() => setStage((s) => s + 1), STAGE_MS);
    return () => clearTimeout(t);
  }, [stage, order]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  if (!order) {
    return (
      <main className="wrap page page--narrow" id="main">
        <div className="empty-state card empty-state--page">
          <MorPankh size={42} />
          <h1 className="section-title">We couldn’t find that order</h1>
          <p className="muted">
            Demo orders live in this browser only. If you cleared your site
            data, the order went with it.
          </p>
          <Link to="/" className="btn btn-primary">
            Back to the menu
          </Link>
        </div>
      </main>
    );
  }

  const eta = new Date(
    new Date(order.placedAt).getTime() + order.etaMinutes * 60000,
  );
  const etaText = eta.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const reorder = () => {
    order.lines.forEach((l) => {
      const item = getItem(l.id);
      if (item) for (let i = 0; i < l.qty; i++) add(item);
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

        <p className="success__greet deva">राधे राधे 🙏</p>
        <h1 className="success__title">Your order is confirmed</h1>
        <p className="success__sub">
          Thank you, <strong>{order.customer.name.split(" ")[0]}</strong>. We
          have sent the confirmation to{" "}
          <strong>{maskPhone(order.customer.phone)}</strong> on WhatsApp, and we
          will call this number if the rider needs directions.
        </p>

        <div className="success__meta">
          <div>
            <small>Order number</small>
            <strong>{order.id}</strong>
          </div>
          <div>
            <small>Placed at</small>
            <strong>{formatDateTime(order.placedAt)}</strong>
          </div>
          <div>
            <small>Arriving by</small>
            <strong className="success__eta">
              <Diya size={16} /> {etaText}
            </strong>
          </div>
          <div>
            <small>To pay</small>
            <strong className="rupee">{rupees(order.bill.total)}</strong>
          </div>
        </div>

        <div className="success__actions">
          <Link to={`/receipt/${order.id}`} className="btn btn-primary">
            View receipt
          </Link>
          <button type="button" className="btn btn-ghost" onClick={reorder}>
            Order this again
          </button>
          <Link to="/" className="btn btn-ghost">
            Back to menu
          </Link>
        </div>
      </section>

      <div className="success-grid">
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
          <p className="track__note">
            <TulsiLeaf size={13} /> This demo advances the status on its own
            every few seconds. In the real storefront each step arrives as a
            WhatsApp message.
          </p>
        </section>

        <section className="card summary-card" aria-label="Order summary">
          <h2 className="summary-card__title">What is coming</h2>
          <ul className="mini-lines mini-lines--roomy">
            {order.lines.map((l) => (
              <li key={l.id}>
                <span className="veg-mark" aria-hidden="true" />
                <span className="mini-lines__name">
                  {l.name} <em>× {l.qty}</em>
                </span>
                <span className="rupee">{rupees(l.price * l.qty)}</span>
              </li>
            ))}
          </ul>

          <div className="summary-card__total">
            <span>Total paid via {order.payment.label.toLowerCase()}</span>
            <strong className="rupee">{rupees(order.bill.total)}</strong>
          </div>

          <div className="summary-card__addr">
            <h3>Delivering to</h3>
            <p>
              {order.customer.house}
              <br />
              {order.customer.area}
              {order.customer.landmark
                ? `, near ${order.customer.landmark}`
                : ""}
              <br />
              {order.customer.city} — {order.customer.pincode}
            </p>
            {order.note && <p className="summary-card__note">“{order.note}”</p>}
          </div>

          {order.donate && (
            <p className="summary-card__donate">
              <Lotus size={15} /> ₹5 of this order goes to the gaushala at Raman
              Reti. Thank you.
            </p>
          )}
        </section>
      </div>

      <section className="signup-invite card">
        <MorPankh size={30} />
        <div>
          <h2>Want your receipts in one place?</h2>
          <p>
            You ordered as a guest — nothing more was needed. Whenever you feel
            like it, sign up with the same number{" "}
            <strong>{maskPhone(order.customer.phone)}</strong> and every past
            order, receipt and support conversation will already be waiting
            there.
          </p>
        </div>
        <Link to="/orders" className="btn btn-ghost">
          See orders on this device
        </Link>
      </section>
    </main>
  );
}
