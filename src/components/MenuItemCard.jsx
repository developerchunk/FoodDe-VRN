import { useState } from "react";
import DishSheet from "./DishSheet";
import { AddControl, DishPicture } from "./DishParts";
import { useCart } from "../context/cart-context";
import { rupees } from "../utils/format";
import { ChiliIcon, ClockIcon, StarIcon, TulsiLeaf } from "./Icons";

/**
 * One dish. Two shapes from the same markup:
 *
 *  - wider screens: a card, square picture on top, price and Add along the foot;
 *  - a phone: a row, the words on the left and the square picture on the
 *    right with Add sitting on its lower edge -- the layout people already
 *    know from every food app, and one that fits twice as many dishes on a
 *    screen.
 *
 * The Add control is rendered in both places and CSS shows one per width, so
 * neither layout has to reach into the other. Tapping anywhere else on the
 * dish opens all of it in a sheet (DishSheet).
 *
 * `showAdd={false}` is the home page's showcase: the dish and its price, with
 * ordering left to the menu.
 */
export default function MenuItemCard({ item, showAdd = true }) {
  const { qtyOf } = useCart();
  const qty = qtyOf(item.id);
  const [open, setOpen] = useState(false);

  /* Taps on Add or the stepper stay with them; anything else opens the dish. */
  const openUnlessControl = (e) => {
    if (e.target.closest(".dish__action")) return;
    setOpen(true);
  };

  return (
    <>
      <article
        className={`dish ${qty ? "is-in-cart" : ""} ${item.availableNow ? "" : "is-unavailable"}`}
        onClick={openUnlessControl}
      >
        <div className="dish__media">
          <DishPicture item={item} />
          {item.loved && (
            <span className="badge badge--loved">
              <StarIcon size={11} /> Most loved
            </span>
          )}
          <span className="badge badge--veg" title="Pure vegetarian">
            <span className="veg-mark" aria-hidden="true" />
            <span className="sr-only">Pure vegetarian</span>
          </span>
          {showAdd && (
            <div className="dish__action dish__action--media">
              <AddControl item={item} size="sm" />
            </div>
          )}
        </div>

        <div className="dish__body">
          {/* the phone row's own veg mark and tags; the card shows them on
              the picture instead */}
          <span className="veg-mark dish__veg" aria-hidden="true" />
          <h3 className="dish__name">
            {/* the keyboard's way in to the details */}
            <button type="button" className="dish__open" onClick={() => setOpen(true)}>
              {item.name}
            </button>
          </h3>

          {(item.loved || item.spicy) && (
            <p className="dish__tags">
              {item.loved && (
                <span className="dish__tag dish__tag--loved">
                  <StarIcon size={11} /> Most loved
                </span>
              )}
              {item.spicy && (
                <span className="dish__tag dish__tag--spicy">
                  <ChiliIcon size={12} /> Spicy
                </span>
              )}
            </p>
          )}

          <strong className="dish__price dish__price--row rupee">{rupees(item.pricePaise)}</strong>

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
            <strong className="dish__price rupee">{rupees(item.pricePaise)}</strong>
            {showAdd && (
              <div className="dish__action dish__action--foot">
                <AddControl item={item} />
              </div>
            )}
          </div>
        </div>
      </article>

      {open && <DishSheet item={item} showAdd={showAdd} onClose={() => setOpen(false)} />}
    </>
  );
}
