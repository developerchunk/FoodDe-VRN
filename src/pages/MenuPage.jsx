import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, MENU } from "../data/menu";
import Hero from "../components/Hero";
import FilterBar from "../components/FilterBar";
import CategoryRail from "../components/CategoryRail";
import CategorySheet from "../components/CategorySheet";
import MobileDock from "../components/MobileDock";
import MenuItemCard from "../components/MenuItemCard";
import CartPanel from "../components/CartPanel";
import {
  FeatherDivider,
  MorPankh,
  TulsiLeaf,
  Matka,
  Diya,
} from "../components/Motifs";

const HOW_STEPS = [
  {
    n: "01",
    title: "Pick your dishes",
    body: "Flip the No Onion–Garlic switch if you eat sattvic — the menu rearranges itself around you.",
    icon: <TulsiLeaf size={20} />,
  },
  {
    n: "02",
    title: "Leave three details",
    body: "Your name, a WhatsApp number and where to bring it. No account, no password, no OTP wall.",
    icon: <Matka size={20} />,
  },
  {
    n: "03",
    title: "We cook and call",
    body: "Order status lands on WhatsApp. Our rider rings the number you gave if the gali gets confusing.",
    icon: <Diya size={20} />,
  },
];

export default function MenuPage() {
  const [query, setQuery] = useState("");
  const [sattvicOnly, setSattvicOnly] = useState(false);
  const [quick, setQuick] = useState(null);
  const [sort, setSort] = useState("default");
  const [activeCat, setActiveCat] = useState(CATEGORIES[0].id);
  const [sheetOpen, setSheetOpen] = useState(false);

  const sectionRefs = useRef({});
  const menuTopRef = useRef(null);
  const listTopRef = useRef(null);
  const firstPass = useRef(true);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = MENU.filter((item) => {
      if (sattvicOnly && !item.sattvic) return false;
      if (quick === "under150" && item.price >= 150) return false;
      if (quick && quick !== "under150" && !(item.tags || []).includes(quick))
        return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.desc.toLowerCase().includes(q) ||
        (item.hindi || "").includes(query.trim())
      );
    });

    if (sort === "low") list = [...list].sort((a, b) => a.price - b.price);
    if (sort === "high") list = [...list].sort((a, b) => b.price - a.price);
    if (sort === "name")
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [query, sattvicOnly, quick, sort]);

  const counts = useMemo(() => {
    const map = {};
    for (const item of filtered) map[item.cat] = (map[item.cat] || 0) + 1;
    return map;
  }, [filtered]);

  const visibleCats = CATEGORIES.filter((c) => (counts[c.id] || 0) > 0);

  /* Highlight the category whose section is currently under the header. */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const shown = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (shown[0]) setActiveCat(shown[0].target.dataset.cat);
      },
      { rootMargin: "-140px 0px -60% 0px", threshold: 0 },
    );
    Object.values(sectionRefs.current).forEach(
      (el) => el && observer.observe(el),
    );
    return () => observer.disconnect();
  }, [visibleCats.length]);

  /* clear the sticky header and the sticky filter rail beneath it */
  const stickyOffset = () =>
    window.matchMedia("(min-width: 1000px)").matches ? 152 : 146;

  const scrollTo = (el) => {
    if (!el) return;
    const top =
      el.getBoundingClientRect().top + window.scrollY - stickyOffset();
    window.scrollTo({ top, behavior: "smooth" });
  };

  /* Searching or filtering from the bottom dock changes what is on screen far
     above the thumb — bring the results back up to the reader. */
  useEffect(() => {
    if (firstPass.current) {
      firstPass.current = false;
      return;
    }
    const el = listTopRef.current;
    if (!el) return;
    const top =
      el.getBoundingClientRect().top + window.scrollY - stickyOffset();
    if (window.scrollY > top) window.scrollTo({ top, behavior: "smooth" });
  }, [query, quick, sattvicOnly, sort]);

  const clearAll = () => {
    setQuery("");
    setQuick(null);
    setSattvicOnly(false);
  };

  return (
    <>
      <Hero onBrowse={() => scrollTo(menuTopRef.current)} />

      <section className="how" id="how-it-works" aria-labelledby="how-title">
        <div className="wrap">
          <div className="how__head">
            <p className="eyebrow">Simple as it sounds</p>
            <h2 id="how-title" className="section-title">
              Three steps, no account
            </h2>
          </div>
          <ol className="how__steps">
            {HOW_STEPS.map((s) => (
              <li key={s.n} className="how__step">
                <span className="how__icon">{s.icon}</span>
                <span className="how__n">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="menu-band" ref={menuTopRef} id="menu">
        <div className="wrap">
          <div className="menu-band__head">
            <div>
              <p className="eyebrow">Our menu</p>
              <h2 className="section-title">
                Everything here is <em>pure vegetarian</em>
              </h2>
              <p className="menu-band__note">
                We run two kitchens. Dishes marked{" "}
                <span className="inline-flag">
                  <TulsiLeaf size={11} /> no onion–garlic
                </span>{" "}
                are cooked the sattvic way, with hing instead — on separate
                tawas, in separate kadhais.
              </p>
            </div>
            <FeatherDivider className="menu-band__feather" />
          </div>
        </div>
      </div>

      {/* travels with the reader: search and filters stay reachable at any
          scroll depth (on phones search lives in the bottom dock instead) */}
      <div className="filter-rail">
        <div className="wrap">
          <FilterBar
            query={query}
            onQuery={setQuery}
            sattvicOnly={sattvicOnly}
            onSattvicOnly={setSattvicOnly}
            quick={quick}
            onQuick={setQuick}
            sort={sort}
            onSort={setSort}
            resultCount={filtered.length}
          />
        </div>
      </div>

      <div className="wrap menu-layout">
        <div className="menu-layout__rail">
          <CategoryRail
            active={activeCat}
            counts={counts}
            onSelect={(id) => {
              setActiveCat(id);
              scrollTo(sectionRefs.current[id]);
            }}
          />
        </div>

        <main className="menu-layout__main" id="main" ref={listTopRef}>
          {filtered.length === 0 ? (
            <div className="empty-state card">
              <MorPankh size={38} />
              <h3>Nothing matches that just yet</h3>
              <p className="muted">
                Try a different spelling, or clear the filters to see all{" "}
                {MENU.length} dishes.
              </p>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={clearAll}
              >
                Clear filters
              </button>
            </div>
          ) : (
            visibleCats.map((cat) => (
              <section
                key={cat.id}
                className="menu-section"
                data-cat={cat.id}
                ref={(el) => (sectionRefs.current[cat.id] = el)}
                aria-labelledby={`cat-${cat.id}`}
              >
                <header className="menu-section__head">
                  <div>
                    <h2 id={`cat-${cat.id}`} className="menu-section__title">
                      {cat.name}
                      <em className="deva">{cat.hindi}</em>
                    </h2>
                    <p className="menu-section__blurb">{cat.blurb}</p>
                  </div>
                  <span className="menu-section__count">
                    {counts[cat.id]} {counts[cat.id] === 1 ? "dish" : "dishes"}
                  </span>
                </header>

                <div className="dish-grid">
                  {filtered
                    .filter((i) => i.cat === cat.id)
                    .map((item) => (
                      <MenuItemCard key={item.id} item={item} />
                    ))}
                </div>
              </section>
            ))
          )}
        </main>

        <CartPanel />
      </div>

      <MobileDock
        query={query}
        onQuery={setQuery}
        onOpenMenu={() => setSheetOpen(true)}
      />

      <CategorySheet
        open={sheetOpen}
        counts={counts}
        active={activeCat}
        onClose={() => setSheetOpen(false)}
        onSelect={(id) => {
          setActiveCat(id);
          scrollTo(sectionRefs.current[id]);
        }}
      />
    </>
  );
}
