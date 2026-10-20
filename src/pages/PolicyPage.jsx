import { useEffect } from "react";
import { Link } from "react-router-dom";
import { POLICIES, POLICY_LINKS, UPDATED } from "./policies";
import "../styles/about.css";

/**
 * One reading page per policy (Terms, Privacy, Refunds, Delivery, Contact),
 * laid out like About us. The words live in policies.js.
 */
export default function PolicyPage({ slug }) {
  const policy = POLICIES[slug];

  useEffect(() => {
    const prev = document.title;
    document.title = `${policy.title} · In Room Dining`;
    return () => {
      document.title = prev;
    };
  }, [policy.title]);

  return (
    <main id="main" className="wrap about">
      <article className="about__block policy" aria-labelledby="policy-title">
        <h1 id="policy-title" className="about__title">
          {policy.title}
        </h1>
        {slug !== "contact" && <p className="policy__updated">Last updated {UPDATED}</p>}
        {policy.intro.map((text) => (
          <p key={text.slice(0, 40)}>{text}</p>
        ))}

        {policy.sections.map((s) => (
          <section key={s.h} className="policy__section">
            <h2 className="policy__heading">{s.h}</h2>
            {s.list && (
              <ul className="policy__list">
                {s.list.map((text) => (
                  <li key={text.slice(0, 40)}>{text}</li>
                ))}
              </ul>
            )}
            {s.p?.map((text) => (
              <p key={text.slice(0, 40)}>{text}</p>
            ))}
          </section>
        ))}

        <nav className="policy__others" aria-label="Our policies">
          {POLICY_LINKS.filter((l) => l.to !== `/${slug}`).map((l) => (
            <Link key={l.to} to={l.to}>
              {l.label}
            </Link>
          ))}
        </nav>
      </article>
    </main>
  );
}
