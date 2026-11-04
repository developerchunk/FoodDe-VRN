import { useEffect, useRef } from "react";

/**
 * A bottom sheet on a phone, a centred panel on a wide screen. The scrim,
 * Escape and the close button all dismiss it, so there is no way to get stuck
 * behind one. Same look as the menu's category sheet.
 */
export default function Sheet({ open, title, onClose, children }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
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

  return (
    <div className="sheet sheet--form" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="sheet__scrim" onClick={onClose} aria-label="Close" />
      <div className="sheet__panel" ref={panelRef} tabIndex={-1}>
        <span className="sheet__grip" aria-hidden="true" />
        <div className="sheet__head">
          <h2>{title}</h2>
          <button type="button" className="sheet__x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="sheet__body">{children}</div>
      </div>
    </div>
  );
}
