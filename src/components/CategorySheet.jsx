import { useEffect, useRef } from "react";
import { CATEGORIES } from "../data/menu";
import { CategoryGlyph } from "./Motifs";

/**
 * The category sheet behind the "Menu" button — thumb-reachable, one tap to
 * jump anywhere in the menu, one tap to dismiss.
 */
export default function CategorySheet({
  open,
  counts,
  active,
  onSelect,
  onClose,
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const { style } = document.body;
    const prev = style.overflow;
    style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => {
      style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const rows = CATEGORIES.filter((c) => (counts[c.id] || 0) > 0);
  const total = rows.reduce((n, c) => n + counts[c.id], 0);

  return (
    <div
      className="sheet"
      role="dialog"
      aria-modal="true"
      aria-label="Menu categories"
    >
      <button
        type="button"
        className="sheet__scrim"
        onClick={onClose}
        aria-label="Close menu"
      />

      <div className="sheet__panel" ref={panelRef} tabIndex={-1}>
        <span className="sheet__grip" aria-hidden="true" />

        <div className="sheet__head">
          <h2>Our Menu</h2>
          <span>{total} dishes</span>
        </div>

        <ul className="sheet__list">
          {rows.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={`sheet__row ${active === c.id ? "is-active" : ""}`}
                onClick={() => {
                  onSelect(c.id);
                  onClose();
                }}
              >
                <span className="sheet__glyph">
                  <CategoryGlyph icon={c.icon} size={20} />
                </span>
                <span className="sheet__text">
                  <strong>{c.name}</strong>
                  <em className="deva">{c.hindi}</em>
                </span>
                <span className="sheet__count">{counts[c.id]}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="sheet__foot">
          <button type="button" className="sheet__close" onClick={onClose}>
            <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
              <path
                d="M3 3l10 10M13 3L3 13"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
