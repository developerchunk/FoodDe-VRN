import { rupees } from "../utils/format";
import { ChevronIcon } from "./Icons";

/* The bill folded to its one number. The breakdown — food, coupon, delivery,
   packing, GST — is there for whoever opens it. */
export default function BillSummary({ bill }) {
  return (
    <details className="card co-bill">
      <summary className="co-bill__sum">
        <span className="co-bill__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" strokeLinejoin="round" />
            <path d="M9 8h6M9 12h6" strokeLinecap="round" />
          </svg>
        </span>
        <span className="co-bill__lead">
          <strong>
            To pay <span className="rupee">{rupees(bill.total)}</span>
          </strong>
          {bill.discount > 0 && <small>{rupees(bill.discount)} saved on the total</small>}
        </span>
        <ChevronIcon size={18} className="co-bill__chev" />
      </summary>

      <div className="co-bill__rows">
        <div className="co-bill__row">
          <span>Item total</span>
          <span className="rupee">{rupees(bill.subtotal)}</span>
        </div>
        {bill.discount > 0 && (
          <div className="co-bill__row co-bill__row--off">
            <span>Coupon {bill.couponCode}</span>
            <span className="rupee">−{rupees(bill.discount)}</span>
          </div>
        )}
        <div className="co-bill__row">
          <span>Delivery</span>
          <span className="rupee">{bill.delivery === 0 ? "Free" : rupees(bill.delivery)}</span>
        </div>
        {bill.packing > 0 && (
          <div className="co-bill__row">
            <span>Packing</span>
            <span className="rupee">{rupees(bill.packing)}</span>
          </div>
        )}
        <div className="co-bill__row">
          <span>GST (5%)</span>
          <span className="rupee">{rupees(bill.gst)}</span>
        </div>
        <div className="co-bill__row co-bill__row--total">
          <span>To pay</span>
          <span className="rupee">{rupees(bill.total)}</span>
        </div>
      </div>
    </details>
  );
}
