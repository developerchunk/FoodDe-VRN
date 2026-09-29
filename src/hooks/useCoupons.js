import { useEffect, useState } from "react";
import { fetchCoupons } from "../lib/orders";

/**
 * The coupons currently on offer, from the database.
 *
 * There is no hardcoded list. Whatever rows are active in `coupons` is what a
 * guest can use, so adding or retiring an offer is a row, not a deployment.
 * What each one is *worth* is not here: `get_coupons()` returns only the code,
 * the label and the minimum spend, because the value is the database's business
 * and is applied by `price_order()`.
 */
export function useCoupons() {
  const [offers, setOffers] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetchCoupons().then((rows) => {
      if (!cancelled) setOffers(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return offers;
}
