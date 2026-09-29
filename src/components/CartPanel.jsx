import { Link } from "react-router-dom";
import { useCart } from "../context/cart-context";
import QtyStepper from "./QtyStepper";
import { rupees } from "../utils/format";
import { ArrowIcon, CartIcon } from "./Icons";

/**
 * The cart beside the menu. The head and the foot (total and Review order)
 * stay put; only the list of lines scrolls, so a long order never pushes the
 * button out of reach.
 */
export default function CartPanel() {
  const { lines, bill, add, decrement, clear } = useCart();

  return (
    <div className="cart-panel card" aria-label="Your order">
      <div className="cart-panel__head">
        <h2 className="cart-panel__title">
          Your order
          {bill.itemCount > 0 && (
            <span className="cart-panel__count">{bill.itemCount}</span>
          )}
        </h2>
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
          <CartIcon size={26} />
          <p>Your cart is empty</p>
        </div>
      ) : (
        <>
          <ul className="cart-panel__lines">
            {lines.map((line) => (
              <li key={line.id} className="cart-line">
                <span className="veg-mark" aria-hidden="true" />
                <p className="cart-line__name">{line.name}</p>
                <strong className="cart-line__amt rupee">
                  {rupees(line.pricePaise * line.qty)}
                </strong>
                {/* the unit price only adds anything once there are several */}
                <p className="cart-line__unit">
                  {line.qty > 1 && `${rupees(line.pricePaise)} × ${line.qty}`}
                </p>
                <QtyStepper
                  size="sm"
                  qty={line.qty}
                  label={line.name}
                  onAdd={() => add(line)}
                  onRemove={() => decrement(line.id)}
                />
              </li>
            ))}
          </ul>

          <div className="cart-panel__foot">
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
              <span>
                Item total
                <small>+ delivery &amp; taxes</small>
              </span>
              <strong className="rupee">{rupees(bill.subtotal)}</strong>
            </div>

            <Link to="/cart" className="btn btn-gold btn-block">
              Review order
              <ArrowIcon size={16} />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
