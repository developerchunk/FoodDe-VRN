/**
 * The sweep for the WhatsApp side of orders: escalate whatever has gone
 * unanswered, then send whatever is owed.
 *
 *   supabase functions deploy whatsapp-dispatch --no-verify-jwt --use-api
 *
 * Two callers:
 *
 *  1. Supabase cron, every minute (timeout 5000 ms), with the header
 *       x-dispatch-secret: <WHATSAPP_DISPATCH_SECRET>
 *     It first runs escalate_overdue -- a kitchen silent for 10 minutes after
 *     payment, or an order no rider has taken 10 minutes after riders were
 *     asked, is queued for the admin's WhatsApp -- then sends everything left
 *     in message_log: those alerts, plus anything Meta rate-limited earlier or
 *     a dispatcher that died mid-send left behind.
 *
 *  2. The admin site, signed in, with { order_id }. After an admin records a
 *     kitchen's answer, assigns a rider or retries a failed message, the
 *     resulting messages go now rather than at the next minute. The caller's
 *     own token is checked against admin_users; anyone else is refused.
 *
 * Neither caller can say what is sent or to whom. Both can only send what the
 * database has already queued.
 *
 * --no-verify-jwt because the cron authenticates with the shared secret
 * instead, and the admin path checks the token itself.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cors, json } from "../_shared/cors.ts";
import { dispatch } from "../_shared/fanout.ts";
import { safeEqual } from "../_shared/hmac.ts";

const SECRET = Deno.env.get("WHATSAPP_DISPATCH_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SERVICE_KEY =
  Deno.env.get("IRD_SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
/** How long a kitchen or the riders may stay silent before the admin hears. */
const ESCALATE_AFTER_MINUTES = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when the bearer token belongs to someone in admin_users as admin. */
async function isAdmin(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ") || !ANON_KEY) return false;
  const asCaller = createClient(SUPABASE_URL!, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { authorization: auth } },
  });
  const { data, error } = await asCaller.rpc("admin_whoami");
  return !error && Array.isArray(data?.roles) && data.roles.includes("admin");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const db = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  /* An unset secret refuses everyone rather than admitting everyone. */
  const given = req.headers.get("x-dispatch-secret") ?? "";
  if (SECRET && given && safeEqual(given, SECRET)) {
    /* Answer the cron at once and do the work after. Supabase's cron gives an
       HTTP job at most 5 seconds, and a sweep with several sends and its retry
       pauses can take longer; the outcome goes to the function's logs. */
    const job = (async () => {
      const { data: escalated, error } = await db.rpc("escalate_overdue", {
        p_minutes: ESCALATE_AFTER_MINUTES,
      });
      if (error) console.error(`escalate_overdue: ${error.message}`);
      const tally = await dispatch(db, null);
      console.log(`sweep: ${JSON.stringify({ escalated: escalated ?? 0, ...tally })}`);
    })().catch((err) =>
      console.error("whatsapp-dispatch failed:", err instanceof Error ? err.message : err)
    );
    // deno-lint-ignore no-explicit-any
    const runtime = (globalThis as any).EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(job);
    else await job;
    return json({ started: true }, 202);
  }

  if (!(await isAdmin(req))) return json({ error: "forbidden" }, 403);

  let body: { order_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "expected a json body" }, 400);
  }
  if (!body.order_id || !UUID.test(body.order_id)) {
    return json({ error: "an order_id is required" }, 400);
  }

  try {
    const tally = await dispatch(db, body.order_id);
    return json(tally);
  } catch (err) {
    console.error("whatsapp-dispatch (admin) failed:", err instanceof Error ? err.message : err);
    return json({ error: "dispatch failed" }, 500);
  }
});
