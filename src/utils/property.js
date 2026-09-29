import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
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

/** The room code a link carries: `/menu?id=<code>`, or `/r/<code>` on the
 *  stickers printed before that form existed. */
const codeFrom = ({ pathname, search }) =>
  new URLSearchParams(search).get("id") ||
  pathname.match(/^\/r\/([A-Za-z0-9]+)/)?.[1] ||
  null;

/**
 * Resolves the room code in the link to the rest house and room it was printed
 * for, and remembers it for the session — the code only appears in the URL on
 * the first scan, but the cart and checkout still need to know which room they
 * belong to.
 *
 * The lookup goes through the `resolve_address` function rather than reading
 * the table, because the table is deliberately unreadable: one code returns one
 * room, and there is no way to enumerate the rest.
 */
/** A row from `resolve_address`, in the shape the app holds a stay in. */
const stayFrom = (row) => ({
  property: row.place_name,
  /* the guest house's full street address from address_map, falling back to
     its locality if that column is empty */
  address:
    row.address || [row.area, row.city, row.pin_code].filter(Boolean).join(", "),
  area: [row.area, row.city].filter(Boolean).join(", "),
  room: row.room_number,
  addressId: row.address_id,
});

/* The printed codes use an alphabet with no vowels and no 0/O/1/l, so they
   cannot be misread into each other. Spaces and dashes are what people add
   when copying one off a card, and mean nothing. */
/**
 * A scanned QR gives back whatever the sticker encodes — a full link, not a
 * bare code. Pull the id out of any of the forms we have ever printed, and fall
 * back to treating the text as the code itself when someone types it.
 */
export const codeFromScanned = (text) => {
  const raw = String(text || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const fromQuery = url.searchParams.get("id");
    if (fromQuery) return normaliseRoomCode(fromQuery);
    const fromPath = url.pathname.match(/\/r\/([A-Za-z0-9-]+)/)?.[1];
    if (fromPath) return normaliseRoomCode(fromPath);
    return "";
  } catch {
    /* not a url: someone typed the code */
    return normaliseRoomCode(raw);
  }
};

export const normaliseRoomCode = (raw) =>
  String(raw || "").trim().toLowerCase().replace(/[\s-]/g, "");

function useResolvedProperty() {
  const location = useLocation();
  const code = codeFrom(location);
  const [house, setHouse] = useState(() => readHeld() || HOUSE_DEFAULT);

  useEffect(() => {
    /* No code, or no Supabase configured: keep whatever stay we already hold
       and leave the guest on the plain site rather than erroring. */
    if (!code || !/^[A-Za-z0-9]+$/.test(code) || !supabase) return;

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase.rpc("resolve_address", {
        p_code: code.toLowerCase(),
      });

      /* An unknown, retired or unresolvable code leaves the guest on the plain
         site rather than stranding them on an error page. */
      if (cancelled || error || !data?.length) return;

      const stay = stayFrom(data[0]);

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
  }, [code]);

  /**
   * The same lookup, asked for deliberately rather than by following a link.
   *
   * A camera that will not focus, a sticker that has been peeled off, or a
   * guest reading the code to the front desk over the phone all end here. It
   * is the same `resolve_address` call the QR makes, so it grants nothing the
   * QR does not: one code returns one room, and the table stays unreadable, so
   * there is still no way to walk the codes and find other rooms.
   */
  const resolveRoom = useCallback(async (raw) => {
    const code = normaliseRoomCode(raw);
    if (!code) return { ok: false, error: "Enter the code printed in your room." };
    if (!/^[a-z0-9]+$/.test(code))
      return { ok: false, error: "That code has characters we do not use." };
    if (!supabase)
      return { ok: false, error: "We cannot look that up right now." };

    const { data, error } = await supabase.rpc("resolve_address", {
      p_code: code,
    });
    if (error) return { ok: false, error: "We cannot look that up right now." };
    if (!data?.length)
      return { ok: false, error: "We do not recognise that code. Check it and try again." };

    const stay = stayFrom(data[0]);
    try {
      sessionStorage.setItem(STAY_KEY, JSON.stringify(stay));
    } catch {
      /* private mode: the stay lasts this page rather than the session */
    }
    setHouse(stay);
    return { ok: true, stay };
  }, []);


  return { house, resolveRoom };
}

const PropertyContext = createContext({
  house: HOUSE_DEFAULT,
  resolveRoom: async () => ({ ok: false, error: "not ready" }),
});

/** Resolves the stay once for the whole app, so every reader shares one lookup. */
export function PropertyProvider({ children }) {
  return createElement(
    PropertyContext.Provider,
    { value: useResolvedProperty() },
    children,
  );
}

export const useProperty = () => useContext(PropertyContext).house;
/** Look up a room by its printed code, for guests who cannot scan. */
export const useResolveRoom = () => useContext(PropertyContext).resolveRoom;
