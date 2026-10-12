/**
 * Every amount here is an integer number of paise.
 *
 * Rupees as floats do not survive contact with real money: 26.95 is not
 * representable in binary, so three of them is 80.85000000000001 and a tax
 * line eventually disagrees with an invoice. The database stores paise for the
 * same reason; this keeps the arithmetic in the same units the whole way.
 */
export const GST_RATE = 0.05;

/**
 * Delivery, packing, the free-delivery threshold and the minimum order are
 * settings the super admin changes (`get_pricing()`). These are only what the cart assumes until
 * that answer arrives, and they match the database's own fallbacks.
 */
export const DEFAULT_CHARGES = {
  delivery_paise: 2900, // ₹29
  packing_paise: 1500, // ₹15
  free_delivery_above_paise: 19900, // ₹199
  min_order_paise: 6000, // ₹60
};

/* How much more food makes delivery free. Nothing to chase when it already is. */
export const freeDeliveryGap = (subtotal, charges) =>
  charges.delivery_paise > 0
    ? Math.max(charges.free_delivery_above_paise - subtotal, 0)
    : 0;

/**
 * Single source of truth for the bill, so cart, checkout, order and receipt can
 * never disagree.
 *
 * This is the *display* bill. The edge function recomputes it from the database
 * before taking money — the client's arithmetic is never the authority.
 */
export function computeBill(lines, charges = DEFAULT_CHARGES) {
  const subtotal = lines.reduce((sum, l) => sum + l.pricePaise * l.qty, 0);
  const itemCount = lines.reduce((sum, l) => sum + l.qty, 0);

  const delivery =
    subtotal === 0 || subtotal >= charges.free_delivery_above_paise
      ? 0
      : charges.delivery_paise;
  const packing = subtotal === 0 ? 0 : charges.packing_paise;
  const gst = Math.round(subtotal * GST_RATE);
  const total = subtotal + delivery + packing + gst;

  return {
    subtotal,
    itemCount,
    delivery,
    packing,
    gst,
    total,
    freeDeliveryAbove: charges.free_delivery_above_paise,
    freeDeliveryGap: freeDeliveryGap(subtotal, charges),
    /* food still to add before the order can be placed; the database refuses
       an order below the minimum whatever this says */
    minOrderGap: subtotal === 0 ? 0 : Math.max(charges.min_order_paise - subtotal, 0),
  };
}
