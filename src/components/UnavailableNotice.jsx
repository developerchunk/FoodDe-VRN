/**
 * Dishes in the cart that cannot be ordered right now -- a kitchen that has
 * closed since they were added, or a dish taken off the menu -- and one button
 * to remove them. Shown on the cart and at checkout, where it also blocks
 * going on: the database would refuse the order anyway.
 */
export default function UnavailableNotice({ unavailable, onRemove }) {
  if (!unavailable.length) return null;
  return (
    <div className="side-card__blocked" role="alert">
      <strong>
        {unavailable.length === 1
          ? "One item is no longer available"
          : `${unavailable.length} items are no longer available`}
      </strong>
      <ul>
        {unavailable.map((u) => (
          <li key={u.id}>
            <span>{u.name}</span>
            <em>{u.gone ? "no longer on the menu" : "not being served right now"}</em>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn-ghost btn-block"
        onClick={() => unavailable.forEach((u) => onRemove(u.id))}
      >
        Remove {unavailable.length === 1 ? "it" : "them"} and continue
      </button>
    </div>
  );
}
