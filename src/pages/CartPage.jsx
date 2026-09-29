import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../context/cart-context";
import { useCoupons } from "../hooks/useCoupons";
import CouponBox from "../components/CouponBox";
import { useMenu } from "../hooks/useMenu";
import QtyStepper from "../components/QtyStepper";
import DishArt from "../components/DishArt";
import BillSummary from "../components/BillSummary";
import { rupees } from "../utils/format";
import { Cloche, TulsiLeaf } from "../components/Icons";

export default function CartPage() {
  const offers = useCoupons();
  const {
    lines,
    bill,
    coupon,
    applyCoupon,
    removeCoupon,
    couponPending,
    couponRejected,
    instructions,
    add,
    decrement,
    remove,
    clear,
    setInstructions,
  } = useCart();
  const navigate = useNavigate();

  /* Add-ons come from the live menu, and only from kitchens that are open. */
  const { items: menu } = useMenu();
  const suggestions = menu
    .filter((m) => m.availableNow && !lines.some((l) => l.id === m.id))
    .slice(0, 4);

  if (lines.length === 0) {
    return (
      <main className="wrap page page--narrow" id="main">
        <div className="empty-state card empty-state--page">
          <Cloche size={44} />
          <h1 className="section-title">Your cart is empty</h1>
          <Link to="/menu" className="btn btn-primary">
            Back to the menu
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap page" id="main">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/menu">Menu</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">Your order</span>
      </nav>

      <header className="page__head">
        <div>
          <p className="eyebrow">Step 1 of 2</p>
          <h1 className="page__title">Your order</h1>
        </div>
        <button
          type="button"
          className="linkish linkish--danger"
          onClick={clear}
        >
          Clear everything
        </button>
      </header>

      <div className="cart-grid">
        <section className="cart-grid__main" aria-label="Items in your order">
          <ul className="order-lines card">
            {lines.map((line) => {
              return (
                <li key={line.id} className="order-line">
                  <div className="order-line__art">
                    <DishArt item={line} />
                  </div>

                  <div className="order-line__body">
                    <div className="order-line__title">
                      <span className="veg-mark" aria-hidden="true" />
                      <h3>{line.name}</h3>
                    </div>
                    {line.sattvic && (
                      <span className="pill pill-sattvic">
                        <TulsiLeaf size={10} /> No onion–garlic
                      </span>
                    )}
                    <p className="order-line__unit muted">
                      {rupees(line.pricePaise)} each
                    </p>
                    <button
                      type="button"
                      className="linkish linkish--danger"
                      onClick={() => remove(line.id)}
                    >
                      Remove
                    </button>
                  </div>

                  <div className="order-line__controls">
                    <QtyStepper
                      qty={line.qty}
                      label={line.name}
                      onAdd={() => add(line)}
                      onRemove={() => decrement(line.id)}
                    />
                    <strong className="order-line__amount rupee">
                      {rupees(line.pricePaise * line.qty)}
                    </strong>
                  </div>
                </li>
              );
            })}
          </ul>

          {suggestions.length > 0 && (
            <section className="addons card" aria-labelledby="addons-title">
              <h2 id="addons-title" className="addons__title">
                Goes well with this
              </h2>
              <ul className="addons__list">
                {suggestions.map((s) => (
                  <li key={s.id} className="addon">
                    <div className="addon__art">
                      <DishArt item={s} />
                    </div>
                    <div className="addon__body">
                      <p className="addon__name">{s.name}</p>
                      <p className="addon__price rupee">
                        {rupees(s.pricePaise)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="addon__add"
                      onClick={() => add(s)}
                    >
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card note-block" aria-labelledby="notes-title">
            <h2 id="notes-title" className="note-block__title">
              Anything we should know?
            </h2>
            <textarea
              className="textarea"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={220}
              placeholder="Less chilli, extra ghee on the khichdi, please ring the bell twice…"
            />
            <p className="field-hint">
              {220 - instructions.length} characters left
            </p>
          </section>
        </section>

        <aside className="cart-grid__side">
          <div className="card side-card">
            <CouponBox
              coupon={coupon}
              offers={offers}
              pending={couponPending}
              rejected={couponRejected}
              subtotal={bill.subtotal}
              onApply={applyCoupon}
              onRemove={removeCoupon}
            />

            <BillSummary bill={bill} />

            {bill.freeDeliveryGap > 0 && (
              <p className="side-card__ship">
                Add <strong>{rupees(bill.freeDeliveryGap)}</strong> more and
                delivery is on us.
              </p>
            )}

            <button
              type="button"
              className="btn btn-gold btn-block"
              onClick={() => navigate("/checkout")}
            >
              Continue to delivery details
              <svg
                viewBox="0 0 20 20"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                aria-hidden="true"
              >
                <path
                  d="M4 10h11M11 5l5 5-5 5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
