import { TulsiLeaf } from "./Motifs";

const QUICK = [
  { id: "bestseller", label: "Most loved" },
  { id: "new", label: "New" },
  { id: "spicy", label: "Spicy" },
  { id: "under150", label: "Under ₹150" },
];

/**
 * The sticky filter bar. Search rides along with the filters on desktop so it
 * is reachable at any scroll depth; on phones search lives in the bottom dock
 * instead, where the thumb already is.
 */
export default function FilterBar({
  query,
  onQuery,
  sattvicOnly,
  onSattvicOnly,
  quick,
  onQuick,
  sort,
  onSort,
  resultCount,
}) {
  return (
    <div className="filters">
      <div className="search search--bar">
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" strokeLinecap="round" />
        </svg>
        <input
          className="search__input"
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search kachori, thali, dosa, peda…"
          aria-label="Search the menu"
        />
        {query && (
          <button
            type="button"
            className="search__clear"
            onClick={() => onQuery("")}
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      <div className="filters__chips" role="group" aria-label="Filters">
        {/* the headline filter: sattvic = cooked without onion & garlic */}
        <label className={`sattvic-toggle ${sattvicOnly ? "is-on" : ""}`}>
          <input
            type="checkbox"
            checked={sattvicOnly}
            onChange={(e) => onSattvicOnly(e.target.checked)}
          />
          <span className="sattvic-toggle__track" aria-hidden="true">
            <span className="sattvic-toggle__thumb">
              <TulsiLeaf size={10} />
            </span>
          </span>
          <span className="sattvic-toggle__text">
            <strong>No Onion–Garlic</strong>
            <small>
              {sattvicOnly ? "Sattvic dishes only" : "Sattvic kitchen filter"}
            </small>
          </span>
        </label>

        {QUICK.map((q) => (
          <button
            key={q.id}
            type="button"
            className={`chip ${quick === q.id ? "is-on" : ""}`}
            onClick={() => onQuick(quick === q.id ? null : q.id)}
            aria-pressed={quick === q.id}
          >
            {q.label}
          </button>
        ))}

        <label className="sort">
          <span className="sort__label">Sort</span>
          <select
            value={sort}
            onChange={(e) => onSort(e.target.value)}
            aria-label="Sort dishes"
          >
            <option value="default">Recommended</option>
            <option value="low">Price: low to high</option>
            <option value="high">Price: high to low</option>
            <option value="name">Name A–Z</option>
          </select>
        </label>

        <span className="filters__count">
          {resultCount} {resultCount === 1 ? "dish" : "dishes"}
        </span>
      </div>
    </div>
  );
}
