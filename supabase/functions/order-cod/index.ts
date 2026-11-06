/**
 * Confirms an order as cash on delivery and sends it to the kitchens now.
 *
 *   supabase functions deploy order-cod --use-api
 *
 * The browser sends the receipt token of an order it has just placed. The
 * database does the deciding (confirm_cod_order, migration 0031) and is called
 * with the guest's own session, so only the guest who placed the order can
 * confirm it. This function exists for the second half: sending the kitchen,
 * accommodation partner and guest messages straight away, as payment-verify
 * does for an order paid online, instead of at the next minute's sweep.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cors, json } from "../_shared/cors.ts";
import { dispatchInBackground } from "../_shared/fanout.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SERVICE_KEY =
  Deno.env.get("IRD_SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ") || !ANON_KEY) return json({ error: "not signed in" }, 401);

  let token: string | undefined;
  try {
    ({ token } = await req.json());
  } catch {
    return json({ error: "expected a json body" }, 400);
  }
  if (!token || !UUID.test(token)) return json({ error: "a receipt token is required" }, 400);

  const asGuest = createClient(SUPABASE_URL!, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { authorization: auth } },
  });
  const { data, error } = await asGuest.rpc("confirm_cod_order", { p_token: token });
  if (error) {
    /* A dish switched off after the order was placed: 410, as for paying
       online, so the page can name it and send the guest back to the cart. */
    const m = error.message.match(/no longer available: (.*)$/);
    if (m) return json({ error: "no longer available", unavailable: m[1] }, 410);
    /* Above the cash-on-delivery limit (migration 0034): it is paid online. */
    if (/over the cash on delivery limit/.test(error.message)) {
      return json({ error: "over the cash on delivery limit" }, 409);
    }
    console.error("confirm_cod_order failed", error.message);
    return json({ error: "could not place that order" }, 422);
  }

  const db = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });
  if (data?.order_id && !data.already) dispatchInBackground(db, data.order_id);
  return json({ placed: true, order_no: data?.order_no, status: data?.status });
});
