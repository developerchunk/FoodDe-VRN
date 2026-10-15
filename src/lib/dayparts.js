/**
 * Which categories to put first on the menu, for the time of day.
 *
 * Guests open the menu hungry for whatever the clock says: breakfast at 8,
 * a thali at 1, tea and snacks at 5. The admin's category order stays the
 * baseline; the (up to) three categories that suit the moment float to the
 * front and everything else keeps its place behind them.
 *
 * Nothing here is stored. A category is matched to a part of the day by its
 * name, and by the meal windows of the dishes inside it, so a menu needs no
 * extra setup — and no migration — for this to work.
 */

const FLOAT = 3;

/* Minutes from midnight, Indian time (the only place guests order from).
   `end` may be smaller than `start`: that window runs past midnight. */
const DAYPARTS = {
  breakfast: { label: "Breakfast", start: 6 * 60, end: 11 * 60 },
  brunch: { label: "Brunch", start: 10 * 60, end: 13 * 60 },
  lunch: { label: "Lunch", start: 11 * 60, end: 16 * 60 },
  hiTea: { label: "Hi-tea", start: 16 * 60, end: 19 * 60 },
  dinner: { label: "Dinner", start: 19 * 60, end: 23 * 60 },
  lateNight: { label: "Late night", start: 23 * 60, end: 6 * 60 },
};

/* Brunch is a weekend meal: Saturday and Sunday trade the long weekday
   breakfast for a shorter one, a brunch, and a later lunch. */
const WEEKEND = {
  breakfast: { ...DAYPARTS.breakfast, end: 10 * 60 },
  brunch: DAYPARTS.brunch,
  lunch: { ...DAYPARTS.lunch, start: 13 * 60 },
};

/* What each part of the day is called on the menu. The first pattern is the
   category named for the meal itself; the second is food that suits it. */
const NAMED = {
  breakfast: /breakfast|nashta|nasta/i,
  brunch: /brunch/i,
  lunch: /lunch/i,
  hiTea: /hi[\s-]*tea|\btea\b|snack/i,
  dinner: /dinner/i,
  lateNight: /late[\s-]*night|snack|meals?\b/i,
};
const SUITS = {
  breakfast: /paratha|poha|puri|kachori|bedai|jalebi|idli|dosa|south/i,
  brunch: /breakfast|sandwich|burger|pizza|continental|paratha|chaat/i,
  lunch: /thali|meal|combo|north indian|rice|biryani|roti|bread|curry/i,
  hiTea: /chai|coffee|chaat|starter|pakora|samosa|sandwich|fast|street|beverage|drink|sweet|dessert/i,
  dinner: /thali|meal|combo|north indian|rice|biryani|roti|bread|chinese|indo|noodle|curry/i,
  lateNight: /chinese|noodle|pizza|burger|fast|street|dessert|sweet|beverage|drink|combo/i,
};

const IST = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The clock in Vrindavan, wherever the phone thinks it is. */
function clock(now) {
  const p = Object.fromEntries(
    IST.formatToParts(now).map((x) => [x.type, x.value]),
  );
  return {
    minutes: Number(p.hour) * 60 + Number(p.minute),
    weekend: p.weekday === "Sat" || p.weekday === "Sun",
  };
}

/* A window as pieces of one 24-hour day, so one that wraps past midnight
   becomes two. */
const pieces = (start, end) =>
  end > start
    ? [[start, end]]
    : [
        [start, 24 * 60],
        [0, end],
      ];

const minutesOf = (t) => {
  if (!t) return null;
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + m;
};

function overlap(a, b) {
  let total = 0;
  for (const [a0, a1] of pieces(a.start, a.end))
    for (const [b0, b1] of pieces(b.start, b.end))
      total += Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  return total;
}

/** The parts of the day that are on at `now`, most specific first. */
export function currentDayparts(now = new Date()) {
  const { minutes, weekend } = clock(now);
  const table = weekend ? { ...DAYPARTS, ...WEEKEND } : DAYPARTS;
  const here = Object.entries(table).filter(([, w]) =>
    pieces(w.start, w.end).some(([s, e]) => minutes >= s && minutes < e),
  );
  /* The shorter window is the better description of the moment: at noon on a
     Sunday it is brunch more than it is lunch. */
  here.sort(
    (a, b) =>
      pieces(a[1].start, a[1].end).reduce((n, [s, e]) => n + e - s, 0) -
      pieces(b[1].start, b[1].end).reduce((n, [s, e]) => n + e - s, 0),
  );
  return here.map(([key, w]) => ({ key, ...w }));
}

/* How well one category suits the moment. Higher floats sooner. */
function score(cat, dishes, parts) {
  let best = 0;
  parts.forEach((part, rank) => {
    /* the first (best) part counts for most, the rest a little less */
    const weight = 1 - rank * 0.25;
    let s = 0;
    if (NAMED[part.key].test(cat.name)) s += 100;
    else if (SUITS[part.key].test(cat.name)) s += 20;

    /* dishes that carry a meal window of their own say it outright */
    let windowed = 0;
    for (const d of dishes) {
      const start = minutesOf(d.mealStart);
      const end = minutesOf(d.mealEnd);
      if (start === null || end === null) continue;
      const span = pieces(start, end).reduce((n, [a, b]) => n + b - a, 0);
      windowed += span ? overlap(part, { start, end }) / span : 0;
    }
    s += (windowed / dishes.length) * 60;

    best = Math.max(best, s * weight);
  });

  /* A category with nothing orderable right now should not lead the menu;
     among equals, the one with more to order wins. */
  const open = dishes.filter((d) => d.availableNow).length;
  return best > 0 ? best * (open ? 1 : 0.1) + open / dishes.length : 0;
}

/**
 * `categories` with the best three for `now` moved to the front. The rest keep
 * the admin's order, and so does everything when nothing stands out.
 */
export function floatForNow(categories, items, now = new Date()) {
  const parts = currentDayparts(now);
  if (!parts.length || categories.length <= 1) return categories;

  const byCat = new Map();
  for (const item of items) {
    if (!byCat.has(item.cat)) byCat.set(item.cat, []);
    byCat.get(item.cat).push(item);
  }

  const scored = categories.map((cat, index) => ({
    cat,
    index,
    score: byCat.has(cat.id) ? score(cat, byCat.get(cat.id), parts) : 0,
  }));

  const top = scored
    .filter((s) => s.score >= 1)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, FLOAT)
    .map((s) => s.cat);

  if (!top.length) return categories;
  return [...top, ...categories.filter((c) => !top.includes(c))];
}
