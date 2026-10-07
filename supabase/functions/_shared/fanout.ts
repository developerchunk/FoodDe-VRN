/**
 * The WhatsApp side of an order: writing each message and sending it.
 *
 * The database decides WHO is told WHAT and WHEN (queue_order_messages on
 * payment, kitchen_decide / rider_decide as the buttons are tapped,
 * escalate_overdue for silence -- migrations 0016 and 0019). Each decision is a
 * message_log row with a `kind`. This claims those rows, writes each message
 * from the order as it stands at that moment, sends it, and records what Meta
 * said. It is safe to run any number of times, from anywhere: a row is claimed
 * by exactly one dispatcher, and an accepted row is never sent again.
 *
 * The templates below must exist, approved, in WhatsApp Manager under the same
 * names, category Utility, with these bodies word for word and -- where listed
 * -- these quick-reply buttons in this order. `scripts/whatsapp-templates.ts`
 * submits them from this file, so the two cannot drift. The text form of each
 * message is generated from the same body.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fill, type Message, sendWhatsApp, toWaNumber } from "./whatsapp.ts";

/* `fallback` is an approved template to send instead while this one is still
   in Meta's review -- same parameters, no buttons -- so a new version never
   leaves riders without their pickup details. */
type Template = {
  name: string;
  body: string;
  buttons?: readonly string[];
  fallback?: { name: string; body: string };
};

export const TEMPLATES = {
  kitchen_order: {
    name: "ird_kitchen_order_v2",
    body:
      "New In Room Dining order {{1}}.\n\n" +
      "Please prepare: {{2}}\n\n" +
      "Guest note: {{3}}\n\n" +
      "Tap Accept if you can prepare it now, or Reject if you cannot.",
    buttons: ["Accept", "Reject"],
  },
  delivery_offer: {
    name: "ird_delivery_offer",
    body:
      "New pickup available: In Room Dining order {{1}}.\n\n" +
      "Collect from: {{2}}\n\n" +
      "Deliver to: {{3}}\n\n" +
      "Tap Accept to take this delivery. The first delivery partner to accept gets it.",
    buttons: ["Accept", "Reject"],
  },
  delivery_details: {
    name: "ird_delivery_pickup_v2",
    body:
      "Pickup for In Room Dining order {{1}}.\n\n" +
      "Collect from: {{2}}\n\n" +
      "Deliver to: {{3}}, Room {{4}}, {{5}}\n\n" +
      "Guest: {{6}}, {{7}}\n\n" +
      "Please call the guest only if you cannot find the room. " +
      "Tap Picked up when you have collected the food, and Delivered once the guest has it.",
    buttons: ["Picked up", "Delivered"],
    fallback: {
      name: "ird_delivery_pickup",
      body:
        "Pickup for In Room Dining order {{1}}.\n\n" +
        "Collect from: {{2}}\n\n" +
        "Deliver to: {{3}}, Room {{4}}, {{5}}\n\n" +
        "Guest: {{6}}, {{7}}\n\n" +
        "Please call the guest only if you cannot find the room.",
    },
  },
  delivery_taken: {
    name: "ird_delivery_taken",
    body:
      "In Room Dining order {{1}} has been taken by another delivery partner. " +
      "No action is needed from you.",
  },
  property_order: {
    name: "ird_property_order",
    body:
      "An In Room Dining order has been placed for Room {{1}} at {{2}}. " +
      "Order number {{3}}. It is paid, and the food will be delivered to the room.",
  },
  guest_confirmation: {
    name: "ird_guest_confirmation",
    body:
      "Hi {{1}}, your In Room Dining order {{2}} is confirmed and paid. " +
      "It will be delivered to {{3}}, Room {{4}}.\n\n" +
      "Total paid: {{5}}\n\n" +
      "Your receipt: {{6}}\n\n" +
      "Thank you for ordering with us.",
  },
  guest_accepted: {
    name: "ird_guest_order_accepted",
    body:
      "Hi {{1}}, your In Room Dining order {{2}} has been accepted and is being prepared.\n\n" +
      "Follow it here: {{3}}\n\n" +
      "We will bring it to your room as soon as it is ready.",
  },
  guest_out_for_delivery: {
    name: "ird_guest_out_for_delivery",
    body:
      "Hi {{1}}, your In Room Dining order {{2}} has been picked up and is on its way " +
      "to {{3}}, Room {{4}}.\n\n" +
      "Follow it here: {{5}}\n\n" +
      "Please keep your phone close in case the delivery partner needs directions.",
  },
  guest_delivered: {
    name: "ird_guest_delivered",
    body:
      "Hi {{1}}, your In Room Dining order {{2}} has been delivered to Room {{3}}. " +
      "We hope you enjoy your meal.\n\n" +
      "Your receipt: {{4}}\n\n" +
      "Thank you for ordering with us.",
  },
  admin_alert: {
    name: "ird_admin_order_alert",
    body:
      "An In Room Dining order needs your attention.\n\n" +
      "Order number: {{1}}\n" +
      "What happened: {{2}}\n" +
      "Where each kitchen stands: {{3}}\n" +
      "Deliver to: {{4}}, Room {{5}}\n" +
      "Guest name: {{6}}, phone number {{7}}\n\n" +
      "Please call the kitchen or the guest, then update the order on the admin Orders page.",
  },
} as const satisfies Record<string, Template>;

