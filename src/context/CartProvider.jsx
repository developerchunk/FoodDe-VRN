import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useCallback,
} from "react";
import { CartContext } from "./cart-context";
import { computeBill } from "../utils/pricing";
import { priceOrder } from "../lib/orders";

const CART_KEY = "brajrasoi.cart.v1";

const loadInitial = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_KEY));
    if (!saved)
      return { lines: [], coupon: null, instructions: "" };
    return {
      /* A line carries everything it needs to render and to price itself, so
         a stale cart never has to be reconciled against a menu that may have
         changed underneath it. Anything malformed is simply dropped. */
      lines: Array.isArray(saved.lines)
        ? saved.lines.filter(
            (l) => l && typeof l.id === "string" && Number.isInteger(l.pricePaise) && l.qty > 0,
          )
        : [],
      /* A code is only a string here; whether it is worth anything is the
         database's answer, asked for fresh each time. */
      coupon: typeof saved.coupon === "string" ? saved.coupon : null,
      instructions:
        typeof saved.instructions === "string" ? saved.instructions : "",
    };
  } catch {
    return { lines: [], coupon: null, instructions: "" };
  }
};

function reducer(state, action) {
  switch (action.type) {
    case "add": {
      const item = action.item;
      if (!item) return state;
      const existing = state.lines.find((l) => l.id === item.id);
      const lines = existing
        ? state.lines.map((l) =>
            l.id === item.id ? { ...l, qty: Math.min(l.qty + 1, 20) } : l,
          )
        : [
            ...state.lines,
            {
              id: item.id,
              name: item.name,
              pricePaise: item.pricePaise,
              sattvic: item.sattvic,
              /* kept so the cart can draw the dish without re-fetching */
              art: item.art,
              palette: item.palette,
              qty: 1,
            },
          ];
      return { ...state, lines };
    }
    case "decrement": {
      const lines = state.lines
        .map((l) => (l.id === action.id ? { ...l, qty: l.qty - 1 } : l))
        .filter((l) => l.qty > 0);
      return { ...state, lines };
    }
    case "remove": {
      const lines = state.lines.filter((l) => l.id !== action.id);
      return { ...state, lines };
    }
    case "clear":
      return { lines: [], coupon: null, instructions: "" };
    case "coupon":
      return { ...state, coupon: action.code };
    case "instructions":
      return { ...state, instructions: action.value };
    default:
      return state;
  }
}

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitial);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(state));
    } catch {
      /* ignore quota / privacy-mode failures */
    }
  }, [state]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const flash = useCallback((message, tone = "ok") => {
    clearTimeout(toastTimer.current);
    setToast({ message, tone, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  /* What the cart shows without asking anyone: correct whenever no coupon is
     in play, and the thing a guest sees instantly while one is being priced. */
  const localBill = useMemo(() => computeBill(state.lines), [state.lines]);

  /* The database's answer, which is the only one that knows what a coupon is
     worth. Null until it arrives, or when there is no coupon to price. */
  const [pricedBill, setPricedBill] = useState(null);

  useEffect(() => {
    if (!state.coupon || localBill.subtotal === 0) return undefined;
    let cancelled = false;
    priceOrder(localBill.subtotal, state.coupon).then((priced) => {
      if (!cancelled) setPricedBill(priced);
    });
    return () => {
      cancelled = true;
    };
  }, [state.coupon, localBill.subtotal]);

  const bill = useMemo(() => {
    /* Every condition here is a way the priced answer can be stale: no coupon
       any more, a different coupon, or a cart that has changed since we asked.
       Falling back to the local bill is always safe — it is the bill with no
       discount, and the database prices the order again before taking money. */
    if (
      !state.coupon ||
      !pricedBill ||
      pricedBill.coupon_code !== state.coupon ||
      pricedBill.subtotal_paise !== localBill.subtotal
    )
      return localBill;
    /* Take the database's numbers wholesale rather than patching the discount
       into ours: the discount changes the taxable amount, so the GST and total
       move with it. */
    return {
      ...localBill,
      discount: pricedBill.discount_paise,
      couponCode: pricedBill.coupon_code,
      gst: pricedBill.tax_paise,
      delivery: pricedBill.delivery_paise,
      packing: pricedBill.packing_paise,
      total: pricedBill.total_paise,
    };
  }, [pricedBill, localBill, state.coupon]);

  const qtyOf = useCallback(
    (id) => state.lines.find((l) => l.id === id)?.qty || 0,
    [state.lines],
  );

  const value = useMemo(
    () => ({
      ...state,
      bill,
      qtyOf,
      toast,
      add: (item) => {
        dispatch({ type: "add", item });
        flash(`${item.name} added to your order`);
      },
      decrement: (id) => dispatch({ type: "decrement", id }),
      remove: (id) => dispatch({ type: "remove", id }),
      clear: () => dispatch({ type: "clear" }),
      setInstructions: (value) => dispatch({ type: "instructions", value }),
      /* Applying is just holding the code; the database decides its worth, and
         the effect above reprices. A code that turns out to be worth nothing
         comes back with a null coupon_code, which the cart shows as rejected. */
      applyCoupon: (rawCode) => {
        const code = String(rawCode || "").trim().toUpperCase();
        if (!code) return;
        dispatch({ type: "coupon", code });
      },
      removeCoupon: () => dispatch({ type: "coupon", code: null }),
      /* null while we are still asking, false once the answer is "nothing". */
      couponPending:
        Boolean(state.coupon) &&
        (pricedBill === null || pricedBill.subtotal_paise !== localBill.subtotal),
      couponRejected:
        Boolean(state.coupon) &&
        pricedBill !== null &&
        pricedBill.subtotal_paise === localBill.subtotal &&
        !pricedBill.coupon_code,
      flash,
    }),
    [state, bill, qtyOf, toast, flash, pricedBill, localBill],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
