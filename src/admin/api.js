import { supabase } from "../lib/supabase";

/**
 * Everything the admin site reads and writes.
 *
 * It uses the same publishable key as the guest site. What makes an admin an
 * admin is not this file: it is the row-level security in migration 0018, which
 * looks the signed-in Google address up in admin_users. A guest who loaded
 * these pages would get empty lists and refused writes, not someone else's
 * data. So nothing here tries to hide or check anything -- it would only be
 * decoration.
 */

/* Postgres errors, said in words an admin can act on. */
function friendly(error) {
  const m = error?.message ?? String(error);
  if (error?.code === "23505") return "That already exists. Use a different value.";
  if (error?.code === "23503")
    return "It is still in use elsewhere (for example on past orders), so it cannot be deleted. Switch it off instead.";
  if (error?.code === "42501" || /row-level security|permission denied/i.test(m))
    return "Your account is not allowed to do that.";
  if (/check constraint/i.test(m)) return "One of the values is not allowed. Please check the form.";
  return m;
}

const must = ({ data, error }) => {
  if (error) throw new Error(friendly(error));
  return data;
};

/** Inserts when there is no id yet, updates when there is. Returns the row. */
async function save(table, row, select = "*") {
  const { id, ...fields } = row;
  const q = id
    ? supabase.from(table).update(fields).eq("id", id)
    : supabase.from(table).insert(fields);
  return must(await q.select(select).single());
}

async function remove(table, id) {
  must(await supabase.from(table).delete().eq("id", id));
}

/* Stored as ten digits, whatever was typed: "+91 98765 43210" -> 9876543210. */
export const tenDigits = (v) => {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
};
export const isMobile = (v) => /^[6-9]\d{9}$/.test(tenDigits(v));

// ------------------------------------------------------------------- session
export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthChange(fn) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => fn(session));
  return () => data.subscription.unsubscribe();
}

/** { email, roles: ["admin" | "super_admin"] } for whoever is signed in. */
export async function whoami() {
  return must(await supabase.rpc("admin_whoami"));
}

