/**
 * Number and time formatting shared by the super admin's report pages
 * (Analytics, Activity). Everything is shown in Vrindavan time.
 */

export const IST = "Asia/Kolkata";
export const n0 = (v) => Number(v ?? 0);
export const int = (v) => n0(v).toLocaleString("en-IN");
/* Analytics round to the rupee: a headline of ₹1,24,503.47 is noise. */
export const money = (paise) => "₹" + Math.round(n0(paise) / 100).toLocaleString("en-IN");
export const mins = (v) => (v == null ? "—" : `${Number(v).toLocaleString("en-IN")} min`);
export const pct = (num, den) => (den ? `${Math.round((num / den) * 100)}%` : "—");

export function bucketLabel(iso, unit, long = false) {
  const d = new Date(iso);
  const opt = { timeZone: IST };
  if (unit === "hour") {
    const time = d.toLocaleTimeString("en-IN", { ...opt, hour: "numeric", hour12: true });
    /* an hour on its own is ambiguous once a range spans days */
    return long ? `${d.toLocaleDateString("en-IN", { ...opt, weekday: "short", day: "numeric", month: "short" })}, ${time}` : time;
  }
  if (unit === "month") return d.toLocaleDateString("en-IN", { ...opt, month: "short", year: long ? "numeric" : "2-digit" });
  if (unit === "week") return (long ? "Week of " : "") + d.toLocaleDateString("en-IN", { ...opt, day: "numeric", month: "short" });
  return d.toLocaleDateString("en-IN", { ...opt, day: "numeric", month: "short", ...(long ? { weekday: "short" } : {}) });
}

/* Clean axis maximum: 1, 2 or 5 times a power of ten. */
export function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].map((m) => m * p).find((m) => m >= v);
}
