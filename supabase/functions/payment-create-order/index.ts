/**
 * Mints a Razorpay order for an order this database already holds.
 *
 *   supabase functions deploy payment-create-order --project-ref <ref> --use-api
 *
 * The browser sends a receipt token and nothing else. It does not send an
 * amount, and there is no parameter for one: the total is read from the orders
 * row, which place_order computed from the database. The rule that the client
 * cannot be trusted with a total does not stop being true because money is now
 * leaving rather than arriving.
 *
 * Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cors, json } from "../_shared/cors.ts";

const KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
const KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY =
  Deno.env.get("IRD_SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!KEY_ID || !KEY_SECRET) return json({ error: "razorpay is not configured" }, 500);

  let token: string | undefined;
  try {
    ({ token } = await req.json());
  } catch {
    return json({ error: "expected a json body" }, 400);
  }
  if (!token || !UUID.test(token)) return json({ error: "a receipt token is required" }, 400);

  const db = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  const { data: order, error: readErr } = await db
    .from("orders")
    .select("id, order_no, total_paise, status, razorpay_order_id, guest_name, guest_phone, guest_email")
    .eq("receipt_token", token)
    .maybeSingle();
  if (readErr) return json({ error: "could not read that order" }, 500);
  if (!order) return json({ error: "no such order" }, 404);
  if (order.status !== "pending_payment") {
    /* Not an error the guest can act on, and worth distinguishing from a
       failure so the page can simply show the receipt. */
    return json({ error: "that order is already paid", order_no: order.order_no }, 409);
  }
  /* A dish switched off after the order was placed is not paid for. Checked
     before Razorpay is asked for anything, and again when its order is
     attached. 410 so the page can tell the guest which dish and send them back
     to the cart, rather than showing a generic failure. */
  const { data: gone, error: goneErr } = await db.rpc("unavailable_in_order", {
    p_order_id: order.id,
  });
  if (goneErr) return json({ error: "could not read that order" }, 500);
  if (gone) return json({ error: "no longer available", unavailable: gone }, 410);

  /* Razorpay's own floor, and a total below it means something is wrong here. */
  if (!Number.isInteger(order.total_paise) || order.total_paise < 100) {
    return json({ error: "that order's total is not payable" }, 422);
  }

  /* A guest who dismisses the modal and tries again must not mint a second
     Razorpay order against the same bill. */
  if (order.razorpay_order_id) {
    return json({
      key_id: KEY_ID,
      razorpay_order_id: order.razorpay_order_id,
      amount: order.total_paise,
      currency: "INR",
      order_no: order.order_no,
      reused: true,
      prefill: { name: order.guest_name, contact: order.guest_phone, email: order.guest_email ?? "" },
    });
  }

  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${KEY_ID}:${KEY_SECRET}`)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      amount: order.total_paise,
      currency: "INR",
      receipt: order.order_no,
      notes: { order_no: order.order_no },
    }),
  });
  const created = await res.json();
  if (!res.ok || !created?.id) {
    console.error("razorpay order creation failed", res.status, JSON.stringify(created).slice(0, 300));
    /* 401 means our own credentials are wrong, which is an operator problem,
       not the guest's. Say so distinctly so it is not mistaken for a decline. */
    return json({ error: res.status === 401 ? "razorpay rejected our credentials" : "could not start the payment" },
      res.status === 401 ? 401 : 502);
  }

  const { error: attachErr } = await db.rpc("attach_razorpay_order", {
    p_token: token,
    p_rzp_id: created.id,
  });
  if (attachErr) {
    /* Switched off in the moment between the check above and this. */
    const m = attachErr.message.match(/no longer available: (.*)$/);
    if (m) return json({ error: "no longer available", unavailable: m[1] }, 410);
    console.error("could not attach the razorpay order", attachErr.message);
    return json({ error: "could not start the payment" }, 500);
  }

  return json({
    key_id: KEY_ID,
    razorpay_order_id: created.id,
    amount: order.total_paise,
    currency: "INR",
    order_no: order.order_no,
    reused: false,
    prefill: { name: order.guest_name, contact: order.guest_phone, email: order.guest_email ?? "" },
  });
});
