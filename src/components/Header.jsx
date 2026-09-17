import { Link, NavLink, useLocation } from "react-router-dom";
import { useCart } from "../context/cart-context";
import { MorPankh, Lotus } from "./Motifs";

function CartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="21"
      height="21"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path
        d="M4 5h2.2l2 11.2a1.6 1.6 0 0 0 1.6 1.3h7.7a1.6 1.6 0 0 0 1.6-1.2L21 8.5H7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10.5" cy="20" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="20" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function Header() {
  const { bill } = useCart();
  const { pathname } = useLocation();

  return (
    <>
      <div className="ticker">
        <div className="wrap ticker__inner">
          <span className="ticker__item">
            <Lotus size={15} /> 100% pure vegetarian — no onion &amp; garlic
            kitchen available on every dish
          </span>
          <span className="ticker__dot" aria-hidden="true">
            •
          </span>
          <span className="ticker__item">
            Free delivery across Vrindavan on orders above ₹299
          </span>
          <span className="ticker__dot" aria-hidden="true">
            •
          </span>
          <span className="ticker__item">
            Order status on WhatsApp — no app, no sign-up needed
          </span>
        </div>
      </div>

      <header className="site-header">
        <div className="wrap site-header__inner">
          <Link to="/" className="brand" aria-label="Braj Rasoi — home">
            <span className="brand__mark">
              <MorPankh size={20} />
            </span>
            <span className="brand__text">
              <strong>Braj Rasoi</strong>
              <em className="deva">वृन्दावन धाम</em>
            </span>
          </Link>

          <div className="locality" title="Delivery area">
            <svg
              viewBox="0 0 24 24"
              width="17"
              height="17"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path
                d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="10" r="2.4" />
            </svg>
            <span>
              <small>Delivering to</small>
              <strong>Vrindavan, Mathura</strong>
            </span>
          </div>

          <nav className="site-nav" aria-label="Primary">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `site-nav__link ${isActive ? "is-active" : ""}`
              }
              end
            >
              Menu
            </NavLink>
            <a className="site-nav__link" href="#how-it-works">
              How it works
            </a>
            <a className="site-nav__link" href="#kitchen">
              Our kitchen
            </a>
          </nav>

          <Link
            to="/cart"
            className={`cart-button ${bill.itemCount ? "has-items" : ""} ${pathname === "/cart" ? "is-active" : ""}`}
          >
            <CartIcon />
            <span className="cart-button__label">Cart</span>
            {bill.itemCount > 0 && (
              <span className="cart-button__count">{bill.itemCount}</span>
            )}
          </Link>
        </div>
      </header>
    </>
  );
}
