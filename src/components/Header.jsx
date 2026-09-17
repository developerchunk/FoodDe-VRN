import { Fragment } from "react";
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

const TICKER_NOTES = [
  "100% pure vegetarian — no onion & garlic kitchen available on every dish",
  "Free delivery across Vrindavan on orders above ₹299",
  "Order status on WhatsApp — no app, no sign-up needed",
];

/**
 * One pass of the announcements. Two identical passes sit side by side in the
 * track, so sliding the track by half its width loops seamlessly on a phone,
 * where the three notes are far wider than the screen.
 */
function TickerRun({ duplicate = false }) {
  return (
    <div className="ticker__run" aria-hidden={duplicate || undefined}>
      {TICKER_NOTES.map((note, i) => (
        <Fragment key={note}>
          <span className="ticker__item">
            {i === 0 && <Lotus size={15} />}
            {note}
          </span>
          <span className="ticker__dot" aria-hidden="true">
            •
          </span>
        </Fragment>
      ))}
    </div>
  );
}

export default function Header() {
  const { bill } = useCart();
  const { pathname } = useLocation();

  return (
    <>
      <div className="ticker">
        <div className="ticker__viewport">
          <div className="ticker__track">
            <TickerRun />
            <TickerRun duplicate />
          </div>
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
