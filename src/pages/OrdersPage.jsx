import { Link } from "react-router-dom";
import { getOrders } from "../utils/orders";
import { getItem } from "../data/menu";
import { useCart } from "../context/cart-context";
import { rupees, formatDateTime, maskPhone } from "../utils/format";
import { MorPankh } from "../components/Motifs";

export default function OrdersPage() {
  const orders = getOrders();
  const { add } = useCart();

  if (orders.length === 0) {
    return (
      <main className="wrap page page--narrow" id="main">
        <div className="empty-state card empty-state--page">
          <MorPankh size={42} />
          <h1 className="section-title">No orders on this device yet</h1>
          <p className="muted">
            Guest orders are kept in this browser so you can pull up a receipt
            without signing in.
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
            Sign up later with {maskPhone(orders[0].customer.phone)} and these
            move into your account, along with receipts and support.
          </p>
        </div>
      </header>

      <ul className="order-history">
        {orders.map((o) => (
          <li key={o.id} className="card history-card">
            <div className="history-card__top">
              <div>
                <strong>{o.id}</strong>
                <p className="muted">{formatDateTime(o.placedAt)}</p>
              </div>
              <strong className="rupee history-card__amt">
                {rupees(o.bill.total)}
              </strong>
            </div>
            <p className="history-card__items">
              {o.lines.map((l) => `${l.qty} × ${l.name}`).join(" · ")}
            </p>
            <div className="history-card__actions">
              <Link to={`/receipt/${o.id}`} className="btn btn-ghost">
                View receipt
              </Link>
              <Link to={`/order/${o.id}`} className="btn btn-ghost">
                Track order
              </Link>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() =>
                  o.lines.forEach((l) => {
                    const item = getItem(l.id);
                    if (item) for (let i = 0; i < l.qty; i++) add(item);
                  })
                }
              >
                Order again
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
