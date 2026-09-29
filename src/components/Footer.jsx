import { Link } from "react-router-dom";
import { MorPankh, Bansuri, TulsiLeaf } from "./Motifs";
import { maskPhone } from "../utils/format";
import { SELLER, sellerHours } from "../utils/seller";

export default function Footer() {
  return (
    <footer className="site-footer" id="kitchen">
      <div className="wrap">
        <div className="site-footer__flute">
          <Bansuri width={180} />
        </div>

        <div className="site-footer__grid">
          <div>
            <div className="brand brand--footer">
              <span className="brand__mark">
                <MorPankh size={20} />
              </span>
              <span className="brand__text">
                <strong>{SELLER.name}</strong>
              </span>
            </div>
            <p className="site-footer__note">
              Pure vegetarian food, cooked fresh in desi ghee and brought
              straight to your room — with a no onion, no garlic option right
              through the menu.
            </p>
            <p className="site-footer__greet deva">राधे राधे 🙏</p>
          </div>

          <div>
            <h4 className="site-footer__head">How it&apos;s cooked</h4>
            <ul className="site-footer__list">
              <li>
                <TulsiLeaf size={13} /> Pure vegetarian, always. No egg, ever.
              </li>
              <li>
                <TulsiLeaf size={13} /> Cooked in desi ghee &amp; cold-pressed
                oils
              </li>
              <li>
                <TulsiLeaf size={13} /> Sealed clay &amp; paper packaging
              </li>
            </ul>
          </div>

          <div>
            <h4 className="site-footer__head">Ordering</h4>
            <ul className="site-footer__list site-footer__list--plain">
              <li>
                <Link to="/">Full menu</Link>
              </li>
              <li>
                <Link to="/cart">Your cart</Link>
              </li>
              <li>
                <Link to="/orders">Past orders &amp; receipts</Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="site-footer__head">Reach us</h4>
            <ul className="site-footer__list site-footer__list--plain">
              <li>{SELLER.address}</li>
              <li>WhatsApp: {maskPhone(SELLER.phone)}</li>
              <li>{sellerHours()}</li>
            </ul>
          </div>
        </div>

        <div className="site-footer__base">
          <p>
            © {new Date().getFullYear()} {SELLER.name} · seller of record
          </p>
          <p className="site-footer__legal">
            Prices inclusive of applicable taxes where shown. Online payment is
            still being set up — orders placed here are not yet being fulfilled.
          </p>
        </div>
      </div>
    </footer>
  );
}
