import { supabase } from "./supabase";

const TOKENS_KEY = "ird.receipts.v1";

/**
 * A guest signs in anonymously before ordering. They never see it happen, but
 * the order has to belong to a user or it can never be shown back to them —
 * and it is the same account Google sign-in later links to, which is what lets
 * a guest's history survive making an account.
 */
export async function ensureGuestSession() {
  if (!supabase) throw new Error("Ordering is unavailable right now.");

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) return session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    /* Almost always means anonymous sign-ins are disabled for the project. */
    throw new Error(
      "Could not start a guest session. Please reload and try again.",
    );
  }
  return data.session;
}

/**
 * Places the order.
 *
 * Only ids and quantities are sent. Every price, the discount, the tax and the
 * total are recomputed in the database — whatever this browser believes the
 * total to be is irrelevant, which is the point.
 */
export async function placeOrder({ addressCode, lines, guest, coupon, donate, note }) {
  await ensureGuestSession();

  const { data, error } = await supabase.rpc("place_order", {
    p_address_code: addressCode,
    p_items: lines.map((l) => ({ id: l.id, qty: l.qty })),
    p_guest: guest,
    p_coupon: coupon || null,
    p_donate: !!donate,
    p_note: note || null,
  });

  if (error) throw new Error(error.message);

  rememberReceipt(data.order_no, data.receipt_token);
  return data;
}

/** Reads one order back. Holding the token is the authorisation. */
export async function fetchReceipt(token) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_receipt", { p_token: token });
  return error ? null : data;
}

export async function fetchCoupons() {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("get_coupons");
  return error ? [] : data || [];
}

/* The tokens live on this device so a guest who never signs in can still find
   their way back to a receipt. The orders themselves are in the database. */
export function rememberReceipt(orderNo, token) {
  try {
    const held = listReceipts().filter((r) => r.token !== token);
    localStorage.setItem(
      TOKENS_KEY,
      JSON.stringify([{ orderNo, token, at: Date.now() }, ...held].slice(0, 25)),
    );
  } catch {
    /* private mode: the receipt link still works, it just is not remembered */
  }
}

export function listReceipts() {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY)) || [];
  } catch {
    return [];
  }
}
