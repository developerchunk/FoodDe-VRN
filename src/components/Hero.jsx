import { MorPankh, Lotus, Matka, Diya } from "./Motifs";
import BrajSkyline from "./BrajSkyline";
import { useMinWidth } from "../utils/useMinWidth";

export default function Hero({ onBrowse }) {
  /* the thali only ever shows from 900px up — see useMinWidth */
  const showThali = useMinWidth(900);

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

        <div className="hero__card">
          <div className="hero__thali">
            {showThali && (
              <img
                className="hero__thali-img"
                src="/thali.webp"
                width="720"
                height="720"
                decoding="async"
                fetchPriority="high"
                alt="A steel thali laid with dal, kadhi, sabzis, rice, hot parathas, halwa and a glass of lassi"
              />
            )}
            <span className="hero__thali-ring" aria-hidden="true" />
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