/* Replies to a tap. The tap opened the 24-hour window, so these go as plain
   text and need no template. */
const REPLIES = {
  kitchen_ack: {
    accepted: (n: string) => `Thank you. Order ${n} is accepted. Please start preparing it.`,
    rejected: (n: string) =>
      `Noted: you rejected order ${n}. Our team will take care of the guest.`,
    already: (n: string, d: string) => `You have already ${d} order ${n}.`,
    closed: (n: string) => `Order ${n} is no longer active. No action is needed.`,
  },
  delivery_ack: {
    declined: (n: string) => `Noted: you passed on order ${n}.`,
    late: (n: string) =>
      `Order ${n} has already been taken by another delivery partner. Thank you.`,
    already_yours: (n: string) => `Order ${n} is already yours. The pickup details are above.`,
    already_declined: (n: string) => `You have already passed on order ${n}.`,
    picked_up: (n: string) =>
      `Marked order ${n} as picked up. Tap Delivered once the guest has it.`,
    already_picked: (n: string) => `Order ${n} is already marked as picked up.`,
    delivered: (n: string) => `Marked order ${n} as delivered. Thank you.`,
    already_delivered: (n: string) => `Order ${n} is already marked as delivered.`,
    not_yours: (n: string) => `Order ${n} is assigned to another delivery partner.`,
    closed: (n: string) => `Order ${n} is no longer active. No action is needed.`,
  },
} as const;

type Kind = keyof typeof TEMPLATES | keyof typeof REPLIES;

/* Meta's "no such approved template / template paused or disabled" codes. */
const TEMPLATE_UNUSABLE = /^(132001|132015|132016)\b/;

/** Attempts per message before it is left as failed for a person to see. */
const MAX_ATTEMPTS = 5;
/** Rounds within one run, with a pause between, for rate limits and blips. */
const ROUNDS = 3;

