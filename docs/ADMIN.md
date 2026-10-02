# Admin site

`/admin` on the same deployment. It is a separate chunk, so guests never
download it. Who gets in is decided by the database (`admin_users`, migration
0018), not by the pages.

| Role | Sees |
|---|---|
| `admin` | Orders · Menu · Kitchens · Categories · Places & rooms · Delivery partners · Settings |
| `super_admin` | Analytics (today / daily / weekly / monthly) · Coupons — read-only everywhere else |

One person may hold both roles (one row each).

## Going live — in this order

1. **Apply the migrations** `0016` → `0020` in order (SQL editor or
   `supabase db push`). `0017` moves each rest house out of `addresses` into
   `places`; room ids — the codes on the stickers — do not change.
2. **Give people access.** Sign in at `/admin` once with each Google account
   (it will say "No admin access"), then:

   ```sql
   insert into public.admin_users (email, role) values
     ('owner@example.com', 'super_admin'),
     ('owner@example.com', 'admin'),
     ('ops@example.com',   'admin');
   ```

   Removing a row removes the access at the next page load.
3. **Google redirect.** Supabase → Authentication → URL Configuration → add
   `https://www.inroomdining.in/admin` (and the bare domain if it is served)
   to the redirect URLs, unless a `/**` wildcard is already there.
4. **Edge functions** — redeploy the ones that changed (see `docs/WHATSAPP.md`
   §3): `whatsapp-webhook`, `whatsapp-dispatch`, `payment-create-order`,
   `payment-verify`, `payment-webhook`. Schedule `whatsapp-dispatch` **every
   minute**.
5. **Templates** — submit the five new ones (`docs/WHATSAPP.md` §1). Until
   they are approved, kitchens and riders cannot receive Accept / Reject.
6. **Run** `npm run verify:security` — it now also checks the new tables,
   functions and a signed-in guest session.
7. **Settings** — check the alerts number (default 9510471455), add delivery
   partners, and check every place's WhatsApp number.

## Notes

- **Dish photos** are cropped and compressed on the admin's device to a
  480×480 JPEG (~100 KB) before upload, into the public `menu-images` bucket.
- **Switching a dish off** saves at once and removes it from every open guest
  menu within a second or two (Realtime broadcast on the `menu` topic). A cart
  holding it is blocked at checkout, and payment is refused for it too.
- **QR stickers** are printed from Places & rooms and always point at
  `VITE_SITE_URL` (default `https://www.inroomdining.in`), whichever address the
  admin is using.
- **`npm run import`** still loads kitchens and dishes from `csv/`, but only
  *adds* places and rooms — it never overwrites what admins edited.
- **Cancelling an order does not refund it.** Refund in the Razorpay dashboard.
