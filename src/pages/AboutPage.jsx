import { useEffect } from "react";
import "../styles/about.css";

const ABOUT = [
  "In Room Dining (IRD) is a hospitality-focused food delivery platform designed to help stays offer food service without needing their own cafe, restaurant, or in-house kitchen.",
  "Our solution is built especially for Tier 2 and Tier 3 locations, where many guesthouses, lodges, homestays, hostels, serviced apartments, boutique properties, and budget hotels face a common challenge: guests need convenient food options, but the property may not have the space, staff, infrastructure, licenses, or order volume required to run a full food outlet.",
  "We bridge this gap by connecting stay properties with trusted local kitchens, restaurants, cloud kitchens, and delivery partners. With our platform, reception teams and property staff can easily place guest orders, track kitchen preparation, monitor delivery status, manage invoices, and handle guest food requests through one simple digital platform.",
  "For guests, this creates a smoother and more comfortable stay experience. They get access to reliable food options without having to search outside, call multiple restaurants, or worry about delivery coordination in an unfamiliar location.",
  "For property owners, it adds a valuable hospitality service without the heavy cost of setting up and operating a restaurant. It helps improve guest satisfaction, increase service quality, reduce staff workload, and make smaller stays more competitive with larger hotels that already offer food facilities.",
  "For local food businesses and delivery partners, our platform opens a new channel of demand from nearby stays, helping them reach more customers and grow within their own city or region.",
  "Our vision is to make food service accessible to every stay, regardless of size, category, or location. We believe even small and mid-sized properties should be able to offer a dependable food experience to their guests, and our platform is built to make that possible through technology, local partnerships, and simple operations.",
];

const FOUNDER = [
  "We started this platform with a simple belief: every guest deserves access to good food during their stay, and every stay should be able to offer that service without needing to run a restaurant.",
  "I personally believe that in today’s world, access to food with convenience is not just a luxury, but an essential part of comfort and hospitality. Whether someone is travelling for work, leisure, family, or emergencies, the ability to get a good meal easily can deeply impact their overall stay experience.",
  "Many stays, especially in Tier 2 and Tier 3 locations, do their best to provide clean rooms, good service, and warm hospitality, but food availability often becomes a challenge when there is no in-house cafe or restaurant. We created this platform to solve that gap.",
  "Our goal is to empower every stay, big or small, to offer dependable food service to its guests through trusted local kitchens, restaurants, and delivery partners. At the same time, we want to support local food businesses by helping them reach more customers within the hospitality ecosystem.",
  "For us, this is more than food delivery. It is about improving guest comfort, supporting property owners, creating opportunities for local partners, and making hospitality more complete.",
];

export default function AboutPage() {
  useEffect(() => {
    const prev = document.title;
    document.title = "About us · In Room Dining";
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <main id="main" className="wrap about">
      <section className="about__block" aria-labelledby="about-title">
        <h1 id="about-title" className="about__title">
          About us
        </h1>
        {ABOUT.map((text) => (
          <p key={text.slice(0, 40)}>{text}</p>
        ))}
      </section>

      <section className="about__block about__founder" aria-labelledby="founder-title">
        <h2 id="founder-title" className="about__title about__title--sub">
          From the CEO / Founder
        </h2>
        <blockquote className="about__quote">
          {FOUNDER.map((text, i) => (
            <p key={text.slice(0, 40)}>
              {i === 0 && "“"}
              {text}
              {i === FOUNDER.length - 1 && "”"}
            </p>
          ))}
        </blockquote>
        <p className="about__sign">
          <strong>Hari Nandan Solanki</strong>
          <span>CEO / Founder</span>
          <span>In Room Dining (IRD) Services</span>
        </p>
      </section>
    </main>
  );
}
