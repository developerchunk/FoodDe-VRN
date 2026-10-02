import { supabase } from "./supabase";

/**
 * The menu, as the browser is allowed to see it.
 *
 * Everything comes from `get_menu()`. There is no table read here on purpose:
 * `menu_items` is closed to the browser precisely because it carries
 * `kitchen_id`, and a guest must never learn their order is being split across
 * kitchens. The function returns `is_available_now` instead — a boolean
 * computed from that kitchen's opening hours, server-side, in IST.
 */

/* DishArt has no photographs to work from yet, so each dish is given an
   illustration chosen from its own name. Deterministic, so a dish does not
   change its picture between page loads. */
const BY_KEYWORD = [
  [/thali/i, "thali"],
  [/lassi|chaas|thandai|juice|shake|water/i, "drink"],
  [/coffee|tea|chai/i, "cup"],
  [/dosa|uttapam/i, "dosa"],
  [/noodle|hakka|chowmein/i, "noodles"],
  [/soup|shorba/i, "soup"],
  [/momo|dumpling/i, "momo"],
  [/roll|spring/i, "roll"],
  [/burger|sandwich/i, "burger"],
  [/pizza/i, "pizza"],
  [/fries|wedges/i, "fries"],
  [/chaat|bhalla|tikki/i, "chaat"],
  [/jalebi/i, "jalebi"],
  [/barfi|katli/i, "barfi"],
  [/peda|laddu|gulab|halwa|kheer|rabri|malpua|sweet/i, "sweet"],
  [/kachori|samosa|puri|vada|pakoda|bedai|idli/i, "fried"],
  [/roti|naan|paratha|kulcha|bread|bhatura/i, "bread"],
  [/rice|biryani|pulao|khichdi|chawal/i, "rice"],
  [/tikka|kadhai|dry|masala\s*dry/i, "kadhai"],
  [/makhan|mishri|curd|dahi/i, "leaf"],
  [/platter|combo|meal/i, "combo"],
];

const PALETTES = [
  ["#d9683a", "#b34a25", "#fdf6e3"],
  ["#e8c14e", "#c39a24", "#8e3c14"],
  ["#e7c27a", "#c99a45", "#fdf6e3"],
  ["#e2b64e", "#bd8a2a", "#4a7a3b"],
  ["#eec75c", "#d29b31", "#fffdf6"],
  ["#d9a95c", "#b0762c", "#fdf6e3"],
  ["#c98a2f", "#8e5a1a", "#efd9a6"],
];

const hash = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

const artFor = (name, categoryName) => {
  const hay = `${name} ${categoryName}`;
  for (const [re, art] of BY_KEYWORD) if (re.test(hay)) return art;
  return "curry";
};

/* The sidebar glyph for a category, chosen from its name the same way. */
const CATEGORY_ICON = [
  [/thali|combo|meal/i, "thali"],
  [/south|dosa|idli/i, "dosa"],
  [/chinese|noodle|indo/i, "noodles"],
  [/rice|biryani|pulao/i, "bowl"],
  [/bread|roti|naan|paratha/i, "bread"],
  [/sweet|dessert|mithai/i, "sweet"],
  [/drink|beverage|lassi|shake|juice|tea|coffee/i, "cup"],
  [/snack|starter|chaat|street/i, "snack"],
  [/burger|sandwich|pizza|continental|fast/i, "burger"],
];

const iconFor = (name) =>
  CATEGORY_ICON.find(([re]) => re.test(name))?.[1] ?? "kadhai";

/* "07:00:00" -> "7" / "7:30". Compact on purpose: this sits on a dish card
   next to the price, and "7:00 am – 11:00 am" crowds it out. */
const clock12 = (t) => {
  if (!t) return null;
  const [h, m] = String(t).split(":").map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}` : `${hour}:${String(m).padStart(2, "0")}`;
};
const suffix = (t) => (Number(String(t).split(":")[0]) < 12 ? "am" : "pm");

/** "Breakfast · 7 – 11 am", "1 – 3 pm" for custom timing, or null when the
    dish is served all day. */
const mealWindow = (row) => {
  if (!row.meal_time || row.meal_time === "all_day") return null;
  if (!row.meal_starts_at || !row.meal_ends_at) return row.meal_label || null;
  const a = suffix(row.meal_starts_at);
  const b = suffix(row.meal_ends_at);
  /* Both in the same half of the day: say "am" once. */
  const from = a === b ? clock12(row.meal_starts_at) : `${clock12(row.meal_starts_at)} ${a}`;
  const hours = `${from} – ${clock12(row.meal_ends_at)} ${b}`;
  /* "Custom timing" is the admin's word for it; a guest only needs the hours. */
  return row.meal_time === "custom" ? hours : `${row.meal_label} · ${hours}`;
};

/** One row of `get_menu()`, in the shape the components expect. */
const shape = (row) => ({
  id: row.id,
  name: row.name,
  desc: row.description || "",
  /* money stays in integer paise the whole way through */
  pricePaise: row.price_paise,
  cat: row.category_slug,
  categoryName: row.category_name,
  sattvic: row.is_sattvic,
  spicy: row.is_spicy,
  loved: row.is_loved,
  imageUrl: row.image_url,
  availableNow: row.is_available_now,
  mealTime: row.meal_time || "all_day",
  /* null when served all day, so the card can simply not render the chip */
  mealWindow: mealWindow(row),
  ingredients: row.ingredients,
  serves: row.cooking_time_mins ? `${row.cooking_time_mins} min` : null,
  art: artFor(row.name, row.category_name),
  palette: PALETTES[hash(row.id) % PALETTES.length],
  tags: [row.is_loved && "bestseller", row.is_spicy && "spicy"].filter(Boolean),
});

export async function fetchMenu() {
  if (!supabase) return { items: [], categories: [], error: "not-configured" };

  const { data, error } = await supabase.rpc("get_menu");
  if (error) return { items: [], categories: [], error: error.message };

  const items = (data || []).map(shape);

  /* Categories are whatever the menu actually contains, in the order the
     database asked for — rather than a hardcoded list that can drift out of
     step with the dishes. */
  const seen = new Map();
  for (const row of data || []) {
    if (!seen.has(row.category_slug)) {
      seen.set(row.category_slug, {
        id: row.category_slug,
        name: row.category_name,
        icon: iconFor(row.category_name),
        sort: row.category_sort ?? 0,
      });
    }
  }
  const categories = [...seen.values()].sort((a, b) => a.sort - b.sort);

  return { items, categories, error: null };
}
