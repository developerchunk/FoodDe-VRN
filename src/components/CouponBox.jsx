import { useState } from "react";
import { rupees } from "../utils/format";

/**
 * Applying a coupon.
 *
 * The component never decides whether a code is good or what it saves. It hands
 * the code to the cart, the cart asks the database, and this renders whichever
 * of the three answers comes back: still asking, applied, or worth nothing here.
 */
export default function CouponBox({
  coupon,
  offers,
  pending,
  rejected,
  subtotal,
  onApply,
  onRemove,
}) {
  const [code, setCode] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    onApply(code);
    setCode("");
  };

  if (coupon && !rejected) {
    return (
      <section className="coupon" aria-labelledby="coupon-title">
        <h3 id="coupon-title" className="side-card__title">
          Coupon
        </h3>
        <div className="coupon__applied">
          <div>
            <strong>{coupon}</strong>
            <p>{pending ? "Checking…" : "Applied"}</p>
          </div>
          <button type="button" className="linkish linkish--danger" onClick={onRemove}>
            Remove
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="coupon" aria-labelledby="coupon-title">
      <h3 id="coupon-title" className="side-card__title">
        Have a code?
      </h3>
      <form className="coupon__form" onSubmit={submit}>
        <input
          className="input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Enter code"
          aria-label="Coupon code"
          autoCapitalize="characters"
          autoComplete="off"
        />
        <button type="submit" className="btn btn-teal" disabled={!code.trim()}>
          Apply
        </button>
      </form>

      {rejected && (
        <p className="coupon__rejected" role="alert">
          <strong>{coupon}</strong> cannot be used on this order.
          <button type="button" className="linkish" onClick={onRemove}>
            Clear
          </button>
        </p>
      )}

      {/* Whatever is active in the database. No offers, nothing to show. */}
      {offers.length > 0 && (
        <ul className="coupon__hints">
          {offers.map((c) => (
            <li key={c.code}>
              <button type="button" onClick={() => onApply(c.code)}>
                <strong>{c.code}</strong>
                <span>
                  {c.label}
                  {subtotal < c.min_order_paise &&
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
