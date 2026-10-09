# WhatsApp fan-out

Sending number: **+91 87800 02456** ("In Room Dining"), phone number id
`1312451105289256`, WhatsApp Business Account `1754674995779424`, Cloud API.
Business portfolio `1427020459554551`.
(`1409429843938290` is Meta's *Test* WhatsApp Business Account with the
+1 555 test number — templates made there cannot be used by the real number.)

## How an order moves (migrations 0016 + 0019)

Every message is a `message_log` row (with a `kind`) before it is a request,
so a failure is always visible there and on the admin Orders page.

1. **Paid.** The transaction that marks the order paid queues: one
   `kitchen_order` per kitchen on the order (only its own dishes, with
   **Accept / Reject** buttons), `property_order` to the rest house, and
   `guest_confirmation` to the guest. `payment-verify` / `payment-webhook` send
   them straight away.
2. **A kitchen taps a button.** Meta posts it to `whatsapp-webhook`; the
   database (`whatsapp_button_reply`) checks the tap came from that kitchen's own
   number, records it, and replies with a short acknowledgement.
   - **Reject** → the order is *not* cancelled. The admin's number (Settings →
     `admin_whatsapp`, default 9510471455) gets `ird_admin_order_alert`: which
     kitchen rejected, where every kitchen on the order stands, room and guest.
     The order is flagged on the admin Orders page; the admin handles it.
3. **Every kitchen has answered.**
   - At least one accepted → **every active delivery partner** gets
     `ird_delivery_offer` with **Accept / Reject**, showing each kitchen's and
     the guest house's full address with a map link. Only the kitchens that
     accepted are on the pickup list.
   - None rejected → the order becomes `preparing` and the guest gets
     `ird_guest_order_accepted` (their order page updates too).
4. **First rider to tap Accept gets it** (the order row is locked, so two taps
   in the same second cannot both win). They get the full pickup details
   (`ird_delivery_pickup_v2`: full addresses, map links, the dishes per
   kitchen, the guest's name and number); every rider still deciding gets
   `ird_delivery_taken`; a rider who accepts a moment later is told it is gone.
5. **Picked up and Delivered.** The pickup details carry two buttons. Only the
   rider the order is assigned to can use them (checked by number). Picked up
   makes the order `out_for_delivery` and sends the guest
   `ird_guest_out_for_delivery`; Delivered makes it `delivered` and sends
   `ird_guest_delivered`. An admin moving the order on from the Orders page
   sends the guest the same messages. Each goes once.
6. **Silence.** `whatsapp-dispatch`, run every minute by cron, escalates to the
   admin: a kitchen that has not answered **10 minutes** after payment, or an
   order no rider has accepted 10 minutes after riders were asked (or that
   every rider declined).
7. From there the admin can also move the order on from the Orders page (out for
   delivery, delivered, or cancelled — cancelling does not refund; that is done
   in Razorpay), and can record a kitchen's answer given by phone, assign or
   change the rider, and retry any failed message.

## 1. Templates

Templates belong to a WhatsApp Business Account, and only numbers in that
account can send them. Check their review status, or submit the missing ones,
with:

```bash
deno run --allow-net --allow-read scripts/whatsapp-templates.ts 1754674995779424
deno run --allow-net --allow-read scripts/whatsapp-templates.ts 1754674995779424 --create
```

The script submits exactly what `supabase/functions/_shared/fanout.ts` sends —
bodies, and the quick-reply buttons where a template has them. All are
**Category: Utility**, **Language: English (`en`)**.

| Template | To | Buttons | Status |
|---|---|---|---|
| `ird_kitchen_order_v2` | each kitchen | Accept, Reject | **new — submit** |
| `ird_delivery_offer` | every active rider | Accept, Reject | **new — submit** |
| `ird_delivery_taken` | riders who did not get it | — | **new — submit** |
| `ird_guest_order_accepted` | the guest | — | **new — submit** |
| `ird_admin_order_alert` | the admin number | — | **new — submit** |
| `ird_delivery_pickup_v2` | the rider who got it | Picked up, Delivered | **new — submit** |
| `ird_guest_out_for_delivery` | the guest | — | **new — submit** |
| `ird_guest_delivered` | the guest | — | **new — submit** |
| `ird_delivery_pickup` | the rider who got it | — | approved; sent instead of `_v2` until `_v2` is approved |
| `ird_property_order` | the rest house | — | submitted 2 Oct 2026 |
| `ird_guest_confirmation` | the guest | — | submitted 2 Oct 2026 |

`ird_kitchen_order` (submitted 2 Oct, no buttons) is no longer sent: buttons
have to be part of the approved template, so it was replaced by `_v2`. It can be
deleted in WhatsApp Manager.

Replies to a tap ("Thank you, order … is accepted", "already taken") go as plain
text: the tap opened Meta's 24-hour window, so no template is needed.

## 2. Secrets on Supabase

```bash
supabase secrets set WHATSAPP_TOKEN=… WHATSAPP_DISPATCH_SECRET=… IRD_SITE_URL=https://inroomdining.in
```

Optional: `WHATSAPP_PHONE_NUMBER_ID` (defaults to the id above),
`WHATSAPP_TEMPLATE_LANG` (defaults to `en`), and `WHATSAPP_SEND_AS=text` to try
the flow on a phone that has just messaged the business number, before the
templates are approved. Remove it afterwards — text sent outside the 24-hour
window is accepted and then fails.

## 3. Deploy

Apply migrations `0016` to `0020` in order, then:

```bash
supabase functions deploy payment-verify --use-api
supabase functions deploy payment-webhook --no-verify-jwt --use-api
supabase functions deploy whatsapp-dispatch --no-verify-jwt --use-api
```

Also redeploy the webhook (it now handles button taps):

```bash
supabase functions deploy whatsapp-webhook --no-verify-jwt --use-api
supabase functions deploy payment-create-order --use-api
```

Schedule `whatsapp-dispatch` **every minute** (Supabase → Integrations → Cron,
HTTP request, `POST`, header `x-dispatch-secret: <WHATSAPP_DISPATCH_SECRET>`).
The 10-minute escalations only happen when it runs.

In Meta's app dashboard, the webhook must be subscribed to the **messages**
field (it carries both status updates and button taps).

## 4. Before the first real order

- Add delivery partners (admin → Delivery partners). With none active, the
  admin is alerted that there is nobody to ask.
- Every place's WhatsApp number (admin → Accommodation Partners) is the rest house's
  WhatsApp number.
- The alerts number is right (super admin → Settings).

## Watching it

```sql
select created_at, recipient_type, status, attempts, error
  from message_log
 where status not in ('accepted', 'sent', 'delivered', 'read')
 order by created_at desc;
```
