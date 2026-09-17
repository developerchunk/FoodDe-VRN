import { createContext, useContext } from "react";

/**
 * Kept in its own module (no component exports) so React Fast Refresh never
 * swaps the context object out from under the components consuming it.
 */
export const CartContext = createContext(null);

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
