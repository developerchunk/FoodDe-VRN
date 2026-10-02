import { supabase } from "./supabase";

/**
 * "The menu just changed" — heard live, the moment an admin switches a dish
 * off, edits a price or closes a kitchen.
 *
 * The database sends a bare `changed` on the public `menu` broadcast topic
 * whenever menu_items, categories or kitchens change (migration 0018). The
 * message carries nothing — not the dish, not the kitchen — so listening to it
 * reveals nothing get_menu() does not. Whoever hears it simply asks get_menu()
 * again, which stays the only source of truth.
 *
 * One channel is shared by every listener on the page, and closed when the last
 * one leaves. If Realtime is unreachable, nothing breaks: the menu still
 * refreshes on its timer and when the tab comes back, and place_order and the
 * payment step refuse anything that is no longer available.
 */
const listeners = new Set();
let channel = null;

export function onMenuChange(fn) {
  if (!supabase) return () => {};
  listeners.add(fn);

  if (!channel) {
    channel = supabase
      .channel("menu")
      .on("broadcast", { event: "changed" }, () => listeners.forEach((l) => l()))
      .subscribe();
  }

  return () => {
    listeners.delete(fn);
    if (!listeners.size && channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
  };
}

/** A refetch that coalesces a burst of changes (a bulk edit) into one. */
export function debounced(fn, ms = 400) {
  let t;
  const run = () => {
    clearTimeout(t);
    t = setTimeout(fn, ms);
  };
  run.cancel = () => clearTimeout(t);
  return run;
}
