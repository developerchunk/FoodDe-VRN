/**
 * In Room Dining is the seller of record, so its contact details live in one
 * place. The footer shows them and the receipt carries them; two copies would
 * drift, and the receipt is the document a guest keeps.
 *
 * No GST or FSSAI number belongs here. Both registrations are in progress, and
 * the rule is to show none at all until they are real — never a placeholder.
 */
export const SELLER = {
  name: "In Room Dining",
  /* Digits only; render with maskPhone() so it matches every other number shown. */
  phone: "8780002456",
  address:
    "60, Madhuvan Colony, Raman Reti, Vrindavan, Mathura, Uttar Pradesh, Pin: 281121",
  /* The window the service is open across, as 24h strings. Kept as data rather
     than prose so `npm run check:menu` can assert it against the kitchens' real
     hours — the footer previously claimed 7:00 am to 10:30 pm, which matched
     nothing, and nothing caught it. */
  opensAt: "08:00",
  closesAt: "23:00",
};

const clock = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}:00 ${suffix}` : `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
};

export const sellerHours = () => `Daily, ${clock(SELLER.opensAt)} – ${clock(SELLER.closesAt)}`;
