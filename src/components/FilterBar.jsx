import { ChiliIcon, SearchIcon, StarIcon, TulsiLeaf } from "./Icons";

const QUICK = [
  { id: "bestseller", label: "Most loved", icon: <StarIcon size={15} /> },
  { id: "sattvic", label: "No onion–garlic", icon: <TulsiLeaf size={12} /> },
  { id: "spicy", label: "Spicy", icon: <ChiliIcon size={16} /> },
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
  quick,
  onQuick,
  sort,
  onSort,
  resultCount,
}) {
  return (
    <div className="filters">
      <div className="search search--bar">
        <SearchIcon size={20} />
        <input
          className="search__input"
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search for dishes or ingredients…"
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
        {QUICK.map((q) => (
          <button
            key={q.id}
            type="button"
            className={`chip chip--${q.id} ${quick === q.id ? "is-on" : ""}`}
            onClick={() => onQuick(quick === q.id ? null : q.id)}
            aria-pressed={quick === q.id}
          >
            {q.icon && <span className="chip__icon">{q.icon}</span>}
            {q.label}
          </button>
        ))}

        <label className="sort">
          <span className="sr-only">Sort dishes</span>
          <select value={sort} onChange={(e) => onSort(e.target.value)}>
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
