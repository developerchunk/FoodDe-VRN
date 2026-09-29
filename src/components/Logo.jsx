import { Link } from "react-router-dom";
import { Cloche } from "./Icons";

/**
 * The cloche and the name.
 *
 * Spelled out where there is room, shortened to "IRD" on a narrow header where
 * the wordmark would crowd out everything beside it. Both are rendered and CSS
 * picks one, so there is no flash of the wrong one while JavaScript works out
 * the width. The link keeps the full name as its label, so the short form is
 * never what a screen reader announces.
 *
 * Pass `name` to put a guest house's own name beside the cloche instead; that
 * is the one the guest should see once they have scanned a room.
 */
export default function Logo({ className = "", name }) {
  return (
    <Link
      to="/"
      className={`logo ${className}`}
      aria-label={`${name || "In Room Dining"}, home`}
    >
      <Cloche size={40} className="logo__mark" />
      {name ? (
        <span className="logo__word logo__word--single">
          <strong>{name}</strong>
        </span>
      ) : (
        <>
          <span className="logo__word logo__word--full">
            <strong>In Room</strong>
            <small>Dining</small>
          </span>
          <span className="logo__word logo__word--short" aria-hidden="true">
            <strong>IRD</strong>
          </span>
        </>
      )}
    </Link>
  );
}
