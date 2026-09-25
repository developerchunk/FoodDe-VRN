import { CategoryGlyph } from "./Motifs";

export default function CategoryRail({ categories, active, counts, onSelect }) {
  return (
    <nav className="rail" aria-label="Menu categories">
      <p className="rail__title">Categories</p>
      <ul className="rail__list">
        {categories.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={`rail__item ${active === c.id ? "is-active" : ""}`}
              onClick={() => onSelect(c.id)}
              aria-current={active === c.id ? "true" : undefined}
            >
              <span className="rail__glyph">
                <CategoryGlyph icon={c.icon} size={24} />
              </span>
              <span className="rail__text">
                <strong>{c.name}</strong>
              </span>
              <span className="rail__count">{counts[c.id] ?? 0}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
