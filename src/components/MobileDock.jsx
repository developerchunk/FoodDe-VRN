/**
 * The phone dock: search on the left, the Menu button on the right — both
 * inside thumb reach, so browsing a long menu never needs a scroll back to the
 * top. Mirrors how food apps put navigation at the bottom of the screen.
 */
export default function MobileDock({ query, onQuery, onOpenMenu }) {
  return (
    <div className="dock">
      <div className="dock__search">
        <svg
          viewBox="0 0 24 24"
          width="19"
          height="19"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search “kachori”"
          aria-label="Search the menu"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQuery("")}
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      <button type="button" className="dock__menu" onClick={onOpenMenu}>
        <svg
          viewBox="0 0 24 24"
          width="17"
          height="17"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path
            d="M6 3v8a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3M8 13v8"
            strokeLinecap="round"
          />
          <path
            d="M17 3c-1.6 1.4-2 3.4-2 5.5 0 1.6.7 2.5 2 2.5M17 3v18"
            strokeLinecap="round"
          />
        </svg>
        Menu
      </button>
    </div>
  );
}
