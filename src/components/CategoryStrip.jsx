import { useEffect, useRef } from "react";
import { DishPicture } from "./DishParts";

/**
 * The phone's category selector: one row of round pictures, scrolled sideways,
 * the way food apps lay them out. Each category is shown by one of its own
 * dishes, so the row reads as food rather than as a list of words.
 *
 * Wider screens have the category rail down the left instead (CategoryRail),
 * so this is hidden there by CSS.
 */
export default function CategoryStrip({ categories, cover, active, onSelect }) {
  const listRef = useRef(null);

  /* Keep the highlighted category in view as the reader scrolls the menu.
     Scrolls the row only -- scrollIntoView would move the page as well. */
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector('[aria-current="true"]');
    if (!list || !el) return;
    const left = el.offsetLeft - (list.clientWidth - el.offsetWidth) / 2;
    list.scrollTo({ left, behavior: "smooth" });
  }, [active]);

  if (!categories.length) return null;

  return (
    <nav className="cat-strip" aria-label="Menu categories">
      <ul className="cat-strip__list" ref={listRef}>
        {categories.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={`cat-strip__item ${active === c.id ? "is-active" : ""}`}
              aria-current={active === c.id ? "true" : undefined}
              onClick={() => onSelect(c.id)}
            >
              <span className="cat-strip__pic">
                {cover[c.id] && (
                  <DishPicture item={cover[c.id]} className="cat-strip__img" />
                )}
              </span>
              <span className="cat-strip__name">{c.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
