/**
 * Razorpay's webhook. This is the source of truth for whether an order is paid.
 *
 *   supabase functions deploy payment-webhook --project-ref <ref> \
 *     --no-verify-jwt --use-api
 *
 * --no-verify-jwt for the same reason as the WhatsApp webhook: Razorpay sends
 * no Authorization header, and the default setting would answer 401 while
 * Razorpay reported only that the endpoint was unreachable.
 *
 * It is on Supabase rather than Vercel because Vercel serves a bot challenge to
 * non-browser requests, which is exactly what this is.
 *
 * Signed with the WEBHOOK secret over the raw body -- a different secret and a
 * different message to the checkout return. Set it in the Razorpay dashboard
 * when creating the webhook, and store it here as RAZORPAY_WEBHOOK_SECRET.
 *
 * This is also what guarantees the WhatsApp fan-out: a guest who closes the tab
 * after paying never reaches payment-verify, but their order is still marked
 * paid here, which queues its messages, which are sent from here.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { webhookSignatureIsValid } from "../_shared/razorpay.ts";
import { dispatchInBackground } from "../_shared/fanout.ts";

const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY =
  Deno.env.get("IRD_SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  /* Read as text and verify before parsing: the HMAC covers these exact bytes. */
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature");
  if (!(await webhookSignatureIsValid(raw, signature, WEBHOOK_SECRET))) {
    return new Response("bad signature", { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    /* Correctly signed but malformed: retrying cannot help. */
    return new Response("ok", { status: 200 });
  }

  try {
    const payment = event?.payload?.payment?.entity;
    const rzpOrder = event?.payload?.order?.entity;
    const orderId = payment?.order_id ?? rzpOrder?.id;
    const paymentId = payment?.id;

    /* Only these two mean money actually moved. payment.authorized is not
       captured, and must not put food in front of anyone. */
    const confirms = event?.event === "payment.captured" || event?.event === "order.paid";
    if (!confirms || !orderId || !paymentId) {
      console.log(`ignored razorpay event ${event?.event}`);
      return new Response("ok", { status: 200 });
    }

    const db = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });
    const { data, error } = await db.rpc("mark_order_paid", {
      p_rzp_order_id: orderId,
      p_payment_id: paymentId,
    });
    /* Ask Razorpay to retry rather than losing the confirmation: an order that
       is paid but not marked paid is one nobody cooks for. */
    if (error) throw new Error(error.message);
    console.log(`razorpay ${event.event}: ${JSON.stringify(data)}`);
    if (data?.order_id) dispatchInBackground(db, data.order_id);
    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("razorpay webhook failed:", err instanceof Error ? err.message : err);
    return new Response("processing failed", { status: 500 });
  }
});
