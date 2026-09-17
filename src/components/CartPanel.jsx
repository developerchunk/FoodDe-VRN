import { Link } from "react-router-dom";
import { useCart } from "../context/cart-context";
import QtyStepper from "./QtyStepper";
import { rupees } from "../utils/format";
import { getItem } from "../data/menu";
import { MorPankh, TulsiLeaf } from "./Motifs";

export default function CartPanel() {
  const { lines, bill, add, decrement, clear } = useCart();

  return (
    <aside className="cart-panel" aria-label="Your order">
      <div className="cart-panel__inner card">
        <div className="cart-panel__head">
          <h2 className="cart-panel__title">Your Thali</h2>
          {lines.length > 0 && (
            <button
              type="button"
              className="linkish linkish--danger"
              onClick={clear}
            >
              Clear
            </button>
          )}
        </div>

        {lines.length === 0 ? (
          <div className="cart-panel__empty">
            <MorPankh size={34} />
            <p className="cart-panel__empty-title">Your thali is empty</p>
            <p className="cart-panel__empty-sub">
              Add a kachori, a thali, a kulhad of lassi — whatever the day is
              asking for.
            </p>
          </div>
        ) : (
          <>
            <ul className="cart-panel__lines">
              {lines.map((line) => {
                const item = getItem(line.id);
                return (
                  <li key={line.id} className="cart-line">
                    <span className="veg-mark" aria-hidden="true" />
                    <div className="cart-line__body">
                      <p className="cart-line__name">{line.name}</p>
                      {line.sattvic && (
                        <p className="cart-line__flag">
                          <TulsiLeaf size={10} /> no onion–garlic
                        </p>
                      )}
                      <p className="cart-line__unit">
                        {rupees(line.price)}{" "}
                        {line.qty > 1 && <span>× {line.qty}</span>}
                      </p>
                    </div>
                    <div className="cart-line__right">
                      <QtyStepper
                        size="sm"
                        qty={line.qty}
                        label={line.name}
                        onAdd={() => item && add(item)}
                        onRemove={() => decrement(line.id)}
                      />
                      <strong className="cart-line__amt rupee">
                        {rupees(line.price * line.qty)}
                      </strong>
                    </div>
                  </li>
                );
              })}
            </ul>

            {bill.freeDeliveryGap > 0 && (
              <div className="freeship">
                <div className="freeship__bar">
                  <span
                    style={{
                      width: `${Math.min((bill.subtotal / 299) * 100, 100)}%`,
                    }}
                  />
                </div>
                <p>
                  Add <strong>{rupees(bill.freeDeliveryGap)}</strong> more for
                  free delivery
                </p>
              </div>
            )}

            <div className="cart-panel__total">
              <span>Item total</span>
              <strong className="rupee">{rupees(bill.subtotal)}</strong>
            </div>
            <p className="cart-panel__fineprint">
              Delivery, packing &amp; taxes calculated at checkout
            </p>

            <Link to="/cart" className="btn btn-gold btn-block">
              Review order
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
            </Link>
          </>
        )}
      </div>
    </aside>
  );
}
