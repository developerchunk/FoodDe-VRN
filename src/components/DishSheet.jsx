import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AddControl, DishPicture } from "./DishParts";
import { rupees } from "../utils/format";
import { ChiliIcon, ClockIcon, StarIcon, TulsiLeaf } from "./Icons";

/**
 * Everything about one dish: a bottom sheet on a phone, a centred pop-up on a
 * wider screen (the same element; CSS decides). The middle scrolls, so a long
 * description or ingredient list is read in full rather than cut off, while
 * the price and Add stay in reach at the foot.
 *
 * Closed by the close button, the backdrop or Escape. The page underneath does
 * not scroll while it is open, and focus goes back where it came from.
 */
export default function DishSheet({ item, showAdd = true, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    const before = document.activeElement;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div className="dish-sheet" role="dialog" aria-modal="true" aria-labelledby={`dish-sheet-${item.id}`}>
      <div className="dish-sheet__backdrop" onClick={onClose} />
      <div className={`dish-sheet__panel ${item.availableNow ? "" : "is-unavailable"}`}>
        <span className="dish-sheet__grip" aria-hidden="true" />
        <button
          ref={closeRef}
          type="button"
          className="dish-sheet__close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>

        <div className="dish-sheet__scroll">
          <div className="dish-sheet__media">
            <DishPicture item={item} className="dish-sheet__art" eager />
          </div>

          <div className="dish-sheet__body">
            <p className="dish-sheet__kicker">
              <span className="veg-mark" aria-hidden="true" />
              <span>Pure vegetarian</span>
              {item.categoryName && <span className="dish-sheet__cat">· {item.categoryName}</span>}
            </p>
            <h2 className="dish-sheet__name" id={`dish-sheet-${item.id}`}>
              {item.name}
            </h2>

            {(item.loved || item.spicy || item.sattvic) && (
              <p className="dish__tags dish-sheet__tags">
                {item.loved && (
                  <span className="dish__tag dish__tag--loved">
                    <StarIcon size={11} /> Most loved
                  </span>
                )}
                {item.sattvic && (
                  <span className="dish__tag dish__tag--sattvic">
                    <TulsiLeaf size={10} /> No onion–garlic
                  </span>
                )}
                {item.spicy && (
                  <span className="dish__tag dish__tag--spicy">
                    <ChiliIcon size={12} /> Spicy
                  </span>
                )}
              </p>
            )}

            {(item.mealWindow || item.serves) && (
              <dl className="dish-sheet__facts">
                {item.mealWindow && (
                  <div>
                    <dt>Served</dt>
                    <dd>
                      <ClockIcon size={13} /> {item.mealWindow}
                    </dd>
                  </div>
                )}
                {item.serves && (
                  <div>
                    <dt>Ready in</dt>
                    <dd>about {item.serves}</dd>
                  </div>
                )}
              </dl>
            )}

            {item.desc && (
              <section className="dish-sheet__section">
                <h3>About this dish</h3>
                <p>{item.desc}</p>
              </section>
            )}

            {item.ingredients && (
              <section className="dish-sheet__section">
                <h3>Ingredients</h3>
                <p>{item.ingredients}</p>
              </section>
            )}

            {!item.availableNow && (
              <p className="dish-sheet__note">
                Not being served right now{item.mealWindow ? ` — it is on ${item.mealWindow}` : ""}.
              </p>
            )}
          </div>
        </div>

        <footer className="dish-sheet__foot">
          <strong className="dish-sheet__price rupee">{rupees(item.pricePaise)}</strong>
          {showAdd && (
            <div className="dish__action">
              <AddControl item={item} />
            </div>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