export async function signInWithGoogle() {
  /* A plain sign-in, not the guest site's linkIdentity: an admin is a person
     with a Google account, not a guest session to be upgraded. */
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/admin` },
  });
  if (error) throw new Error("Could not reach Google. Please try again.");
}

export async function signOut() {
  await supabase.auth.signOut();
}

// ------------------------------------------------------------------ kitchens
export const listKitchens = async () =>
  must(await supabase.from("kitchens").select("*").order("place_name"));
export const saveKitchen = (row) => save("kitchens", row);

// ---------------------------------------------------------------- categories
export const listCategories = async () =>
  must(await supabase.from("categories").select("*").order("sort_order").order("name"));
export const saveCategory = (row) => save("categories", row);
export const deleteCategory = (id) => remove("categories", id);

export const listMealWindows = async () =>
  must(await supabase.from("meal_windows").select("*").order("sort_order"));

// ---------------------------------------------------------------------- menu
const DISH = "*, kitchen:kitchens(id, place_name, is_active), category:categories(id, name)";
export const listDishes = async () =>
  must(await supabase.from("menu_items").select(DISH).order("name"));
export const saveDish = (row) => save("menu_items", row, DISH);
export const deleteDish = (id) => remove("menu_items", id);

/**
 * On or off the guest menu, saved the moment the switch is flipped. The
 * database broadcasts the change and every open menu refetches, so a dish
 * switched off disappears from guests' screens within a second or two.
 */
export async function setDishAvailable(id, available) {
  must(await supabase.from("menu_items").update({ is_available: available }).eq("id", id));
}

const BUCKET = "menu-images";

/**
 * Stores a dish photo and points the dish at it. Each upload gets a new name:
 * the old URL is cached by browsers for a year (it is immutable), so replacing
 * a photo under the same name would leave guests looking at the old one.
 */
export async function uploadDishImage(dishId, blob) {
  const path = `dishes/${dishId}-${Date.now().toString(36)}.jpg`;
  must(
    await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: false,
    }),
  );
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Best effort: an orphaned photo costs a few kilobytes, never a broken menu. */
export async function deleteDishImage(url) {
  const marker = `/object/public/${BUCKET}/`;
  const at = url?.indexOf(marker) ?? -1;
  if (at < 0) return;
  await supabase.storage.from(BUCKET).remove([url.slice(at + marker.length)]);
}

// -------------------------------------------------------- places and rooms
const PLACE = "*, rooms:addresses(id, room_number, is_active, created_at)";
export const listPlaces = async () =>
  must(await supabase.from("places").select(PLACE).order("name"));
export const savePlace = (row) => save("places", row, PLACE);

/** Adds rooms to a place. Each gets a fresh opaque code -- its QR id. */
export async function addRooms(placeId, roomNumbers) {
  return must(
    await supabase
      .from("addresses")
      .insert(roomNumbers.map((n) => ({ place_id: placeId, room_number: n })))
      .select("id, room_number, is_active, created_at"),
  );
}
export const saveRoom = (row) => save("addresses", row, "id, room_number, is_active, created_at");

// ---------------------------------------------------------- delivery partners
export const listPartners = async () =>
  must(await supabase.from("delivery_partners").select("*").order("name"));
export const savePartner = (row) => save("delivery_partners", row);

// ------------------------------------------------------------------ settings
export const listSettings = async () => must(await supabase.from("settings").select("*"));
export async function saveSetting(key, value) {
  must(
    await supabase
      .from("settings")
      .update({ value, updated_at: new Date().toISOString() })
      .eq("key", key),
  );
}

// -------------------------------------------------------------------- orders
const ORDER = `
  id, order_no, receipt_token, status, created_at, paid_at, guest_name, guest_phone,
  note, total_paise, subtotal_paise, discount_paise, coupon_code,
  needs_attention, attention_note, riders_offered_at, rider_assigned_at,
  delivery_partner_id,
  room:addresses(room_number, place:places(name, area)),
  rider:delivery_partners(id, name, whatsapp_number),
  items:order_items(id, name_snapshot, qty, line_total_paise, kitchen_id),
  tickets:order_tickets(id, kitchen_id, status, accepted_at, rejected_at, responded_by,
                        kitchen:kitchens(place_name, whatsapp_number)),
  offers:delivery_offers(id, status, responded_at, partner:delivery_partners(name)),
  messages:message_log(id, kind, recipient_type, recipient_number, status, error,
                       attempts, created_at)
`;

/** Paid orders since `sinceIso`, newest first. Unpaid checkouts are left out. */
export async function listOrders(sinceIso) {
  return must(
    await supabase
      .from("orders")
      .select(ORDER)
      .not("paid_at", "is", null)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(200),
  );
}

/** Orders still waiting on someone, however old. */
export async function listOpenAttention() {
  return must(
    await supabase
      .from("orders")
      .select(ORDER)
      .eq("needs_attention", true)
      .order("created_at", { ascending: false })
      .limit(100),
  );
}

/**
 * Sends whatever an admin action just queued, now rather than at the next
 * minute's sweep. If this fails the messages are not lost -- they are still
 * queued and the sweep sends them -- so the action itself has still worked.
 */
async function sendNow(orderId) {
  const { error } = await supabase.functions.invoke("whatsapp-dispatch", {
    body: { order_id: orderId },
  });
  return !error;
}

async function act(fn, args) {
  const out = must(await supabase.rpc(fn, args));
  const sent = out?.order_id ? await sendNow(out.order_id) : true;
  return { ...out, sent };
}

export const recordKitchenAnswer = (ticketId, accept) =>
  act("admin_ticket_decision", { p_ticket_id: ticketId, p_accept: accept });
export const assignRider = (orderId, partnerId) =>
  act("admin_assign_rider", { p_order_id: orderId, p_partner_id: partnerId });
export const setOrderStatus = (orderId, status) =>
  act("admin_set_order_status", { p_order_id: orderId, p_status: status });
export const resolveAttention = (orderId) =>
  act("admin_resolve_attention", { p_order_id: orderId });
export const retryMessage = (messageId) => act("admin_retry_message", { p_message_id: messageId });

// --------------------------------------------------------- super admin only
export const loadAnalytics = async (period) =>
  must(await supabase.rpc("admin_analytics", { p_period: period }));

export const listCoupons = async () =>
  must(await supabase.from("coupons").select("*").order("created_at", { ascending: false }));

/* Coupons are keyed by their code, not an id. */
export async function saveCoupon(row, isNew) {
  const q = isNew
    ? supabase.from("coupons").insert(row)
    : supabase.from("coupons").update(row).eq("code", row.code);
  return must(await q.select("*").single());
}
export async function deleteCoupon(code) {
  must(await supabase.from("coupons").delete().eq("code", code));
}
