/**
 * Checks the signature the checkout modal handed back, and marks the order paid.
 *
 *   supabase functions deploy payment-verify --project-ref <ref> --use-api
 *
 * This is the fast path, not the source of truth. It exists so the guest sees
 * "paid" immediately instead of waiting on a webhook. The webhook is what
 * guarantees the order is eventually marked paid even if the guest closes the
 * tab the moment their bank returns -- and a guest who has paid must get fed
 * whether or not their browser ever came back.
 *
 * Secrets: RAZORPAY_KEY_SECRET.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cors, json } from "../_shared/cors.ts";
import { checkoutSignatureIsValid } from "../_shared/razorpay.ts";

const KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY =
  Deno.env.get("IRD_SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: Record<string, string | undefined>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "expected a json body" }, 400);
  }
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return json({ error: "missing payment fields" }, 400);
  }

  const ok = await checkoutSignatureIsValid(
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    KEY_SECRET,
  );
  if (!ok) {
    /* Do not touch the order. A bad signature is either a bug or someone
       claiming a payment that did not happen; neither may mark anything paid. */
    console.error("payment signature rejected for", razorpay_order_id);
    return json({ error: "signature mismatch" }, 400);
  }

  const db = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await db.rpc("mark_order_paid", {
    p_rzp_order_id: razorpay_order_id,
    p_payment_id: razorpay_payment_id,
  });
  if (error) {
    console.error("mark_order_paid failed", error.message);
    return json({ error: "could not record that payment" }, 500);
  }
  return json({ paid: true, ...data });
});
