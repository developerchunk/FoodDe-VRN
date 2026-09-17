export const rupees = (n) =>
  "₹" +
  Number(n || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });

export const rupeesExact = (n) =>
  "₹" +
  Number(n || 0).toLocaleString("en-IN", {
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
