import { Link } from "react-router-dom";
import { MorPankh, Bansuri, TulsiLeaf } from "./Motifs";

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
                <strong>Braj Rasoi</strong>
                <em className="deva">वृन्दावन धाम</em>
              </span>
            </div>
            <p className="site-footer__note">
              A small kitchen off Parikrama Marg cooking the food of Braj —
              sattvic, unhurried, in desi ghee. We deliver across Vrindavan,
              Raman Reti, Chhatikara and Mathura Road.
            </p>
            <p className="site-footer__greet deva">राधे राधे 🙏</p>
          </div>

          <div>
            <h4 className="site-footer__head">Our kitchen</h4>
            <ul className="site-footer__list">
              <li>
                <TulsiLeaf size={13} /> Two separate kitchens — sattvic and
                regular
              </li>
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
              <li>
                <a href="#how-it-works">How delivery works</a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="site-footer__head">Reach us</h4>
            <ul className="site-footer__list site-footer__list--plain">
              <li>Gali No. 4, Parikrama Marg, Vrindavan 281121</li>
              <li>WhatsApp: +91 98765 43210</li>
              <li>Open daily, 7:00 am – 10:30 pm</li>
            </ul>
          </div>
        </div>

        <div className="site-footer__base">
          <p>
            © {new Date().getFullYear()} Braj Rasoi. A demo storefront — no real
            orders are placed and no payment is taken.
          </p>
          <p className="site-footer__legal">
            FSSAI (demo) 1234567890123 · Prices inclusive of applicable taxes
            where shown
          </p>
        </div>
      </div>
    </footer>
  );
}
