import { useEffect, useMemo, useRef, useState } from "react";
import { useMenu } from "../hooks/useMenu";
import { useCart } from "../context/cart-context";
import FilterBar from "../components/FilterBar";
import CategoryRail from "../components/CategoryRail";
import CategorySheet from "../components/CategorySheet";
import MobileDock from "../components/MobileDock";
import MenuItemCard from "../components/MenuItemCard";
import CartPanel from "../components/CartPanel";
import StayCard from "../components/StayCard";
import { Cloche } from "../components/Icons";

export default function MenuPage() {
  const { items, categories, loading, error } = useMenu();
  const { bill } = useCart();
  const [query, setQuery] = useState("");
  const [quick, setQuick] = useState(null);
  const [sort, setSort] = useState("default");
  const [activeCat, setActiveCat] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const sectionRefs = useRef({});
  const railRef = useRef(null);
  const listTopRef = useRef(null);
  const firstPass = useRef(true);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items.filter((item) => {
      if (quick === "under150" && item.pricePaise >= 15000) return false;
      if (quick === "sattvic" && !item.sattvic) return false;
      if (quick === "bestseller" && !item.loved) return false;
      if (quick === "spicy" && !item.spicy) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.desc.toLowerCase().includes(q) ||
        (item.ingredients || "").toLowerCase().includes(q)
      );
    });

    if (sort === "low")
      list = [...list].sort((a, b) => a.pricePaise - b.pricePaise);
    if (sort === "high")
      list = [...list].sort((a, b) => b.pricePaise - a.pricePaise);
    if (sort === "name")
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    /* Dishes that can be ordered right now come first; the sort is stable, so
       each group keeps the order chosen above. */
    return [...list].sort((a, b) => b.availableNow - a.availableNow);
  }, [items, query, quick, sort]);

  const counts = useMemo(() => {
    const map = {};
    for (const item of filtered) map[item.cat] = (map[item.cat] || 0) + 1;
    return map;
  }, [filtered]);

  const visibleCats = categories.filter((c) => (counts[c.id] || 0) > 0);

  /* Until the reader scrolls or picks one, the highlighted category is simply
     the first that has dishes — derived, so the menu loading does not have to
     trigger an extra render just to choose it. */
  const currentCat = activeCat ?? visibleCats[0]?.id ?? null;

  /* clear the sticky header and the sticky filter rail beneath it */
  const stickyOffset = () =>
    (document.querySelector(".site-header")?.offsetHeight ?? 0) +
    (railRef.current?.offsetHeight ?? 0) +
    16;

  /* Highlight the category whose section is currently under the header. */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const shown = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (shown[0]) setActiveCat(shown[0].target.dataset.cat);
      },
      { rootMargin: `-${stickyOffset()}px 0px -60% 0px`, threshold: 0 },
    );
    Object.values(sectionRefs.current).forEach(
      (el) => el && observer.observe(el),
    );
    return () => observer.disconnect();
  }, [visibleCats.length]);

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
  }, [query, quick, sort]);

  const clearAll = () => {
    setQuery("");
    setQuick(null);
  };

  return (
    <>
      {/* travels with the reader: search and filters stay reachable at any
          scroll depth (on phones search lives in the bottom dock instead) */}
      <div className="filter-rail" ref={railRef}>
        <div className="wrap">
          <FilterBar
            query={query}
            onQuery={setQuery}
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
            categories={categories}
            active={currentCat}
            counts={counts}
            onSelect={(id) => {
              setActiveCat(id);
              scrollTo(sectionRefs.current[id]);
            }}
          />
        </div>

        <main className="menu-layout__main" id="main" ref={listTopRef}>
          {loading ? (
            <div className="empty-state card">
              <span className="spinner spinner--dark" aria-hidden="true" />
              <h3>Loading the menu…</h3>
            </div>
          ) : error ? (
            <div className="empty-state card">
              <Cloche size={44} />
              <h3>The menu could not be loaded</h3>
              <p className="muted">Please try again in a moment.</p>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => window.location.reload()}
              >
                Try again
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="empty-state card">
              <Cloche size={44} />
              <h3>Nothing on the menu just yet</h3>
              <p className="muted">Please check back shortly.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state card">
              <Cloche size={44} />
              <h3>No dishes match</h3>
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
                  <h2 id={`cat-${cat.id}`} className="menu-section__title">
                    {cat.name}
                  </h2>
                  <span className="menu-section__count">{counts[cat.id]}</span>
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

        <aside className="menu-layout__side" aria-label="Your order">
          {/* once there is an order, the cart gets the whole column */}
          {bill.itemCount === 0 && <StayCard />}
          <CartPanel />
        </aside>
      </div>

      <MobileDock
        query={query}
        onQuery={setQuery}
        onOpenMenu={() => setSheetOpen(true)}
      />

      <CategorySheet
        open={sheetOpen}
        categories={categories}
        counts={counts}
        active={currentCat}
        onClose={() => setSheetOpen(false)}
        onSelect={(id) => {
          setActiveCat(id);
          scrollTo(sectionRefs.current[id]);
        }}
      />
    </>
  );
}
