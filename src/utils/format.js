/**
 * Amounts arrive as integer paise and are only turned into rupees at the very
 * last moment, for display. Nothing downstream does arithmetic on the result.
 */
export const rupees = (paise) => {
  const n = Number(paise || 0);
  /* A whole number of rupees needs no decimals; anything else shows both, so
     an amount is never rendered as "₹72.3". Totals are never rounded — ₹201.47
     stays ₹201.47. */
  const exact = n % 100 === 0;
  return (
    "₹" +
    (n / 100).toLocaleString("en-IN", {
      minimumFractionDigits: exact ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
};

export const rupeesExact = (paise) =>
  "₹" +
  (Number(paise || 0) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function formatPhone(digits) {
  const d = String(digits || "")
    .replace(/\D/g, "")
    .slice(0, 10);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)} ${d.slice(5)}`;
}

export const maskPhone = (d) => {
  const s = String(d || "").replace(/\D/g, "");
  return s.length === 10 ? `+91 ${s.slice(0, 5)} ${s.slice(5)}` : s;
};

export function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
