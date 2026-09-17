import { rupees } from "../utils/format";

export default function BillSummary({ bill, title = "Bill details" }) {
  return (
    <div className="bill">
      <h3 className="bill__title">{title}</h3>
      <dl className="bill__list">
        <div className="bill__row">
          <dt>Item total</dt>
          <dd className="rupee">{rupees(bill.subtotal)}</dd>
        </div>
        {bill.discount > 0 && (
          <div className="bill__row bill__row--save">
            <dt>Coupon {bill.couponCode}</dt>
            <dd className="rupee">− {rupees(bill.discount)}</dd>
          </div>
        )}
        <div className="bill__row">
          <dt>Delivery</dt>
          <dd className="rupee">
            {bill.delivery === 0 ? (
              <span className="bill__free">Free</span>
            ) : (
              rupees(bill.delivery)
            )}
          </dd>
        </div>
        <div className="bill__row">
          <dt>Packing</dt>
          <dd className="rupee">{rupees(bill.packing)}</dd>
        </div>
        <div className="bill__row">
          <dt>GST (5%)</dt>
          <dd className="rupee">{rupees(bill.gst)}</dd>
        </div>
        {bill.donation > 0 && (
          <div className="bill__row">
            <dt>Gaushala contribution</dt>
            <dd className="rupee">{rupees(bill.donation)}</dd>
          </div>
        )}
        <div className="bill__row bill__row--total">
          <dt>To pay</dt>
          <dd className="rupee">{rupees(bill.total)}</dd>
        </div>
      </dl>
    </div>
  );
}
