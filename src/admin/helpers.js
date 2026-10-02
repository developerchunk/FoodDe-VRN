import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/**
 * The non-component half of the admin kit (ui.jsx holds the components), kept
 * apart so editing a page hot-reloads it instead of reloading the whole site.
 */

export const NoticeContext = createContext(() => {});

/** notify("Saved") / notify("Could not save: …", "error") */
export const useNotice = () => useContext(NoticeContext);

// ------------------------------------------------------------------- loading
/**
 * Runs `load` on mount and whenever `deps` change. `reload()` runs it again
 * without blanking what is on screen, so a list does not flash empty after
 * every save.
 */
export function useLoad(load, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const run = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    const id = ++run.current;
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await loadRef.current();
      if (id === run.current) setState({ data, error: null, loading: false });
      return data;
    } catch (e) {
      if (id === run.current) setState((s) => ({ ...s, error: e.message, loading: false }));
      return null;
    }
  }, []);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, reload, setData: (data) => setState((s) => ({ ...s, data })) };
}

export const STATUS_LABEL = {
  pending_payment: "Unpaid",
  paid: "Paid",
  sent_to_kitchen: "With kitchens",
  preparing: "Preparing",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  failed: "Failed",
};


// ---------------------------------------------------------------------- misc
/** "14:30:00" <-> "14:30" for <input type=time>. */
export const timeIn = (t) => (t ? String(t).slice(0, 5) : "");
export const timeOut = (t) => (t ? t : null);

/** Rupees typed into a form, as integer paise. "249.50" -> 24950. */
export const toPaise = (v) => {
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
export const fromPaise = (p) => (p == null ? "" : String(p / 100));

export const blankToNull = (v) => (v == null || String(v).trim() === "" ? null : String(v).trim());
