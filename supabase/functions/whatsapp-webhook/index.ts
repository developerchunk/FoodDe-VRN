/**
 * Meta's WhatsApp webhook. Lives on Supabase, not Vercel, because Vercel serves
 * a bot challenge to non-browser requests and Meta's callback is exactly that.
 *
 * Deploy with --no-verify-jwt. Edge functions demand an Authorization JWT by
 * default; Meta sends none, so the default setting answers the verification
 * handshake with 401 and Meta reports the endpoint as unreachable.
 *
 *   supabase functions deploy whatsapp-webhook --no-verify-jwt
 *
 * Secrets (names must not begin with SUPABASE_, Supabase reserves that prefix):
 *   WHATSAPP_VERIFY_TOKEN   the string also pasted into Meta's "Verify token"
 *   WHATSAPP_APP_SECRET     Meta > App settings > Basic > App secret
 *
 * What it is for:
 *
 *  1. Status callbacks. A WhatsApp send that returns 200 has been accepted, not
 *     delivered — "failed" arrives later, on this endpoint. Phase 5's rule is
 *     that a silently failed message means nobody cooks the food, and this is
 *     the only place that failure shows up.
 *
 *  2. Button taps. Kitchens and riders answer an order with Accept / Reject.
 *     Each tap arrives here carrying the payload we put on the button
 *     (k:<ticket>:a, d:<offer>:r …). The database decides what it means —
 *     whatsapp_button_reply checks the tap came from that kitchen's or rider's
 *     own number, records it, and queues whatever follows (the riders, the
 *     admin, the guest). The messages go out after the response, so Meta is
 *     answered at once and does not retry a slow request.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handshake, signatureIsValid } from "./verify.ts";
import { dispatchInBackground } from "../_shared/fanout.ts";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET");
/* SUPABASE_SERVICE_ROLE_KEY is injected automatically. IRD_SUPABASE_SECRET_KEY
   is the escape hatch for the new sb_secret_ format, since a secret cannot be
   named SUPABASE_ANYTHING. */
const SERVICE_KEY =
  Deno.env.get("IRD_SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const { status, body } = handshake(url.searchParams, VERIFY_TOKEN);
    /* Meta wants the challenge as a bare string, not JSON. */
    return new Response(body, { status, headers: { "content-type": "text/plain" } });
  }

  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  /* Read the body as text and check the signature before parsing it: the HMAC
     covers these exact bytes, and JSON.parse + re-stringify would not reproduce
     them. */
  const raw = await req.text();
  if (!(await signatureIsValid(req.headers.get("x-hub-signature-256"), raw, APP_SECRET))) {
    return new Response("bad signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    /* Malformed but correctly signed: retrying cannot help, so do not ask Meta to. */
    return new Response("ok", { status: 200 });
  }

  try {
    const db = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });
    const statuses = [];
    const inbound = [];
    for (const entry of (payload as any)?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        for (const s of change?.value?.statuses ?? []) statuses.push(s);
        for (const m of change?.value?.messages ?? []) inbound.push(m);
      }
    }

    for (const s of statuses) {
      if (!s?.id || !s?.status) continue;
      const patch: Record<string, unknown> = { status: s.status };
      if (s.status === "failed") {
        const e = s.errors?.[0];
        patch.error = e ? `${e.code ?? ""} ${e.title ?? ""} ${e.message ?? ""}`.trim() : "failed";
      }
      if (s.status === "sent" && s.timestamp) {
        patch.sent_at = new Date(Number(s.timestamp) * 1000).toISOString();
      }
      const { error } = await db
        .from("message_log")
        .update(patch)
        .eq("provider_message_id", s.id);
      /* Throw so the outer catch returns 500 and Meta retries. A status we never
         record is a delivery failure we never notice. */
      if (error) throw new Error(`message_log update failed: ${error.message}`);
    }

    for (const m of inbound) {
      /* A template's quick reply arrives as "button"; the interactive buttons
         used before templates are approved arrive as "interactive". */
      const payload = m?.type === "button"
        ? m.button?.payload
        : m?.type === "interactive" && m.interactive?.type === "button_reply"
        ? m.interactive.button_reply?.id
        : null;
      if (!payload) {
        /* Free text from a kitchen or rider is not acted on. Record it rather
           than dropping it silently, so it is at least visible in the logs. */
        console.log(`inbound whatsapp ${m?.type ?? "message"} from ${m?.from} not acted on`);
        continue;
      }

      const { data, error } = await db.rpc("whatsapp_button_reply", {
        p_payload: payload,
        p_from: m.from,
        p_inbound_id: m.id,
      });
      /* Throw so Meta retries: a lost "Accept" is an order nobody cooks.
         Retrying is safe — the same message id is recorded once. */
      if (error) throw new Error(`whatsapp_button_reply failed: ${error.message}`);
      console.log(`button ${payload} from ${m.from}: ${JSON.stringify(data)}`);
      if (data?.order_id) dispatchInBackground(db, data.order_id);
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("whatsapp-webhook processing failed:", err instanceof Error ? err.message : err);
    return new Response("processing failed", { status: 500 });
  }
});
