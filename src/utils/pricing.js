/**
 * Every amount here is an integer number of paise.
 *
 * Rupees as floats do not survive contact with real money: 26.95 is not
 * representable in binary, so three of them is 80.85000000000001 and a tax
 * line eventually disagrees with an invoice. The database stores paise for the
 * same reason; this keeps the arithmetic in the same units the whole way.
 */
export const FREE_DELIVERY_ABOVE_PAISE = 29900; // ₹299
export const DELIVERY_PAISE = 2900; // ₹29
export const PACKING_PAISE = 1500; // ₹15
export const GST_RATE = 0.05;

export const COUPONS = {
  RADHE50: {
    code: "RADHE50",
    label: "₹50 off on orders above ₹299",
    minOrderPaise: 29900,
    apply: () => 5000,
  },
  FIRSTMEAL: {
    code: "FIRSTMEAL",
    label: "15% off your first order (max ₹100)",
    minOrderPaise: 19900,
    apply: (sub) => Math.min(Math.round(sub * 0.15), 10000),
  },
  SATTVIC20: {
    code: "SATTVIC20",
    label: "₹20 off any sattvic order above ₹249",
    minOrderPaise: 24900,
    apply: () => 2000,
  },
};

/**
 * Single source of truth for the bill, so cart, checkout, order and receipt can
 * never disagree.
 *
 * This is the *display* bill. The edge function recomputes it from the database
 * before taking money — the client's arithmetic is never the authority.
 */
export function computeBill(lines, { coupon = null, donate = false } = {}) {
  const subtotal = lines.reduce((sum, l) => sum + l.pricePaise * l.qty, 0);
  const itemCount = lines.reduce((sum, l) => sum + l.qty, 0);

  let discount = 0;
  let couponCode = null;
  const c = coupon ? COUPONS[coupon] : null;
  if (c && subtotal >= c.minOrderPaise) {
    discount = Math.min(c.apply(subtotal), subtotal);
    couponCode = c.code;
  }

  const taxable = Math.max(subtotal - discount, 0);
  const delivery =
    subtotal === 0 ? 0 : subtotal >= FREE_DELIVERY_ABOVE_PAISE ? 0 : DELIVERY_PAISE;
  const packing = subtotal === 0 ? 0 : PACKING_PAISE;
  const gst = Math.round(taxable * GST_RATE);
  const donation = donate ? 500 : 0;
  const total = taxable + delivery + packing + gst + donation;

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
    freeDeliveryGap: Math.max(FREE_DELIVERY_ABOVE_PAISE - subtotal, 0),
  };
}
