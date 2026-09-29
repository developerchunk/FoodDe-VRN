import { Link, useLocation } from "react-router-dom";
import { useCart } from "../context/cart-context";
import { rupees } from "../utils/format";
import { isMenuPath } from "../utils/routes";
import { ArrowIcon } from "./Icons";

export default function MobileCartBar() {
  const { bill } = useCart();
  const { pathname } = useLocation();

  const hiddenOn = ["/cart", "/checkout"];
  if (
    !bill.itemCount ||
    hiddenOn.includes(pathname) ||
    pathname.startsWith("/order")
  )
    return null;

  /* on the menu page it stacks above the search dock */
  return (
    <div
      className={`mobile-bar ${isMenuPath(pathname) ? "mobile-bar--docked" : ""}`}
    >
      <div className="mobile-bar__info">
        <strong>
          {bill.itemCount} {bill.itemCount === 1 ? "item" : "items"}
        </strong>
        <span className="rupee">{rupees(bill.subtotal)} + taxes</span>
      </div>
      <Link to="/cart" className="btn btn-gold mobile-bar__cta">
        View cart
        <ArrowIcon size={16} />
      </Link>
    </div>
  );
}
