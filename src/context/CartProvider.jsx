import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useCallback,
} from "react";
import { CartContext } from "./cart-context";
import { DEFAULT_CHARGES, computeBill, freeDeliveryGap } from "../utils/pricing";
import { fetchPricing, priceOrder } from "../lib/orders";

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
      /* A code the guest chose; null to let the database pick the best one;
         "" when the guest removed the coupon and wants none. Only a string
         here; whether it is worth anything is the database's answer, asked
         for fresh each time. */
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
              imageUrl: item.imageUrl ?? null,
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

  /* Delivery, packing and the free-delivery threshold, as the super admin set
     them. The defaults stand in until the database answers. */
  const [charges, setCharges] = useState(DEFAULT_CHARGES);

  useEffect(() => {
    let cancelled = false;
    fetchPricing().then((c) => {
      if (!cancelled && c) setCharges(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /* What the cart shows without asking anyone, and the thing a guest sees
     instantly while the database prices the order. */
  const localBill = useMemo(
    () => computeBill(state.lines, charges),
    [state.lines, charges],
  );

  /* The database's answer, which is the only one that knows what a coupon is
     worth — including which coupon to apply when the guest has not chosen one.
     Kept with the code it was asked about, so a stale answer is recognisable. */
  const [pricedBill, setPricedBill] = useState(null);

  useEffect(() => {
    if (localBill.subtotal === 0) return undefined;
    let cancelled = false;
    const requested = state.coupon;
    priceOrder(localBill.subtotal, requested).then((priced) => {
      if (!cancelled) setPricedBill(priced && { ...priced, requested });
    });
    return () => {
      cancelled = true;
    };
  }, [state.coupon, localBill.subtotal]);

  /* Every way the priced answer can be stale: a different code, or a cart that
     has changed since we asked. */
  const priced =
    pricedBill &&
    pricedBill.requested === state.coupon &&
    pricedBill.subtotal_paise === localBill.subtotal
      ? pricedBill
      : null;

  const bill = useMemo(() => {
    /* Falling back to the local bill is always safe — it is the bill with no
       discount, and the database prices the order again before taking money. */
    if (!priced) return localBill;
    /* Take the database's numbers wholesale rather than patching the discount
       into ours: the discount changes the taxable amount, so the GST and total
       move with it. */
    const threshold = priced.free_delivery_above_paise ?? localBill.freeDeliveryAbove;
    return {
      ...localBill,
      discount: priced.discount_paise,
      couponCode: priced.coupon_code,
      couponAuto: Boolean(priced.coupon_code && priced.coupon_auto),
      gst: priced.tax_paise,
      delivery: priced.delivery_paise,
      packing: priced.packing_paise,
      total: priced.total_paise,
      freeDeliveryAbove: threshold,
      freeDeliveryGap: freeDeliveryGap(localBill.subtotal, {
        ...charges,
        free_delivery_above_paise: threshold,
      }),
      minOrderGap:
        priced.min_order_paise == null
          ? localBill.minOrderGap
          : Math.max(priced.min_order_paise - localBill.subtotal, 0),
    };
  }, [priced, localBill, charges]);

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
         the effect above reprices. A code that does not apply comes back
         flagged coupon_rejected, with the best other coupon applied instead. */
      applyCoupon: (rawCode) => {
        const code = String(rawCode || "").trim().toUpperCase();
        if (!code) return;
        dispatch({ type: "coupon", code });
      },
      /* No coupon at all, even one that would apply by itself. Applying any
         code, or tapping an offer, brings one back. */
      removeCoupon: () => dispatch({ type: "coupon", code: "" }),
      /* Forget a refused code and let the best coupon apply again. */
      resetCoupon: () => dispatch({ type: "coupon", code: null }),
      couponPending: Boolean(state.coupon) && !priced,
      couponRejected: Boolean(state.coupon) && Boolean(priced?.coupon_rejected),
      flash,
    }),
    [state, bill, qtyOf, toast, flash, priced],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
