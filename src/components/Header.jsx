import { useEffect, useMemo } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useCart } from "../context/cart-context";
import { listReceipts } from "../lib/orders";
import { useProperty } from "../utils/property";
import { isMenuPath } from "../utils/routes";
import { isOpenNow, sellerHoursShort } from "../utils/seller";
import { BuildingIcon, CartIcon, ClockIcon } from "./Icons";
import Logo from "./Logo";
import SignInButton from "./SignInButton";

export default function Header() {
  const { bill } = useCart();
  const { pathname } = useLocation();
  const house = useProperty();
  const open = isOpenNow();

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

        <div className="hours">
          <ClockIcon size={22} />
          <span>
            <strong>{open ? "Open" : "Closed"}</strong>
            <small>{sellerHoursShort()}</small>
          </span>
        </div>

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
          <SignInButton />
        </nav>

        <Link
          to="/cart"
          className={`cart-button ${pathname === "/cart" ? "is-active" : ""}`}
          aria-label={`Cart, ${bill.itemCount} ${bill.itemCount === 1 ? "item" : "items"}`}
        >
          <CartIcon size={21} />
          <span className="cart-button__label">Cart</span>
          {bill.itemCount > 0 && (
            <span className="cart-button__count">{bill.itemCount}</span>
          )}
        </Link>
      </div>
    </header>
  );
}
