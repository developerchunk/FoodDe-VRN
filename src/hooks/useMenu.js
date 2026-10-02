import { useEffect, useState } from "react";
import { fetchMenu } from "../lib/menu";
import { debounced, onMenuChange } from "../lib/menuLive";

/** Backstop for a missed broadcast, and for hours ticking over. */
const REFRESH_MS = 60_000;

/**
 * Loads the menu, and keeps it current while it is on screen.
 *
 * Live: an admin switching a dish off takes it off this page within a second
 * or two (see lib/menuLive). Availability also depends on kitchen opening
 * hours, so it is refreshed on a timer and when the tab is brought back to the
 * foreground — a guest who left the page open at 22:55 should not still be
 * offered dishes from a kitchen that closed at 23:00.
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

    const soon = debounced(load);
    const stopLive = onMenuChange(soon);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      stopLive();
      soon.cancel();
      clearInterval(timer);
    };
  }, []);

  return state;
}
