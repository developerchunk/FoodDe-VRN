import { useState } from "react";
import { rupees } from "../utils/format";

/**
 * Offers on this order.
 *
 * The component never decides whether a code is good or what it saves. The
 * database prices the order and, unless the guest has picked a code, applies
 * the best coupon the order qualifies for by itself. This renders that answer:
 * what is applied and whether it was automatic, a code it refused, and the
 * other offers a guest may switch to.
 *
 * One coupon per order, always: choosing another replaces the one applied,
 * and Remove -- automatic or not -- leaves the order with none.
 */
export default function CouponBox({
  coupon,
  bill,
  offers,
  pending,
  rejected,
  onApply,
  onRemove,
  onReset,
}) {
  const [code, setCode] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    onApply(code);
    setCode("");
  };

  const applied = bill.discount > 0 ? bill.couponCode : null;
  /* A chosen code still being priced shows as that code, checking. */
  const showing = pending ? coupon : applied;
  const others = offers.filter((c) => c.code !== showing);

  return (
    <section className="coupon" aria-labelledby="coupon-title">
      <h3 id="coupon-title" className="side-card__title">
        Offers
      </h3>

      {showing && (
        <div className="coupon__applied" aria-live="polite">
          <div>
            <strong>{showing}</strong>
            <p>
              {pending
                ? "Checking…"
                : `${bill.couponAuto ? "Applied automatically" : "Applied"} · you save ${rupees(bill.discount)}`}
            </p>
          </div>
          {!pending && (
            <button type="button" className="linkish linkish--danger" onClick={onRemove}>
              Remove
            </button>
          )}
        </div>
      )}

      {rejected && (
        <p className="coupon__rejected" role="alert">
          <strong>{coupon}</strong> cannot be used on this order
          {applied ? ", so the best other offer is applied." : "."}
          <button type="button" className="linkish" onClick={onReset}>
            Clear
          </button>
        </p>
      )}

      <form className="coupon__form" onSubmit={submit}>
        <input
          className="input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={showing ? "Have another code?" : "Enter code"}
          aria-label="Coupon code"
          autoCapitalize="characters"
          autoComplete="off"
        />
        <button type="submit" className="btn btn-teal" disabled={!code.trim()}>
          Apply
        </button>
      </form>

      {coupon === "" && others.length > 0 && (
        <p className="coupon__note">No coupon on this order. Tap an offer to use one.</p>
      )}
      {showing && others.length > 0 && (
        <p className="coupon__note">One coupon per order. Choosing another replaces {showing}.</p>
      )}

      {/* Whatever is active in the database. No offers, nothing to show. */}
      {others.length > 0 && (
        <ul className="coupon__hints">
          {others.map((c) => (
            <li key={c.code}>
              <button type="button" onClick={() => onApply(c.code)}>
                <strong>{c.code}</strong>
                <span>
                  {c.label}
                  {bill.subtotal < c.min_order_paise &&
                    ` · needs ${rupees(c.min_order_paise)}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
