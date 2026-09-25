import { useEffect, useState } from "react";
import { fetchMenu } from "../lib/menu";

/**
 * Loads the menu once per mount. Availability depends on kitchen opening
 * hours, so it is refreshed when the tab is brought back to the foreground —
 * a guest who left the page open at 22:55 should not still be offered dishes
 * from a kitchen that closed at 23:00.
 */
export function useMenu() {
  const [state, setState] = useState({ items: [], categories: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { items, categories, error } = await fetchMenu();
      if (!cancelled) setState({ items, categories, loading: false, error });
    };

    load();

    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return state;
}
