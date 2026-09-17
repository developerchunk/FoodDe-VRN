import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../context/cart-context";
import { getItem, MENU } from "../data/menu";
import QtyStepper from "../components/QtyStepper";
import DishArt from "../components/DishArt";
import BillSummary from "../components/BillSummary";
import { rupees } from "../utils/format";
import { COUPONS } from "../utils/pricing";
import { MorPankh, TulsiLeaf, Lotus } from "../components/Motifs";

export default function CartPage() {
  const {
    lines,
    bill,
    coupon,
    donate,
    instructions,
    add,
    decrement,
    remove,
    clear,
    applyCoupon,
    removeCoupon,
    setDonate,
    setInstructions,
  } = useCart();
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  const suggestions = MENU.filter(
    (m) =>
      !lines.some((l) => l.id === m.id) &&
      ["vr-07", "sw-01", "sw-03", "sm-08", "vr-03", "ff-09"].includes(m.id),
  ).slice(0, 4);

  if (lines.length === 0) {
    return (
      <main className="wrap page page--narrow" id="main">
        <div className="empty-state card empty-state--page">
          <MorPankh size={44} />
          <h1 className="section-title">Your thali is empty</h1>
          <p className="muted">
            Nothing added yet. The kachoris are still warm if you would like to
            start there.
          </p>
          <Link to="/" className="btn btn-primary">
            Back to the menu
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap page" id="main">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Menu</Link>
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
              const item = getItem(line.id);
              return (
                <li key={line.id} className="order-line">
                  <div className="order-line__art">
                    {item && <DishArt item={item} />}
                  </div>

                  <div className="order-line__body">
                    <div className="order-line__title">
                      <span className="veg-mark" aria-hidden="true" />
                      <h3>{line.name}</h3>
                    </div>
                    {line.hindi && (
                      <p className="order-line__hindi deva">{line.hindi}</p>
                    )}
                    {line.sattvic && (
                      <span className="pill pill-sattvic">
                        <TulsiLeaf size={10} /> No onion–garlic
                      </span>
                    )}
                    <p className="order-line__unit muted">
                      {rupees(line.price)} each
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
                      onAdd={() => item && add(item)}
                      onRemove={() => decrement(line.id)}
                    />
                    <strong className="order-line__amount rupee">
                      {rupees(line.price * line.qty)}
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
                      <p className="addon__price rupee">{rupees(s.price)}</p>
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
            <section className="coupon" aria-labelledby="coupon-title">
              <h3 id="coupon-title" className="side-card__title">
                Have a code?
              </h3>
              {coupon ? (
                <div className="coupon__applied">
                  <div>
                    <strong>{coupon}</strong>
                    <p>{COUPONS[coupon].label}</p>
                  </div>
                  <button
                    type="button"
                    className="linkish linkish--danger"
                    onClick={removeCoupon}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <>
                  <form
                    className="coupon__form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (applyCoupon(code)) setCode("");
                    }}
                  >
                    <input
                      className="input"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="RADHE50"
                      aria-label="Coupon code"
                    />
                    <button type="submit" className="btn btn-ghost">
                      Apply
                    </button>
                  </form>
                  <ul className="coupon__hints">
                    {Object.values(COUPONS).map((c) => (
                      <li key={c.code}>
                        <button
                          type="button"
                          onClick={() => applyCoupon(c.code)}
                        >
                          <strong>{c.code}</strong>
                          <span>{c.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <label className="donate">
              <input
                type="checkbox"
                checked={donate}
                onChange={(e) => setDonate(e.target.checked)}
              />
              <span className="donate__box" aria-hidden="true" />
              <span className="donate__text">
                <strong>
                  <Lotus size={15} /> Add ₹5 for the local gaushala
                </strong>
                <small>
                  We pass it on to the gaushala at Raman Reti every Purnima.
                </small>
              </span>
            </label>

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
            <p className="side-card__fine">
              No sign-up needed. We only ask for three things on the next page.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
