import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useCallback,
} from "react";
import { CartContext } from "./cart-context";
import { MENU } from "../data/menu";
import { computeBill, COUPONS } from "../utils/pricing";

const CART_KEY = "brajrasoi.cart.v1";

const loadInitial = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_KEY));
    if (!saved)
      return { lines: [], coupon: null, donate: false, instructions: "" };
    return {
      lines: Array.isArray(saved.lines)
        ? saved.lines.filter((l) => MENU.some((m) => m.id === l.id))
        : [],
      coupon: saved.coupon && COUPONS[saved.coupon] ? saved.coupon : null,
      donate: !!saved.donate,
      instructions:
        typeof saved.instructions === "string" ? saved.instructions : "",
    };
  } catch {
    return { lines: [], coupon: null, donate: false, instructions: "" };
  }
};

function reducer(state, action) {
  switch (action.type) {
    case "add": {
      const item = MENU.find((m) => m.id === action.id);
      if (!item) return state;
      const existing = state.lines.find((l) => l.id === action.id);
      const lines = existing
        ? state.lines.map((l) =>
            l.id === action.id ? { ...l, qty: Math.min(l.qty + 1, 20) } : l,
          )
        : [
            ...state.lines,
            {
              id: item.id,
              name: item.name,
              hindi: item.hindi,
              price: item.price,
              sattvic: item.sattvic,
              qty: 1,
            },
          ];
      return { ...state, lines };
    }
    case "decrement": {
      const lines = state.lines
        .map((l) => (l.id === action.id ? { ...l, qty: l.qty - 1 } : l))
        .filter((l) => l.qty > 0);
      return { ...state, lines, coupon: lines.length ? state.coupon : null };
    }
    case "remove": {
      const lines = state.lines.filter((l) => l.id !== action.id);
      return { ...state, lines, coupon: lines.length ? state.coupon : null };
    }
    case "clear":
      return { lines: [], coupon: null, donate: false, instructions: "" };
    case "coupon":
      return { ...state, coupon: action.code };
    case "donate":
      return { ...state, donate: action.value };
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

  const bill = useMemo(
    () =>
      computeBill(state.lines, { coupon: state.coupon, donate: state.donate }),
    [state.lines, state.coupon, state.donate],
  );

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
        dispatch({ type: "add", id: item.id });
        flash(`${item.name} added to your thali`);
      },
      decrement: (id) => dispatch({ type: "decrement", id }),
      remove: (id) => dispatch({ type: "remove", id }),
      clear: () => dispatch({ type: "clear" }),
      setDonate: (value) => dispatch({ type: "donate", value }),
      setInstructions: (value) => dispatch({ type: "instructions", value }),
      applyCoupon: (rawCode) => {
        const code = String(rawCode || "")
          .trim()
          .toUpperCase();
        const c = COUPONS[code];
        if (!c) {
          flash(`“${code}” is not a valid code`, "error");
          return false;
        }
        if (bill.subtotal < c.minOrder) {
          flash(`${code} needs a cart of ₹${c.minOrder} or more`, "error");
          return false;
        }
        dispatch({ type: "coupon", code });
        flash(`${code} applied — ${c.label}`);
        return true;
      },
      removeCoupon: () => dispatch({ type: "coupon", code: null }),
      flash,
    }),
    [state, bill, qtyOf, toast, flash],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
