# IRD — build plan

Read `CLAUDE.md` first for what the business is. This is the order of work.

Phases 1–5 are the actual product. Everything before and after is support.

---

## Phase 0 — Accounts (you, starting now, in parallel with Phase 1)

These have **waiting time**, so they gate the schedule rather than the code.
Start them before anything else.

| What | Lead time | Blocks |
|---|---|---|
| Supabase project | minutes | Phase 1 — everything |
| WhatsApp Business API + message templates | **days to weeks** | Phase 5 — the entire fan-out |
| Razorpay account + KYC | days | Phase 6 |
| Google Cloud OAuth client | ~30 min | Phase 7 |

The WhatsApp one is the long pole. Business-initiated messages — which is all
three of ours — must use **templates approved in advance by Meta**. Nothing in
Phase 5 can be tested until they clear.

---

## Phase 1 — Data foundation — *done: schema, RLS, import, verified*

The schema is the whole business written down. Roughly:

- `kitchens` — partner kitchens, each with a **WhatsApp number** and open hours
- `properties` — rest houses: name, address, WhatsApp number
- `rooms` — belongs to a property
- `qr_codes` — **opaque** code → property + room. Never sequential ids
- `categories`, `menu_items` — each item carries `kitchen_id`, price, photo,
  availability and its sattvic (no onion-garlic) flag
- `orders` — property, room, guest contact, totals, status, payment ref
- `order_items` — line items, each carrying its kitchen
- `order_tickets` — **one per kitchen per order**; this is what gets sent and
  what gets tracked
- `delivery_partners`
- `message_log` — every WhatsApp send, its status, and retries

`npm run check:bundle` asserts the opposite direction: that nothing secret
reached the browser. Every non-`VITE_` variable in `.env` is treated as a
secret and must be absent from `dist/`. Run it after every build.

`npm run verify:security` asserts what the publishable key can actually reach —
that key ships in the browser bundle, so anyone who opens the site has it. Run
it after every migration.

It only counts a check as passing when the failure is a *security* failure: no
rows, or a privilege/RLS error. Any other error fails loudly. A renamed column
once made the "kitchens stay private" check go green for the wrong reason, which
is worse than a red one — it manufactures confidence.

Then: RLS on every table, and an **Excel → `menu_items` import script**. The
kitchen mapping in that sheet is load-bearing — it is what makes the order
split possible.

## Phase 2 — QR and tenant resolution — *done, verified end to end*

Route `/r/:code` resolves the code through `resolve_address()`, holds the stay
in `sessionStorage` for the rest of the session, and shows the rest house's
name and room as the branding. An unknown code falls through to the plain site.

Two ops tools support it:

- `npm run import` — the three sheets in `csv/` into Supabase. Kitchens first,
  because menu rows reference them. Ids that already exist in a sheet are kept
  (they are printed on stickers); blank ones are minted and written back
- `npm run qr` — a printable A4 sheet of QR labels, each carrying the rest
  house name and room number so they get stuck on the right doors

Both need `SUPABASE_SECRET_KEY`, because `addresses` is intentionally
unreadable with the publishable key.

`npm run check:menu` asserts that the sheets and the database still describe the
same menu — same ids, names, prices, categories and no-onion-garlic flags — and
refuses the import otherwise. `menu_items` upserts on id, so a sheet whose id
column has slipped does not fail the import; it silently renames dishes. That
happened once: a write-back bug shifted the column by one row, so eight ids
pointed at the dish above them and a ninth dish was missing from the sheet
altogether. Every id was individually well-formed, so only comparing the two
sides revealed it. Run it before every import.

With `SUPABASE_SECRET_KEY` it also compares the kitchen sheet's hours, Sunday-off
flag and WhatsApp number against the database.

## Phase 3 — Menu, rebuilt — *done*

Menu comes from Supabase rather than the hardcoded file. Rebuild the cards to
the reference UI: photography, ratings, category rail with counts. Per-item availability so a kitchen can go out of stock.

## Phase 4 — Ordering, priced server-side — *done, verified end to end*

An edge function `place_order` that:

1. Re-reads every item's real price from the database — **never trusts the
   client's total**
2. Recomputes the bill
3. Splits the order by kitchen and writes one `order_ticket` each
4. Returns the order id and an unguessable receipt token

`npm run verify:order` places real orders against the live database and checks
what landed — including that a forged total is not even an accepted parameter,
that an absurd quantity is clamped, and that one order spanning two kitchens
writes two `order_tickets` rows. It asserts the *written* ticket count, not the
count the function intended, because the second proves nothing.

Test orders are named "ZZ Verification Run" so they can be deleted afterwards.

## Phase 5 — The WhatsApp fan-out

For each order: a message per kitchen, one to the delivery partner, one to the
rest house.

Treat delivery as unreliable. **If a message silently fails, nobody cooks the
food.** So: log every send, retry failures, alert on repeated failure, and give
kitchens a dashboard as a fallback path rather than relying on WhatsApp alone.

## Phase 6 — Payments

**Reordered: this now comes before Phase 5**, because orders are pre-paid and
no kitchen may be messaged until payment is confirmed.

Razorpay, with the webhook — not the browser — as the source of truth. The
fan-out is triggered by the webhook, not by the guest's browser reaching a
success page: a guest who closes the tab after paying must still get fed.

IRD is the seller of record, so it collects and then settles to kitchens.

## Phase 7 — Accounts

Google OAuth, anonymous auth for guests, `linkIdentity` so a guest's history
survives signing up. Account page with order history and receipt downloads.

## Phase 8 — Operations

The dashboards that make this runnable day to day: kitchen order view, rest
house view, and an admin for menu, kitchens and properties. Order status back
to the guest.

---

## Settled

1. **Vegetarian only.** Vrindavan's sacred zones prohibit meat, so the reference
   UI's Butter Chicken, Chicken Biryani and Fish Curry do not apply. Ember is an
   action colour here, never a diet marker.
2. **No IRD branding.** Rest house name as the title, room number small
   underneath, "In Room Dining" as the fallback for direct visitors.
3. **Every order is pre-paid.** This also answers the prank-order problem: an
   order to a room you are not in costs you the price of the food. Payment
   confirmation therefore gates the kitchen fan-out, which moves Razorpay from
   "Phase 6" to a hard dependency of Phase 5.
4. **Seller of record is In Room Dining.** GST and FSSAI are in progress. Until
   the numbers are real, show none — no placeholders.
