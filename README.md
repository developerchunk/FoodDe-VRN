# Braj Rasoi — Vrindavan food-delivery demo

A React storefront for a pure-vegetarian kitchen in Vrindavan. Full ordering
flow — menu → cart → guest checkout → order confirmation → receipt — with no
backend. Everything is demo data; no payment is taken and no order is real.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

## What it does

- **7 categories** — Vrindavan Special, North Indian, South Indian, Fast Food,
  Chinese, Sweets, Simple Meals (64 dishes).
- **No Onion–Garlic toggle** — the headline filter. Every dish carries a
  `sattvic` flag; 48 of 64 are cooked the Braj way with hing instead of onion
  and garlic. Search, quick chips and sorting stack on top of it.
- **Built for phones first** — 99% of the traffic is mobile, so the menu is a
  dense list with the info left and the dish right, the Add button straddling
  the foot of the image. Search and the Menu button live in a fixed bottom dock
  inside thumb reach; the Menu button opens a category sheet that jumps
  anywhere in the menu in one tap. Searching or filtering brings the results
  back up to the reader rather than leaving them stranded mid-page.
- **Always-reachable search and filters** — a sticky filter rail rides under the
  header at every scroll depth. On desktop the search field sits in that rail
  alongside the filters and a sticky category sidebar; on phones it moves to the
  dock instead.
- **Cart** — quantity steppers, add-ons, coupons (`RADHE50`, `FIRSTMEAL`,
  `SATTVIC20`), an optional ₹5 gaushala contribution, and a live bill.
- **Guest checkout** — full name, WhatsApp number and address. No sign-up, no
  password, no OTP. Details can be remembered on the device for next time.
- **Order confirmation** — order number, ETA, and a status timeline that walks
  itself through the stages so the whole flow can be seen end to end.
- **Receipt** — itemised, print/save-as-PDF ready, shareable, retrievable later
  from `/orders`.

Cart and orders persist in `localStorage`, so a refresh (or coming back to
`/orders`) keeps everything.

## Design notes

The palette and ornament come from Braj visual culture rather than the usual
delivery-app red: peacock teal and indigo from the *mor pankh*, marigold and
haldi from temple garlands, kumkum rose, tulsi green, and the cream of
Vrindavan sandstone. Motifs (feather, lotus, bansuri, tulsi, matka, diya) are
hand-drawn inline SVG, as are all the dish illustrations — `DishArt` renders 20
archetypes tinted per dish, so there is no stock photography anywhere.

Deliberately avoided: any depiction of deities, and the word *prasad* for food
sold commercially. Dishes are described as *sattvic* / Braj-style instead.

## Layout

```
src/
  components/    Header, Footer, Hero, BrajSkyline (+ braj-skyline-parts),
                 FilterBar, CategoryRail, CategorySheet, MobileDock,
                 MenuItemCard, DishArt, CartPanel, BillSummary, Motifs, …
  context/       cart-context.js (context + hook), CartProvider.jsx (state)
  data/menu.js   categories + dishes, each with a `sattvic` flag
  pages/         MenuPage, CartPage, CheckoutPage, OrderSuccessPage,
                 ReceiptPage, OrdersPage
  styles/        index.css (tokens), layout.css, menu.css, checkout.css
  utils/         pricing.js (single source of truth for the bill),
                 orders.js, format.js
```

Bill maths lives only in `computeBill()`, so the cart, checkout summary, placed
order and receipt can never disagree. Totals are shown exactly as they compute —
nothing is rounded.
