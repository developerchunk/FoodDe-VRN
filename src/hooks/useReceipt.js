import { useEffect, useState } from "react";
import { fetchReceipt } from "../lib/orders";

/**
 * One order, read back by its receipt token.
 *
 * The token is the authorisation: it is an unguessable uuid, which is why the
 * order number can stay short and human ("IRD-260925-K4P2") without anyone
 * being able to walk the sequence and read somebody else's order.
 */
export function useReceipt(token) {
  const [state, setState] = useState({ order: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const order = await fetchReceipt(token);
      if (!cancelled) setState({ order, loading: false });
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return state;
}
