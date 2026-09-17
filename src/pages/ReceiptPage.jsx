import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { getOrder } from "../utils/orders";
import {
  rupees,
  rupeesExact,
  maskPhone,
  formatDateTime,
} from "../utils/format";
import { MorPankh, Bansuri, TulsiLeaf, Lotus } from "../components/Motifs";

export default function ReceiptPage() {
  const { id } = useParams();
  const order = useMemo(() => getOrder(id), [id]);

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

  const { customer, bill, lines } = order;
  const shareText = encodeURIComponent(
    `Braj Rasoi — order ${order.id}\n${lines.map((l) => `${l.qty} × ${l.name}`).join("\n")}\nTotal ${rupees(bill.total)}`,
  );

  return (
    <main className="wrap page page--narrow" id="main">
      <nav className="crumbs no-print" aria-label="Breadcrumb">
        <Link to="/">Menu</Link>
        <span aria-hidden="true">›</span>
        <Link to={`/order/${order.id}`}>Order {order.id}</Link>
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

      <article className="receipt" aria-label={`Receipt for order ${order.id}`}>
        <header className="receipt__head">
          <span className="receipt__stamp" aria-hidden="true">
            Confirmed
          </span>
          <div className="receipt__brand">
            <span className="receipt__mark">
              <MorPankh size={22} />
            </span>
            <div>
              <h2>Braj Rasoi</h2>
              <p className="deva">वृन्दावन धाम</p>
            </div>
          </div>
          <p className="receipt__addr">
            Gali No. 4, Parikrama Marg, Vrindavan 281121
            <br />
            WhatsApp +91 98765 43210 · Daily 7:00 am – 10:30 pm
          </p>
          <div className="receipt__flute">
            <Bansuri width={140} />
          </div>
        </header>

        <div className="receipt__meta">
          <div>
            <small>Receipt no.</small>
            <strong>{order.id}</strong>
          </div>
          <div>
            <small>Date</small>
            <strong>{formatDateTime(order.placedAt)}</strong>
          </div>
          <div>
            <small>Payment</small>
            <strong>{order.payment.label}</strong>
          </div>
          <div>
            <small>Status</small>
            <strong className="receipt__paid">Confirmed</strong>
          </div>
        </div>

        <div className="receipt__to">
          <div>
            <h3>Billed to</h3>
            <p>
              {customer.name}
              <br />
              {maskPhone(customer.phone)}
            </p>
          </div>
          <div>
            <h3>Delivered to</h3>
            <p>
              {customer.house}
              <br />
              {customer.area}
              {customer.landmark ? `, near ${customer.landmark}` : ""}
              <br />
              {customer.city} — {customer.pincode}
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
            {lines.map((l) => (
              <tr key={l.id}>
                <td>
                  <span className="receipt__item">
                    <span className="veg-mark" aria-hidden="true" />
                    <span>
                      {l.name}
                      {l.sattvic && (
                        <em className="receipt__sattvic">
                          <TulsiLeaf size={9} /> no onion–garlic
                        </em>
                      )}
                    </span>
                  </span>
                </td>
                <td className="ta-c">{l.qty}</td>
                <td className="ta-r rupee">{rupeesExact(l.price)}</td>
                <td className="ta-r rupee">{rupeesExact(l.price * l.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="receipt__totals">
          <div>
            <dt>Item total</dt>
            <dd className="rupee">{rupeesExact(bill.subtotal)}</dd>
          </div>
          {bill.discount > 0 && (
            <div className="receipt__save">
              <dt>Coupon {bill.couponCode}</dt>
              <dd className="rupee">− {rupeesExact(bill.discount)}</dd>
            </div>
          )}
          <div>
            <dt>Delivery</dt>
            <dd className="rupee">
              {bill.delivery === 0 ? "Free" : rupeesExact(bill.delivery)}
            </dd>
          </div>
          <div>
            <dt>Packing</dt>
            <dd className="rupee">{rupeesExact(bill.packing)}</dd>
          </div>
          <div>
            <dt>CGST 2.5% + SGST 2.5%</dt>
            <dd className="rupee">{rupeesExact(bill.gst)}</dd>
          </div>
          {bill.donation > 0 && (
            <div>
              <dt>Gaushala contribution</dt>
              <dd className="rupee">{rupeesExact(bill.donation)}</dd>
            </div>
          )}
          <div className="receipt__grand">
            <dt>Total paid</dt>
            <dd className="rupee">{rupeesExact(bill.total)}</dd>
          </div>
        </dl>

        {order.note && (
          <p className="receipt__note">
            <strong>Your note:</strong> “{order.note}”
          </p>
        )}

        <footer className="receipt__foot">
          <p className="receipt__thanks deva">राधे राधे 🙏</p>
          <p>
            Thank you for eating with us. Questions about this order? WhatsApp
            us the receipt number and we will pick it up from there.
          </p>
          {bill.donation > 0 && (
            <p className="receipt__gaushala">
              <Lotus size={14} /> ₹{bill.donation} from this order goes to the
              gaushala at Raman Reti.
            </p>
          )}
          <p className="receipt__demo">
            Demo receipt · FSSAI (demo) 1234567890123 · GSTIN (demo)
            09ABCDE1234F1Z5 · Not a valid tax invoice
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
