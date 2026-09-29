import { Link, useParams } from "react-router-dom";
import { useReceipt } from "../hooks/useReceipt";
import {
  rupees,
  rupeesExact,
  maskPhone,
  formatDateTime,
} from "../utils/format";
import { MorPankh, Bansuri } from "../components/Motifs";
import { SELLER } from "../utils/seller";

const STATUS_LABEL = {
  pending_payment: "Awaiting payment",
  paid: "Paid",
  sent_to_kitchen: "With the kitchen",
  preparing: "Being prepared",
  out_for_delivery: "On its way",
  delivered: "Delivered",
  cancelled: "Cancelled",
  failed: "Failed",
};

export default function ReceiptPage() {
  const { id } = useParams();
  const { order, loading } = useReceipt(id);

  if (loading) {
    return (
      <main className="wrap page page--narrow" id="main">
        <div className="empty-state card empty-state--page">
          <span className="spinner spinner--dark" aria-hidden="true" />
          <h1 className="section-title">Fetching your receipt…</h1>
        </div>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="wrap page page--narrow" id="main">
        <div className="empty-state card empty-state--page">
          <MorPankh size={42} />
          <h1 className="section-title">Receipt not found</h1>
          <p className="muted">
            Demo receipts are stored in this browser only.
          </p>
          <Link to="/" className="btn btn-primary">
            Back to the menu
          </Link>
        </div>
      </main>
    );
  }

  /* get_receipt returns one flat row: line items in `items`, every amount in
     integer paise, and the room rather than a street address. */
  const items = order.items || [];
  const shareText = encodeURIComponent(
    `In Room Dining — order ${order.order_no}\n` +
      `${order.place_name}, Room ${order.room_number}\n` +
      `${items.map((l) => `${l.qty} × ${l.name}`).join("\n")}\n` +
      `Total ${rupees(order.total_paise)}`,
  );

  return (
    <main className="wrap page page--narrow" id="main">
      <nav className="crumbs no-print" aria-label="Breadcrumb">
        <Link to="/">Menu</Link>
        <span aria-hidden="true">›</span>
        <Link to={`/order/${order.order_no}`}>Order {order.order_no}</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">Receipt</span>
      </nav>

      <div className="receipt-actions no-print">
        <h1 className="page__title">Receipt</h1>
        <div className="receipt-actions__buttons">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => window.print()}
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M7 9V4h10v5M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
              <rect x="7" y="14" width="10" height="7" rx="1.2" />
            </svg>
            Print / Save as PDF
          </button>
          <a
            className="btn btn-ghost"
            href={`https://wa.me/?text=${shareText}`}
            target="_blank"
            rel="noreferrer"
          >
            Share on WhatsApp
          </a>
        </div>
      </div>

      <article className="receipt" aria-label={`Receipt for order ${order.order_no}`}>
        <header className="receipt__head">
          <span
            className={`receipt__stamp ${order.status === "pending_payment" ? "receipt__stamp--unpaid" : ""}`}
            aria-hidden="true"
          >
            {order.status === "pending_payment" ? "Unpaid" : "Paid"}
          </span>
          <div className="receipt__brand">
            <span className="receipt__mark">
              <MorPankh size={22} />
            </span>
            <div>
              <h2>{SELLER.name}</h2>
            </div>
          </div>
          <p className="receipt__addr">{SELLER.address}</p>
          <p className="receipt__addr">{maskPhone(SELLER.phone)}</p>
          <div className="receipt__flute">
            <Bansuri width={140} />
          </div>
        </header>

        <div className="receipt__meta">
          <div>
            <small>Receipt no.</small>
            <strong>{order.order_no}</strong>
          </div>
          <div>
            <small>Date</small>
            <strong>{formatDateTime(order.created_at)}</strong>
          </div>
          <div>
            <small>Payment</small>
            <strong>
              {order.status === "pending_payment" ? "Not yet paid" : "Paid"}
            </strong>
          </div>
          <div>
            <small>Status</small>
            <strong
              className={order.status === "pending_payment" ? "" : "receipt__paid"}
            >
              {STATUS_LABEL[order.status] ?? order.status}
            </strong>
          </div>
        </div>

        <div className="receipt__to">
          <div>
            <h3>Billed to</h3>
            <p>
              {order.guest_name}
              <br />
              {maskPhone(order.guest_phone)}
            </p>
          </div>
          <div>
            <h3>Delivered to</h3>
            <p>
              {order.place_name}
              <br />
              Room {order.room_number}
            </p>
          </div>
        </div>

        <table className="receipt__table">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col" className="ta-c">
                Qty
              </th>
              <th scope="col" className="ta-r">
                Rate
              </th>
              <th scope="col" className="ta-r">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((l) => (
              <tr key={l.id}>
                <td>
                  <span className="receipt__item">
                    <span className="veg-mark" aria-hidden="true" />
                    <span>
                      {l.name}
                    </span>
                  </span>
                </td>
                <td className="ta-c">{l.qty}</td>
                <td className="ta-r rupee">{rupeesExact(l.unit_price_paise)}</td>
                <td className="ta-r rupee">{rupeesExact(l.line_total_paise)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="receipt__totals">
          <div>
            <dt>Item total</dt>
            <dd className="rupee">{rupeesExact(order.subtotal_paise)}</dd>
          </div>
          {order.discount_paise > 0 && (
            <div className="receipt__save">
              <dt>Coupon {order.coupon_code}</dt>
              <dd className="rupee">− {rupeesExact(order.discount_paise)}</dd>
            </div>
          )}
          <div>
            <dt>Delivery</dt>
            <dd className="rupee">
              {order.delivery_paise === 0 ? "Free" : rupeesExact(order.delivery_paise)}
            </dd>
          </div>
          <div>
            <dt>Packing</dt>
            <dd className="rupee">{rupeesExact(order.packing_paise)}</dd>
          </div>
          <div>
            <dt>CGST 2.5% + SGST 2.5%</dt>
            <dd className="rupee">{rupeesExact(order.tax_paise)}</dd>
          </div>
          <div className="receipt__grand">
            <dt>{order.status === "pending_payment" ? "Total due" : "Total paid"}</dt>
            <dd className="rupee">{rupeesExact(order.total_paise)}</dd>
          </div>
        </dl>

        {order.note && (
          <p className="receipt__note">
            <strong>Your note:</strong> “{order.note}”
          </p>
        )}

        <footer className="receipt__foot">
          <p>
            Thank you for eating with us. Questions about this order? WhatsApp
            us the receipt number and we will pick it up from there.
          </p>
          <p className="receipt__demo">
            Demo receipt · Not a valid tax invoice
          </p>
        </footer>
      </article>

      <div className="receipt-back no-print">
        <Link to="/" className="btn btn-primary">
          Order something else
        </Link>
      </div>
    </main>
  );
}
