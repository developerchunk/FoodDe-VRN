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
  /* The window the service is open across, as 24h strings. Not shown on the
     site any more -- each dish says when it is served -- but kept as data so
     `npm run check:menu` can still assert it against the kitchens' real hours. */
  opensAt: "08:00",
  closesAt: "23:00",
};
