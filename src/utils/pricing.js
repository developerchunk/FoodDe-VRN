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

/**
 * Single source of truth for the bill, so cart, checkout, order and receipt can
 * never disagree.
 *
 * This is the *display* bill. The edge function recomputes it from the database
 * before taking money — the client's arithmetic is never the authority.
 */
export function computeBill(lines) {
  const subtotal = lines.reduce((sum, l) => sum + l.pricePaise * l.qty, 0);
  const itemCount = lines.reduce((sum, l) => sum + l.qty, 0);

  const delivery =
    subtotal === 0 ? 0 : subtotal >= FREE_DELIVERY_ABOVE_PAISE ? 0 : DELIVERY_PAISE;
  const packing = subtotal === 0 ? 0 : PACKING_PAISE;
  const gst = Math.round(subtotal * GST_RATE);
  const total = subtotal + delivery + packing + gst;

  return {
    subtotal,
    itemCount,
    delivery,
    packing,
    gst,
    total,
    freeDeliveryGap: Math.max(FREE_DELIVERY_ABOVE_PAISE - subtotal, 0),
  };
}
