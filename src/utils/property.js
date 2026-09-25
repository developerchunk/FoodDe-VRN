import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

const STAY_KEY = "ird.stay.v1";

/** What a visitor sees when they arrive without scanning anything. */
export const HOUSE_DEFAULT = {
  property: "In Room Dining",
  address: "",
  room: "",
  addressId: null,
};

const readHeld = () => {
  try {
    const held = JSON.parse(sessionStorage.getItem(STAY_KEY));
    return held?.property ? held : null;
  } catch {
    return null;
  }
};

/**
 * Resolves the QR code in `/r/<code>` to the rest house and room it was printed
 * for, and remembers it for the session — the code only appears in the URL on
 * the first scan, but the cart and checkout still need to know which room they
 * belong to.
 *
 * The lookup goes through the `resolve_address` function rather than reading
 * the table, because the table is deliberately unreadable: one code returns one
 * room, and there is no way to enumerate the rest.
 */
export function useProperty() {
  const { pathname } = useLocation();
  const [house, setHouse] = useState(() => readHeld() || HOUSE_DEFAULT);

  useEffect(() => {
    const code = pathname.match(/^\/r\/([A-Za-z0-9]+)/)?.[1];
    /* No code, or no Supabase configured: keep whatever stay we already hold
       and leave the guest on the plain site rather than erroring. */
    if (!code || !supabase) return;

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase.rpc("resolve_address", {
        p_code: code.toLowerCase(),
      });

      /* An unknown, retired or unresolvable code leaves the guest on the plain
         site rather than stranding them on an error page. */
      if (cancelled || error || !data?.length) return;

      const row = data[0];
      const stay = {
        property: row.place_name,
        address: [row.area, row.city, row.pin_code].filter(Boolean).join(", "),
        room: row.room_number,
        addressId: row.address_id,
      };

      try {
        sessionStorage.setItem(STAY_KEY, JSON.stringify(stay));
      } catch {
        /* private mode: the stay lasts this page rather than the session */
      }
      setHouse(stay);
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return house;
}
