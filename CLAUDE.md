# IRD — In Room Dining

## What this business actually is

IRD is an **aggregator**, sold B2B to rest houses and guest houses in Vrindavan.
It owns neither end of the transaction:

- **It does not own the rest houses.** They are customers. Their name and address
  are what the guest sees.
- **It does not own the kitchens.** They are partners. IRD curates the best
  dishes from several of them into one menu.
- **It does not own delivery.** Delivery partners are messaged per order.

IRD is the layer in the middle: one interface, one menu, one order, fanned out
to whoever has to act on it.

## The guest journey

1. A QR code sits in each room of a rest house. The code carries an opaque id.
2. Scanning it opens `/menu?id=<code>`, which resolves that id to a
   **property** (name, address from `address_map`) and a **room**. Both are
   shown to the guest — the name and room in the header, the name and full
   address in the footer.
3. The guest browses **one menu**. They are never shown that the dishes come
   from different kitchens — as far as they are concerned it is one menu.
4. They pay, and **only then** is the order placed. Every order is pre-paid;
   nothing reaches a kitchen before payment is confirmed.

## What happens on order — the fan-out

The menu is curated across partner kitchens, so a single order may need to be
split. On placement:

1. Group the order's items **by the kitchen that cooks them**.
2. Look up each of those kitchens' WhatsApp numbers.
3. Send **three kinds of WhatsApp message**:
   - **To each kitchen** — the items it specifically must cook.
   - **To the delivery partner** — pick up from these kitchens, drop at this
     property, this room.
   - **To the rest house** — an order was placed for room N at this time.

One order can therefore produce several kitchen messages, and the split is
invisible to the guest.

## Where the menu comes from

Currently an Excel sheet. Each dish carries the kitchen that cooks it. That
sheet needs an import path into the database; the kitchen mapping is what makes
the order fan-out possible, so it is not optional metadata.

## Settled decisions

- **Vegetarian only.** Vrindavan is a pilgrimage city and its sacred zones
  prohibit meat. There is no non-veg on this menu, so Ember carries actions
  only — it is never a diet marker.
- **Brand is "In Room Dining", never "IRD".** The header carries the gold
  cloche mark and the name, then the rest house's name with the room number
  beneath it. On a phone, once a room is known, the lockup shrinks to the
  cloche so the rest house name has room.
- **Pages:** `/` is a short home page; the menu lives at `/menu` (and at
  `/menu?id=<code>` for room links; the older `/r/<code>` stickers redirect there). Copy is kept minimal and English only — no
  Hindi text.
- **Seller of record is In Room Dining.** GST and FSSAI registration are in
  progress; until the real numbers exist, **display no licence numbers at all**.
  Never put placeholder or example numbers in the interface.

## Architecture consequences

- **Single codebase, multi-tenant.** One deployment serves every property. There
  is no per-property build.
- **The QR id is the whole session context.** Property, address and room all
  derive from it.
- **Guests do not sign in** to order. Optional Google sign-in buys order
  history; anonymous Supabase auth carries guests who skip it.
- **Prices must be recomputed server-side.** Real money now moves, and the
  client cannot be trusted with a total.
- **QR ids must be opaque, not sequential.** Sequential ids let anyone
  enumerate every room in every property and order to rooms they are not in.
  Pre-payment is the other half of this defence: a prank order costs the prankster
  the price of the food.

## Conventions

- React + Vite, deployed on Vercel from `main` (auto-deploy — see the memory
  note about not pushing without being asked).
- Supabase for database, auth and edge functions.
- Colour is the IRD three-colour system: Deep Teal `#075B55` (brand, prices,
  navigation), Ember `#D95F3F` (add to cart, order actions), Gold
  `#D99A2B` (premium accents, ratings — used sparingly). Roughly 60% neutral
  ivory, 25% teal, 10% ember, 5% gold. Tokens live in `src/index.css`.
- Bill maths lives only in `computeBill()` so the cart, checkout, order and
  receipt can never disagree. Totals are exact, never rounded.
