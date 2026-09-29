import { Link } from "react-router-dom";
import { Cloche } from "./Icons";

/**
 * The cloche and the name. The name is always spelled out, never "IRD"; pass
 * `name` to set a guest house's own name beside the cloche instead.
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
        <span className="logo__word">
          <strong>In Room</strong>
          <small>Dining</small>
        </span>
      )}
    </Link>
  );
}
