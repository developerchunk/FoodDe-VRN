import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { MenuIcon } from "./Icons";
import SignInButton from "./SignInButton";

/**
 * The header nav, for screens too narrow to show it inline.
 *
 * Below 620px the row of links is hidden, which left Menu, Orders and signing
 * in with no way in at all on a phone — the device almost every guest is
 * holding. This is the same set behind one button.
 */
export default function NavMenu({ hasOrders }) {
  const { pathname } = useLocation();
  /* Which page the menu was opened on. Derived rather than cleared in an
     effect: navigating away closes it because the path no longer matches. */
  const [openedOn, setOpenedOn] = useState(null);
  const open = openedOn === pathname;
  const setOpen = (v) => setOpenedOn(v ? pathname : null);
  const wrapRef = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;
    /* setOpenedOn directly: setOpen is rebuilt every render and would make
       this effect tear down and re-bind on each one. */
    const close = () => setOpenedOn(null);
    const onKey = (e) => e.key === "Escape" && close();
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div className="nav-menu" ref={wrapRef}>
      <button
        type="button"
        className="nav-menu__button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen(!open)}
      >
        <MenuIcon size={20} />
      </button>

      {open && (
        <div className="nav-menu__panel" id={panelId} role="menu">
          <Link to="/menu" role="menuitem" className="nav-menu__item">
            Menu
          </Link>
          {hasOrders && (
            <Link to="/orders" role="menuitem" className="nav-menu__item">
              Orders
            </Link>
          )}
          <span className="nav-menu__item nav-menu__item--auth" role="menuitem">
            <SignInButton />
          </span>
        </div>
      )}
    </div>
  );
}
