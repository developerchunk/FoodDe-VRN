import { useEffect, useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useCart } from "../context/cart-context";
import { listReceipts } from "../lib/orders";
import { useProperty } from "../utils/property";
import { isMenuPath } from "../utils/routes";
import { BuildingIcon } from "./Icons";
import Logo from "./Logo";
import AccountButton from "./AccountButton";
import NavMenu from "./NavMenu";

export default function Header() {
  const { bill } = useCart();
  const { pathname } = useLocation();
  const house = useProperty();

  /* Orders are remembered on the device, so a guest who has never ordered from
     this browser has nothing behind that link. Recomputed on navigation, which
     is when it can change: placing an order moves you to the order page. */
  const hasOrders = useMemo(() => {
    /* pathname is genuinely the dependency, even though it is not read: what
       localStorage holds can only have changed between navigations, and
       placing an order navigates. */
    void pathname;
    return listReceipts().length > 0;
  }, [pathname]);

  /* the browser tab names the guest house too, once it is known */
  useEffect(() => {
    document.title = house.room
      ? `${house.property} · In Room Dining`
      : "In Room Dining";
  }, [house.room, house.property]);

  return (
    <header className="site-header">
      <div className="wrap site-header__inner">
        <Logo />

        {/* the rest house the guest scanned from, and their room */}
        {house.room && (
          <div className="stay">
            <span className="stay__icon">
              <BuildingIcon size={22} />
            </span>
            <span className="stay__text">
              <strong>{house.property}</strong>
              <small>
                Room {house.room}
                {house.area && (
                  <span className="stay__area"> · {house.area}</span>
                )}
              </small>
            </span>
          </div>
        )}

        <nav className="site-nav" aria-label="Primary">
          <NavLink
            to="/menu"
            className={`site-nav__link ${isMenuPath(pathname) ? "is-active" : ""}`}
          >
            Menu
          </NavLink>
          {hasOrders && (
            <NavLink
              to="/orders"
              className={({ isActive }) =>
                `site-nav__link ${isActive ? "is-active" : ""}`
              }
            >
              Orders
            </NavLink>
          )}
          {/* The header's pill is Sign up / Profile now. The floating cart
              bar is hidden on wide screens and the side cart lives only on the
              menu page, so the cart keeps a plain link here. */}
          <NavLink
            to="/cart"
            className={({ isActive }) =>
              `site-nav__link ${isActive ? "is-active" : ""}`
            }
            aria-label={`Cart, ${bill.itemCount} ${bill.itemCount === 1 ? "item" : "items"}`}
          >
            Cart{bill.itemCount > 0 && <span className="site-nav__count">{bill.itemCount}</span>}
          </NavLink>
        </nav>

        <AccountButton />

        {/* Same links as the nav, for the widths where the nav is hidden. */}
        <NavMenu hasOrders={hasOrders} />
      </div>
    </header>
  );
}
