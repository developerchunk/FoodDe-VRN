import { useEffect, useState } from "react";
import { fetchMenu } from "../lib/menu";

/**
 * Cross-checks what is in the cart against what the menu will serve right now.
 *
 * A cart line carries its own name and price so a stale cart never has to be
 * reconciled against a menu that changed underneath it. That is right for
 * pricing — the server prices every order from the database regardless — but a
 * cart also outlives the kitchen hours that made its dishes orderable. Add a
 * dish at 22:55, reach checkout at 23:05, and `place_order` rejects the whole
 * order with "no longer available". A guest should not discover that only after
 * filling in their name and number.
 *
 * The status is deliberately three-valued. `unknown` — the menu could not be
 * read — must never block ordering: the database is the authority and will
 * refuse if it has to, and a failed fetch is a bad reason to refuse a guest's
 * money. Only a menu we actually read is allowed to stop anyone.
 */
export function useCartAvailability(lines) {
  const [state, setState] = useState({ status: "loading", unavailable: [] });

  /* The cart hands back a fresh array each render, so depending on it directly
     would refetch the menu forever. Serialising id and name gives a dependency
     that changes only when the cart really does, and carries everything the
     effect needs without reaching back into render scope. */
  const snapshot = JSON.stringify(lines.map((l) => ({ id: l.id, name: l.name })));
  const empty = lines.length === 0;

  useEffect(() => {
    if (empty) return undefined;
    let cancelled = false;
    /* fetchMenu resolves with { items, categories, error } and never rejects —
       a failure arrives as a populated `error`, not as a thrown exception. */
    fetchMenu()
      .then(({ items, error }) => {
        if (cancelled) return;
        if (error) {
          setState({ status: "unknown", unavailable: [] });
          return;
        }
        const byId = new Map(items.map((d) => [d.id, d]));
        const unavailable = JSON.parse(snapshot)
          .filter((l) => {
            const dish = byId.get(l.id);
            return !dish || !dish.availableNow;
          })
          /* Off the menu entirely reads differently to closed for now. */
          .map((l) => ({ ...l, gone: !byId.has(l.id) }));
        setState({ status: "ok", unavailable });
      })
      .catch((err) => {
        /* Reaching here means a bug rather than an expected failure, since
           fetchMenu reports those in `error`. Say so instead of degrading
           quietly — a silent catch here already hid one mistake. */
        console.error("cart availability check failed", err);
        if (!cancelled) setState({ status: "unknown", unavailable: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [snapshot, empty]);

  if (empty) return { status: "ok", unavailable: [] };

  /* While a refetch is in flight after the guest removes something, the old
     answer is still in state. Filtering to what is actually in the cart stops
     a removed dish flashing back into the warning. */
  const inCart = new Set(lines.map((l) => l.id));
  return {
    status: state.status,
    unavailable: state.unavailable.filter((u) => inCart.has(u.id)),
  };
}
