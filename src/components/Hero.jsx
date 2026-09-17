import { MorPankh, Lotus, Matka, Diya } from "./Motifs";
import BrajSkyline from "./BrajSkyline";

export default function Hero({ onBrowse }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <BrajSkyline />

      <div className="wrap hero__inner">
        <div className="hero__copy">
          <p className="hero__greet">
            <MorPankh size={17} />
            <span className="deva">राधे राधे</span>
            <span className="hero__greet-sep">·</span>
            <span>Welcome to Braj</span>
          </p>

          <h1 id="hero-title" className="hero__title">
            The food of <em>Vrindavan</em>,
            <br />
            carried to your door.
          </h1>

          <p className="hero__sub">
            Bedai and dubki wale aloo at dawn, a sattvic thali at noon, thick
            kulhad lassi when the afternoon gets long. Cooked in desi ghee,
            packed hot, delivered across the dham.
          </p>

          <div className="hero__cta">
            <button
              type="button"
              className="btn btn-primary"
              onClick={onBrowse}
            >
              Browse the menu
              <svg
                viewBox="0 0 20 20"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  d="M4 10h11M11 5l5 5-5 5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <a className="btn btn-ghost" href="#how-it-works">
              How it works
            </a>
          </div>

          <ul className="hero__points">
            <li>
              <Lotus size={19} />
              <span>
                <strong>100% pure veg</strong>
                <small>No egg. Never has been.</small>
              </span>
            </li>
            <li>
              <Matka size={19} />
              <span>
                <strong>Sattvic kitchen</strong>
                <small>No onion, no garlic — filter it on.</small>
              </span>
            </li>
            <li>
              <Diya size={19} />
              <span>
                <strong>No sign-up</strong>
                <small>Name, WhatsApp number, address. Done.</small>
              </span>
            </li>
          </ul>
        </div>

        <div className="hero__card" aria-hidden="true">
          <div className="hero__thali">
            <svg viewBox="0 0 320 320">
              <defs>
                <radialGradient id="thali-sheen" cx="38%" cy="30%" r="72%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="100%" stopColor="#dfe4e0" />
                </radialGradient>
              </defs>
              <circle cx="160" cy="160" r="150" fill="#e8d9b4" opacity="0.45" />
              <circle cx="160" cy="160" r="134" fill="url(#thali-sheen)" />
              <circle cx="160" cy="160" r="120" fill="#f7f8f5" />
              <circle
                cx="160"
                cy="160"
                r="120"
                fill="none"
                stroke="#c9cec9"
                strokeWidth="2"
              />
              {/* katoris around the rim */}
              <g>
                <circle cx="160" cy="76" r="31" fill="#e7ebe6" />
                <circle cx="160" cy="74" r="26" fill="#e39a2a" />
                <circle cx="231" cy="118" r="29" fill="#e7ebe6" />
                <circle cx="231" cy="116" r="24" fill="#c94b26" />
                <circle cx="231" cy="205" r="29" fill="#e7ebe6" />
                <circle cx="231" cy="203" r="24" fill="#4a7a3b" />
                <circle cx="89" cy="118" r="29" fill="#e7ebe6" />
                <circle cx="89" cy="116" r="24" fill="#fdf1cf" />
                <circle cx="89" cy="205" r="29" fill="#e7ebe6" />
                <circle cx="89" cy="203" r="24" fill="#ab3f5b" />
              </g>
              {/* rice mound + phulka */}
              <ellipse cx="160" cy="215" rx="52" ry="34" fill="#fffdf6" />
              <ellipse cx="160" cy="210" rx="44" ry="27" fill="#f7f1e0" />
              <circle cx="160" cy="205" r="13" fill="#e8c14e" />
              <path
                d="M138 196 q22 -12 44 0"
                stroke="#d29b31"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
            <span className="hero__thali-ring" />
          </div>
          <p className="hero__card-cap">
            <strong>Braj Sattvic Thali</strong>
            <span>Cooked fresh, twice a day</span>
          </p>
        </div>
      </div>
    </section>
  );
}
