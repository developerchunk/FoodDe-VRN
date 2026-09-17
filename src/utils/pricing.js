export const FREE_DELIVERY_ABOVE = 299;
export const DELIVERY_FEE = 29;
export const PACKING_FEE = 15;
export const GST_RATE = 0.05;

export const COUPONS = {
  RADHE50: {
    code: "RADHE50",
    label: "₹50 off on orders above ₹299",
    minOrder: 299,
    apply: () => 50,
  },
  FIRSTMEAL: {
    code: "FIRSTMEAL",
    label: "15% off your first order (max ₹100)",
    minOrder: 199,
    apply: (sub) => Math.min(Math.round(sub * 0.15), 100),
  },
  SATTVIC20: {
    code: "SATTVIC20",
    label: "₹20 off any sattvic thali order above ₹249",
    minOrder: 249,
    apply: () => 20,
  },
};

/**
 * Single source of truth for the bill. Used by the cart, the checkout summary,
 * the placed order and the receipt so the numbers can never drift apart.
 */
export function computeBill(lines, { coupon = null, donate = false } = {}) {
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const itemCount = lines.reduce((sum, l) => sum + l.qty, 0);

  let discount = 0;
  let couponCode = null;
  const c = coupon ? COUPONS[coupon] : null;
  if (c && subtotal >= c.minOrder) {
    discount = Math.min(c.apply(subtotal), subtotal);
    couponCode = c.code;
  }

  const taxable = Math.max(subtotal - discount, 0);
  const delivery =
    subtotal === 0 ? 0 : subtotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_FEE;
  const packing = subtotal === 0 ? 0 : PACKING_FEE;
  const gst = Math.round(taxable * GST_RATE * 100) / 100;
  const donation = donate ? 5 : 0;
  /* no rounding — the total is exactly what the line items add up to */
  const total =
    Math.round((taxable + delivery + packing + gst + donation) * 100) / 100;

  return {
    subtotal,
    itemCount,
    discount,
    couponCode,
    delivery,
    packing,
    gst,
    donation,
    total,
    freeDeliveryGap: Math.max(FREE_DELIVERY_ABOVE - subtotal, 0),
  };
}
