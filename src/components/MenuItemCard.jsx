import DishArt from "./DishArt";
import QtyStepper from "./QtyStepper";
import { useCart } from "../context/cart-context";
import { rupees } from "../utils/format";
import { TulsiLeaf } from "./Motifs";

const TAG_META = {
  bestseller: { label: "Most loved", cls: "pill-best" },
  new: { label: "New", cls: "pill-new" },
  spicy: { label: "Spicy", cls: "pill-spicy" },
  seasonal: { label: "Seasonal", cls: "pill-jain" },
  "sattvic-classic": { label: "Braj classic", cls: "pill-jain" },
};

/**
 * Info on the left, dish on the right, Add button straddling the foot of the
 * image — the arrangement that reads fastest on a phone held in one hand.
 */
export default function MenuItemCard({ item }) {
  const { add, decrement, qtyOf } = useCart();
  const qty = qtyOf(item.id);

  return (
    <article className={`dish ${qty ? "is-in-cart" : ""}`}>
      <div className="dish__info">
        <div className="dish__head">
          <span
            className="veg-mark"
            title="Pure vegetarian"
            aria-label="Pure vegetarian"
          />
          {(item.tags || []).map((t) =>
            TAG_META[t] ? (
              <span key={t} className={`pill ${TAG_META[t].cls}`}>
                {TAG_META[t].label}
              </span>
            ) : null,
          )}
        </div>

        <h3 className="dish__name">{item.name}</h3>
        <p className="dish__hindi deva">{item.hindi}</p>

        {item.sattvic && (
          <p className="dish__sattvic">
            <TulsiLeaf size={11} /> No onion–garlic
          </p>
        )}

        <p className="dish__price">
          <strong className="rupee">{rupees(item.price)}</strong>
          {item.serves && <span className="dish__serves">{item.serves}</span>}
        </p>

        <p className="dish__desc">{item.desc}</p>
      </div>

      <div className="dish__media">
        <DishArt item={item} className="dish__art" />

        <div className="dish__action">
          {qty > 0 ? (
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
              ADD
              <svg
                viewBox="0 0 16 16"
                width="11"
                height="11"
                aria-hidden="true"
              >
                <rect
                  x="2.5"
                  y="7"
                  width="11"
                  height="2"
                  rx="1"
                  fill="currentColor"
                />
                <rect
                  x="7"
                  y="2.5"
                  width="2"
                  height="11"
                  rx="1"
                  fill="currentColor"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
