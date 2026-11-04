import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useCart } from "../context/cart-context";
import { useCoupons } from "../hooks/useCoupons";
import { rupees } from "../utils/format";
import { ArrowIcon } from "../components/Icons";

/**
 * Every offer, on a screen of its own, reached from the cart.
 *
 * The page never decides whether a code is good or what it saves. The
 * database prices the order and, unless the guest has picked a code, applies
 * the best coupon the order qualifies for by itself. This renders that answer.
 * One coupon per order: choosing another replaces the one applied.
 */
export default function CouponsPage() {
  const offers = useCoupons();
  const {
    lines,
    bill,
    coupon,
    applyCoupon,
    removeCoupon,
    resetCoupon,
    couponPending,
    couponRejected,
  } = useCart();
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  if (lines.length === 0) return <Navigate to="/cart" replace />;

  const applied = bill.discount > 0 ? bill.couponCode : null;
  /* A chosen code still being priced shows as that code, checking. */
  const showing = couponPending ? coupon : applied;
  const appliedOffer = offers.find((c) => c.code === showing);
  const others = offers.filter((c) => c.code !== showing);

  /* Back to the cart, where the bill shows what it came to. */
  const choose = (value) => {
    applyCoupon(value);
    navigate("/cart");
  };

  return (
    <main className="wrap page co-page" id="main">
      <header className="co-top">
        <Link to="/cart" className="co-top__back" aria-label="Back to the cart">
          <ArrowIcon size={20} />
        </Link>
        <div>
          <h1 className="co-top__title">Apply coupon</h1>
          <p className="co-top__sub">
            Your cart: <span className="rupee">{rupees(bill.subtotal)}</span>
          </p>
        </div>
      </header>

      <form
        className="coupons__form"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) choose(code);
        }}
      >
        <input
          className="coupons__input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Enter coupon code"
          aria-label="Coupon code"
          autoCapitalize="characters"
          autoComplete="off"
        />
        <button type="submit" className="coupons__apply" disabled={!code.trim()}>
          Apply
        </button>
      </form>

      {couponRejected && (
        <p className="coupon__rejected" role="alert">
          <strong>{coupon}</strong> cannot be used on this order
          {applied ? ", so the best other offer is applied." : "."}{" "}
          <button type="button" className="linkish" onClick={resetCoupon}>
            Clear
          </button>
        </p>
      )}

      {showing && (
        <section className="coupons__group">
          <h2 className="coupons__label">Applied coupon</h2>
          <article className="coupon-card is-applied">
            <div className="coupon-card__head">
              <strong className="coupon-card__code">{showing}</strong>
              {!couponPending && (
                <button type="button" className="coupon-card__act is-remove" onClick={removeCoupon}>
                  Remove
                </button>
              )}
            </div>
            <p className="coupon-card__save">
              {couponPending ? "Checking…" : `Save ${rupees(bill.discount)} on this order`}
            </p>
            {appliedOffer?.label && <p className="coupon-card__label">{appliedOffer.label}</p>}
          </article>
        </section>
      )}

      <section className="coupons__group">
        <h2 className="coupons__label">{showing ? "More offers" : "Offers"}</h2>
        {others.length === 0 ? (
          <p className="muted">No other offers right now.</p>
        ) : (
          others.map((c) => {
            const short = Math.max(c.min_order_paise - bill.subtotal, 0);
            return (
              <article key={c.code} className={`coupon-card ${short ? "is-locked" : ""}`}>
                <div className="coupon-card__head">
                  <strong className="coupon-card__code">{c.code}</strong>
                  <button
                    type="button"
                    className="coupon-card__act"
                    disabled={short > 0}
                    onClick={() => choose(c.code)}
                  >
                    Apply
                  </button>
                </div>
                {short > 0 && (
                  <p className="coupon-card__save">Add {rupees(short)} more to use this</p>
                )}
                <p className="coupon-card__label">{c.label}</p>
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}