/* Same rule as the site's rupees(): whole rupees plain, anything else exact. */
const rupees = (paise: number) => {
  const n = Number(paise || 0);
  const exact = n % 100 === 0;
  return (
    "₹" +
    (n / 100).toLocaleString("en-IN", {
      minimumFractionDigits: exact ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
};

const istTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

const siteUrl = () =>
  (Deno.env.get("IRD_SITE_URL") || "https://inroomdining.in").replace(/\/$/, "");

/* A full postal address: the street line, then area, city and PIN only where
   the street line does not already say them. */
function fullAddress(x: Row) {
  const parts = [x?.address];
  for (const extra of [x?.area, x?.city, x?.pin_code]) {
    if (extra && !String(x?.address ?? "").toLowerCase().includes(String(extra).toLowerCase())) {
      parts.push(extra);
    }
  }
  return parts.filter(Boolean).join(", ");
}

/* A map link a rider can tap: the saved pin when there is one, otherwise a
   Google Maps search for the name, area and city -- short on purpose, because
   a template parameter is cut at 500 characters and a cut link is no link. */
function mapLink(x: Row, name?: string) {
  if (x?.latitude != null && x?.longitude != null) {
    return `https://maps.google.com/?q=${x.latitude},${x.longitude}`;
  }
  const q = [name, x?.area, x?.city].filter(Boolean).join(", ");
  return q ? `https://maps.google.com/?q=${encodeURIComponent(q).replace(/%20/g, "+")}` : null;
}

/* Meta refuses a template message longer than 1024 characters. Several
   kitchens' full addresses could pass that, so then each stop shrinks to its
   name, area and map link. */
const MAX_TEXT = 1000;
const shortLine = (name: string | undefined, x: Row) =>
  [[name, x?.area].filter(Boolean).join(", "), mapLink(x, name)].filter(Boolean).join(" — Map: ");

/* "Name, full address — Map: <link>" */
const placeLine = (name: string | undefined, x: Row) =>
  [[name, fullAddress(x)].filter(Boolean).join(", "), mapLink(x, name)]
    .filter(Boolean)
    .join(" — Map: ");

const STATUS_WORD: Record<string, string> = {
  pending: "not sent yet",
  sent: "waiting",
  accepted: "accepted",
  rejected: "rejected",
};

// deno-lint-ignore no-explicit-any
type Row = any;

/** Everything the messages are written from, read once per order per run. */
async function loadOrder(db: SupabaseClient, orderId: string) {
  const { data: order, error } = await db
    .from("orders")
    .select(
      "id, order_no, guest_name, guest_phone, note, total_paise, receipt_token, " +
        "created_at, paid_at, " +
        "address:addresses(room_number, place:places(name, address, area, city, pin_code, latitude, longitude))",
    )
    .eq("id", orderId)
    .single();
  if (error || !order) throw new Error(`order ${orderId}: ${error?.message ?? "not found"}`);

  const { data: items, error: itemsErr } = await db
    .from("order_items")
    .select("name_snapshot, qty, kitchen_id")
    .eq("order_id", orderId)
    .order("name_snapshot");
  if (itemsErr) throw new Error(`order ${orderId} items: ${itemsErr.message}`);

  const { data: tickets, error: ticketsErr } = await db
    .from("order_tickets")
    .select(
      "id, kitchen_id, status, " +
        "kitchen:kitchens(place_name, address, area, city, pin_code, latitude, longitude)",
    )
    .eq("order_id", orderId);
  if (ticketsErr) throw new Error(`order ${orderId} tickets: ${ticketsErr.message}`);

  return { order: order as Row, items: (items ?? []) as Row[], tickets: (tickets ?? []) as Row[] };
}

type Loaded = Awaited<ReturnType<typeof loadOrder>>;

export function compose(row: Row, { order: o, items, tickets }: Loaded): Message {
  const kind = row.kind as Kind;
  const ctx = row.context ?? {};
  const place = o.address?.place ?? {};
  const room = o.address?.room_number;
  const list = (rows: Row[]) => rows.map((i) => `${i.qty} × ${i.name_snapshot}`).join(", ");
  const kitchenName = (id: string) =>
    tickets.find((t) => t.kitchen_id === id)?.kitchen?.place_name ?? "A kitchen";
  /* Only kitchens that accepted are somewhere a rider should go. */
  const accepted = tickets.filter((t) => t.status === "accepted");

  if (kind === "kitchen_ack" || kind === "delivery_ack") {
    const replies = REPLIES[kind] as Record<string, (n: string, d: string) => string>;
    const write = replies[ctx.ack] ?? replies.closed;
    const text = write(o.order_no, ctx.decision ?? "");
    return { template: "", params: [], text, freeText: true };
  }

  let params: string[];
  let buttons: Message["buttons"];
  switch (kind) {
    case "kitchen_order": {
      /* only what this kitchen cooks: the split stays between us and it */
      const ticket = tickets.find((t) => t.kitchen_id === row.kitchen_id);
      params = [
        o.order_no,
        list(items.filter((i) => i.kitchen_id === row.kitchen_id)),
        o.note || "None",
      ];
      buttons = [
        { title: "Accept", payload: `k:${ticket?.id}:a` },
        { title: "Reject", payload: `k:${ticket?.id}:r` },
      ];
      break;
    }
    case "delivery_offer":
      /* Full addresses and a map link for every stop, so a rider can judge the
         trip before accepting it. */
      params = [
        o.order_no,
        accepted.map((t) => placeLine(t.kitchen?.place_name, t.kitchen)).join("; "),
        placeLine(room ? `${place.name}, Room ${room}` : place.name, place),
      ];
      if (fill(TEMPLATES.delivery_offer.body, params).length > MAX_TEXT) {
        params[1] = accepted.map((t) => shortLine(t.kitchen?.place_name, t.kitchen)).join("; ");
      }
      buttons = [
        { title: "Accept", payload: `d:${ctx.offer_id}:a` },
        { title: "Reject", payload: `d:${ctx.offer_id}:r` },
      ];
      break;
    case "delivery_details": {
      const pickups = accepted
        .map((t) => {
          const k = t.kitchen ?? {};
          const what = list(items.filter((i) => i.kitchen_id === t.kitchen_id));
          return [
            `${[k.place_name, fullAddress(k)].filter(Boolean).join(", ")} (${what})`,
            mapLink(k, k.place_name),
          ].filter(Boolean).join(" — Map: ");
        })
        .join("; ");
      params = [
        o.order_no,
        pickups,
        place.name,
        room,
        [fullAddress(place), mapLink(place, place.name)].filter(Boolean).join(" — Map: "),
        o.guest_name,
        `+${toWaNumber(o.guest_phone) ?? o.guest_phone}`,
      ];
      if (fill(TEMPLATES.delivery_details.body, params).length > MAX_TEXT) {
        params[1] = accepted
          .map((t) => {
            const what = list(items.filter((i) => i.kitchen_id === t.kitchen_id));
            return `${shortLine(t.kitchen?.place_name, t.kitchen)} (${what})`;
          })
          .join("; ");
      }
      /* Only the rider assigned to the order can use these (rider_progress). */
      buttons = [
        { title: "Picked up", payload: `o:${o.id}:p` },
        { title: "Delivered", payload: `o:${o.id}:d` },
      ];
      break;
    }
    case "delivery_taken":
      params = [o.order_no];
      break;
    case "property_order":
      params = [room, istTime(o.paid_at ?? o.created_at), o.order_no];
      break;
    case "guest_confirmation":
      params = [
        String(o.guest_name || "").split(" ")[0] || "there",
        o.order_no,
        place.name,
        room,
        rupees(o.total_paise),
        `${siteUrl()}/receipt/${o.receipt_token}`,
      ];
      break;
    case "guest_out_for_delivery":
      params = [
        String(o.guest_name || "").split(" ")[0] || "there",
        o.order_no,
        place.name,
        room,
        `${siteUrl()}/order/${o.receipt_token}`,
      ];
      break;
    case "guest_delivered":
      params = [
        String(o.guest_name || "").split(" ")[0] || "there",
        o.order_no,
        room,
        `${siteUrl()}/receipt/${o.receipt_token}`,
      ];
      break;
    case "guest_accepted":
      params = [
        String(o.guest_name || "").split(" ")[0] || "there",
        o.order_no,
        `${siteUrl()}/order/${o.receipt_token}`,
      ];
      break;
    case "admin_alert": {
      const mins = ctx.minutes ?? 10;
      const reason = ({
        kitchen_rejected: `${kitchenName(row.kitchen_id)} rejected it`,
        kitchen_silent: `${kitchenName(row.kitchen_id)} has not answered in ${mins} minutes`,
        no_rider: `no delivery partner has accepted it in ${mins} minutes`,
        all_declined: "every delivery partner declined it",
        no_partners: "there is no active delivery partner to ask",
      } as Record<string, string>)[ctx.reason] ?? "please check it";
      params = [
        o.order_no,
        reason,
        tickets
          .map((t) => `${t.kitchen?.place_name}: ${STATUS_WORD[t.status] ?? t.status}`)
          .join("; "),
        place.name,
        room,
        o.guest_name,
        `+${toWaNumber(o.guest_phone) ?? o.guest_phone}`,
      ];
      break;
    }
    default:
      throw new Error(`no message is written for kind ${kind}`);
  }

  const t: Template = TEMPLATES[kind];
  return { template: t.name, params, text: fill(t.body, params), buttons, fallback: t.fallback };
}

/**
 * Sends whatever is due. With an order id, that order's messages; without one,
 * every order's -- the retry sweep. Returns a tally for the logs.
 */
export async function dispatch(db: SupabaseClient, orderId: string | null) {
  const tally = { accepted: 0, retry: 0, failed: 0 };
  const orders = new Map<string, Loaded>();

  for (let round = 0; round < ROUNDS; round++) {
    const { data: rows, error } = await db.rpc("claim_messages", {
      p_order_id: orderId,
      p_max_attempts: MAX_ATTEMPTS,
    });
    if (error) throw new Error(`claim_messages: ${error.message}`);
    if (!rows?.length) break;

    let retryable = false;
    for (const row of rows as Row[]) {
      let message: Message | null = null;
      let outcome;
      try {
        if (!orders.has(row.order_id)) orders.set(row.order_id, await loadOrder(db, row.order_id));
        message = compose(row, orders.get(row.order_id)!);

        const to = toWaNumber(row.recipient_number);
        outcome = to
          ? await sendWhatsApp(to, message)
          : { ok: false as const, error: `not a usable number: ${row.recipient_number}`, retry: false };
        /* A new template still in review (or paused) is refused outright; the
           approved one it replaces says the same without the buttons. */
        if (to && !outcome.ok && message.fallback && TEMPLATE_UNUSABLE.test(outcome.error)) {
          const { fallback } = message;
          message = {
            template: fallback.name,
            params: message.params,
            text: fill(fallback.body, message.params),
          };
          outcome = await sendWhatsApp(to, message);
        }
      } catch (err) {
        /* reading the order failed; that may pass */
        outcome = { ok: false as const, error: err instanceof Error ? err.message : String(err), retry: true };
      }

      const { error: recErr } = await db.rpc("record_message_result", {
        p_id: row.id,
        p_provider_id: outcome.ok ? outcome.id : null,
        p_payload: message
          ? message.freeText
            ? { text: message.text }
            : { template: message.template, params: message.params }
          : null,
        p_error: outcome.ok ? null : outcome.error,
        p_retry: outcome.ok ? false : outcome.retry,
        p_max_attempts: MAX_ATTEMPTS,
      });
      if (recErr) console.error(`record_message_result ${row.id}: ${recErr.message}`);

      if (outcome.ok) tally.accepted++;
      else if (outcome.retry && row.attempts < MAX_ATTEMPTS) {
        tally.retry++;
        retryable = true;
      } else {
        tally.failed++;
        /* A kitchen that never hears about an order is food nobody cooks. The
           admin's Orders page lists every failed message with a Retry. */
        console.error(
          `whatsapp ${row.recipient_type} message for order ${row.order_id} failed: ${outcome.error}`,
        );
      }
    }

    if (!retryable) break;
    await new Promise((r) => setTimeout(r, 2000 * (round + 1)));
  }

  return tally;
}

/**
 * Runs the dispatch after the response has gone, where the runtime allows it,
 * so a payment confirmation is never held up by four calls to Meta.
 */
export function dispatchInBackground(db: SupabaseClient, orderId: string) {
  const job = dispatch(db, orderId)
    .then((t) => console.log(`fan-out ${orderId}: ${JSON.stringify(t)}`))
    .catch((err) =>
      console.error(`fan-out ${orderId} failed:`, err instanceof Error ? err.message : err),
    );
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(job);
  return job;
}
