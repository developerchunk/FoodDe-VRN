import { Link } from "react-router-dom";
import { maskPhone } from "../utils/format";
import { SELLER, sellerHours } from "../utils/seller";
import { useProperty } from "../utils/property";
import Logo from "./Logo";

/**
 * With a room link the footer names the guest house and gives its address
 * from address_map; without one it shows In Room Dining's own.
 */
export default function Footer() {
  const house = useProperty();
  const stay = Boolean(house.addressId);

  return (
    <footer className="site-footer">
      <div className="wrap site-footer__inner">
        <div className="site-footer__brand">
          <Logo className="logo--footer" name={stay ? house.property : null} />
          <p>{stay ? house.address : SELLER.address}</p>
        </div>

        <ul className="site-footer__links">
          <li>
            <Link to="/menu">Menu</Link>
          </li>
          <li>
            <Link to="/cart">Cart</Link>
          </li>
          <li>
            <Link to="/orders">Orders</Link>
          </li>
        </ul>

        <ul className="site-footer__contact">
          <li>{sellerHours()}</li>
          <li>WhatsApp {maskPhone(SELLER.phone)}</li>
        </ul>
      </div>

      <div className="wrap site-footer__base">
        <p>
          © {new Date().getFullYear()} {SELLER.name} · Pure vegetarian
        </p>
        <p>Online payment is being set up — orders are not yet fulfilled.</p>
      </div>
    </footer>
  );
}
