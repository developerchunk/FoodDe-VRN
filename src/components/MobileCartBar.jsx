import { Link, useLocation } from "react-router-dom";
import { useCart } from "../context/cart-context";
import { rupees } from "../utils/format";

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
      className={`mobile-bar ${pathname === "/" ? "mobile-bar--docked" : ""}`}
    >
      <div className="mobile-bar__info">
        <strong>
          {bill.itemCount} {bill.itemCount === 1 ? "item" : "items"}
        </strong>
        <span className="rupee">{rupees(bill.subtotal)} + taxes</span>
      </div>
      <Link to="/cart" className="btn btn-gold mobile-bar__cta">
        View cart
        <svg
          viewBox="0 0 20 20"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          aria-hidden="true"
        >
          <path
            d="M4 10h11M11 5l5 5-5 5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
    </div>
  );
}
