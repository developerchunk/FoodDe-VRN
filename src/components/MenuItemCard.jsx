import DishArt from "./DishArt";
import QtyStepper from "./QtyStepper";
import { useCart } from "../context/cart-context";
import { rupees } from "../utils/format";
import { CartIcon, ClockIcon, StarIcon, TulsiLeaf } from "./Icons";

/**
 * Picture on top, then name, a line of description, and price with the Add
 * button along the foot. Every dish is vegetarian, so the green mark is the
 * only diet sign there is.
 */
export default function MenuItemCard({ item }) {
  const { add, decrement, qtyOf } = useCart();
  const qty = qtyOf(item.id);

  return (
    <article
      className={`dish ${qty ? "is-in-cart" : ""} ${item.availableNow ? "" : "is-unavailable"}`}
    >
      <div className="dish__media">
        {item.imageUrl ? (
          <img
            className="dish__art"
            src={item.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : (
          <DishArt item={item} className="dish__art" />
        )}

        {item.loved && (
          <span className="badge badge--loved">
            <StarIcon size={11} /> Most loved
          </span>
        )}
        <span className="badge badge--veg" title="Pure vegetarian">
          <span className="veg-mark" aria-hidden="true" />
          <span className="sr-only">Pure vegetarian</span>
        </span>
      </div>

      <div className="dish__body">
        <h3 className="dish__name">{item.name}</h3>
        {item.desc && <p className="dish__desc">{item.desc}</p>}

        {item.mealWindow && (
          <p className="dish__meal" title="When this dish is served">
            <ClockIcon size={11} /> {item.mealWindow}
          </p>
        )}

        {(item.sattvic || item.serves) && (
          <p className="dish__meta">
            {item.sattvic && (
              <span className="dish__sattvic">
                <TulsiLeaf size={10} /> No onion–garlic
              </span>
            )}
            {item.serves && (
              <span className="dish__time">
                <ClockIcon size={13} /> {item.serves}
              </span>
            )}
          </p>
        )}

        <div className="dish__foot">
          <strong className="dish__price rupee">
            {rupees(item.pricePaise)}
          </strong>

          {!item.availableNow ? (
            <span className="dish__closed">Unavailable</span>
          ) : qty > 0 ? (
            <QtyStepper
              qty={qty}
              label={item.name}
              onAdd={() => add(item)}
              onRemove={() => decrement(item.id)}
            />
          ) : (
            <button
              type="button"
              className="dish__add"
              onClick={() => add(item)}
            >
              <CartIcon size={16} />
              Add to Cart
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
