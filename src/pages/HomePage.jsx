import { Link } from "react-router-dom";
import { useMenu } from "../hooks/useMenu";
import { useMinWidth } from "../utils/useMinWidth";
import MenuItemCard from "../components/MenuItemCard";
import {
  ArrowIcon,
  ChefIcon,
  LeafIcon,
  ScooterIcon,
  ShieldIcon,
} from "../components/Icons";
import thaliImg from "../assets/thali.webp";

const POINTS = [
  { icon: <LeafIcon size={22} />, title: "Pure vegetarian", sub: "Always" },
  {
    icon: <ChefIcon size={22} />,
    title: "Freshly cooked",
    sub: "Made to order",
  },
  {
    icon: <ScooterIcon size={22} />,
    title: "Quick delivery",
    sub: "To your room",
  },
  {
    icon: <ShieldIcon size={22} />,
    title: "Safe & hygienic",
    sub: "Sealed packing",
  },
];

export default function HomePage() {
  const { items } = useMenu();
  /* the photograph is only worth its weight where there is room to show it */
  const showThali = useMinWidth(760);

  const loved = items
    .filter((i) => i.loved)
    .sort((a, b) => b.availableNow - a.availableNow)
    .slice(0, 4);

  return (
    <main id="main">
      <section className="wrap home-hero" aria-labelledby="home-title">
        <div className="home-hero__copy">
          <h1 id="home-title" className="home-hero__title">
            Freshly prepared <br />
            for your room
          </h1>
          <p className="home-hero__sub">
            Pure vegetarian meals, delivered to your door.
          </p>
          <Link to="/menu" className="btn btn-light">
            View menu <ArrowIcon size={17} />
          </Link>
        </div>

        <div className="home-hero__media">
          {showThali && (
            <img
              src={thaliImg}
              width="720"
              height="720"
              decoding="async"
              fetchPriority="high"
              alt="A thali of dal, sabzis, rice, parathas and a sweet"
            />
          )}
        </div>
      </section>

      <section className="wrap home-points" aria-label="Why order here">
        {POINTS.map((p) => (
          <div key={p.title} className="home-point">
            <span className="home-point__icon">{p.icon}</span>
            <span>
              <strong>{p.title}</strong>
              <small>{p.sub}</small>
            </span>
          </div>
        ))}
      </section>

      {loved.length > 0 && (
        <section className="wrap home-loved" aria-labelledby="loved-title">
          <div className="home-loved__head">
            <h2 id="loved-title" className="section-title">
              Most loved
            </h2>
            <Link to="/menu" className="home-loved__all">
              Full menu <ArrowIcon size={16} />
            </Link>
          </div>
          <div className="dish-grid">
            {loved.map((item) => (
              <MenuItemCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
