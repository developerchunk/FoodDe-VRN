import { useEffect, useId, useRef, useState } from "react";
import { BuildingIcon, ChefIcon, ChevronIcon, ScooterIcon } from "./Icons";

/* Registration forms for the three kinds of partner. */
const PARTNER_FORMS = [
  {
    label: "Accommodation partner",
    icon: <BuildingIcon size={18} />,
    url: "https://forms.gle/A61va1QnXL2xRmC56",
  },
  {
    label: "Kitchen partner",
    icon: <ChefIcon size={18} />,
    url: "https://forms.gle/Fo3eRs43zCksTk3B8",
  },
  {
    label: "Delivery partner",
    icon: <ScooterIcon size={18} />,
    url: "https://forms.gle/2NvZchnwCeuLbNey9",
  },
];

/**
 * "Partner with us" on the home hero: one button that opens the three
 * registration forms. The panel opens upward because the hero clips anything
 * that spills past its bottom edge.
 */
export default function PartnerMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div className="partner-menu" ref={wrapRef}>
      <button
        type="button"
        className="partner-menu__button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        Partner with us
        <ChevronIcon size={16} />
      </button>

      {open && (
        <div className="partner-menu__panel" id={panelId}>
          {PARTNER_FORMS.map((f) => (
            <a
              key={f.label}
              className="partner-menu__item"
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
            >
              {f.icon} {f.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
