/**
 * Sending one WhatsApp message through Meta's Cloud API, and telling a refusal
 * worth retrying from one that will never succeed.
 *
 * Secrets:
 *   WHATSAPP_TOKEN            system-user token with whatsapp_business_messaging
 *   WHATSAPP_PHONE_NUMBER_ID  the sending number's id (not the number itself);
 *                             defaults to +91 87800 02456's, 1312451105289256
 *   WHATSAPP_SEND_AS          "template" (default) or "text" -- see below
 *   WHATSAPP_TEMPLATE_LANG    language the templates were approved in, "en"
 *
 * Why templates. Meta only delivers free-form text to someone who has messaged
 * the business in the last 24 hours. A kitchen, a rider or a rest house has
 * usually not, so a plain text order would be accepted with a 200 and then
 * fail on the webhook with 131047 -- the silent failure this whole fan-out
 * exists to prevent. Business-initiated messages must be approved templates.
 * WHATSAPP_SEND_AS=text is only for trying the flow on a phone that has just
 * messaged the business number, before the templates are approved.
 */

const GRAPH = "https://graph.facebook.com/v25.0";

export type Outcome =
  | { ok: true; id: string }
  | { ok: false; error: string; retry: boolean };

/**
 * A message in both shapes: the approved template, and the same words as text.
 *
 * `buttons` are quick replies. On a template they must exist, in this order,
 * in the approved template itself; what is sent per message is only each
 * button's payload, which comes back on the webhook when it is tapped.
 *
 * `freeText` is for replies to someone who has just tapped a button: their tap
 * opened Meta's 24-hour window, so plain text is delivered, and there is no
 * template to wait on approval for.
 */
export type Message = {
  template: string;
  params: string[];
  text: string;
  buttons?: { title: string; payload: string }[];
  freeText?: boolean;
  fallback?: { name: string; body: string };
};

/**
 * Stored numbers are Indian mobiles written ten digits long. Meta wants the
 * country code and nothing else: 919876543210.
 */
export function toWaNumber(raw: string): string | null {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
  if (d.length === 12 && d.startsWith("91")) return d;
  return null;
}

/**
 * Template parameters may not hold a newline, a tab, or more than four spaces
 * in a row (error 132018), and may not be empty.
 */
export const param = (v: unknown, max = 500): string => {
  const s = String(v ?? "")
    .replace(/[\n\r\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
  if (!s) return "-";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

/* Meta error codes that describe a moment, not a message: rate limits, a
   service blip. Everything else -- a bad number, a missing template, a closed
   24-hour window -- will fail the same way next time. */
const TRANSIENT = new Set([4, 80007, 130429, 131000, 131016, 131048, 131056, 133004]);

export async function sendWhatsApp(to: string, msg: Message): Promise<Outcome> {
  const token = Deno.env.get("WHATSAPP_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "1312451105289256";
  if (!token) {
    return { ok: false, error: "whatsapp is not configured", retry: false };
  }

  const asText = Deno.env.get("WHATSAPP_SEND_AS") === "text";
  const lang = Deno.env.get("WHATSAPP_TEMPLATE_LANG") || "en";

  const buttons = msg.buttons ?? [];
  // deno-lint-ignore no-explicit-any
  let body: any;
  if (msg.freeText || (asText && !buttons.length)) {
    body = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { preview_url: false, body: msg.text },
    };
  } else if (asText) {
    /* Trying the flow before the templates are approved: the same buttons as
       an interactive message. It only reaches a phone inside the 24-hour
       window, and its replies arrive on the webhook exactly like a template's. */
    body = {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: msg.text.slice(0, 1024) },
        action: {
          buttons: buttons.map((b) => ({
            type: "reply",
            reply: { id: b.payload, title: b.title.slice(0, 20) },
          })),
        },
      },
    };
  } else {
    body = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: msg.template,
        language: { code: lang },
        components: [
          {
            type: "body",
            parameters: msg.params.map((p) => ({ type: "text", text: param(p) })),
          },
          ...buttons.map((b, i) => ({
            type: "button",
            sub_type: "quick_reply",
            index: String(i),
            parameters: [{ type: "payload", payload: b.payload }],
          })),
        ],
      },
    };
  }

  let res: Response;
  try {
    res = await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    return {
      ok: false,
      error: `network: ${err instanceof Error ? err.message : String(err)}`,
      retry: true,
    };
  }

  // deno-lint-ignore no-explicit-any
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* an HTML error page from a proxy; the status says enough */
  }

  const id = data?.messages?.[0]?.id;
  if (res.ok && id) return { ok: true, id };

  const e = data?.error;
  const code = Number(e?.code);
  const detail = e?.error_data?.details ?? e?.message ?? `http ${res.status}`;
  return {
    ok: false,
    error: `${Number.isFinite(code) ? code : res.status} ${detail}`.trim(),
    retry: res.status >= 500 || res.status === 429 || TRANSIENT.has(code),
  };
}

/** Fills a template body's {{1}}, {{2}}… so the text form says exactly the same. */
export const fill = (body: string, params: string[]) =>
  body.replace(/\{\{(\d+)\}\}/g, (_, n) => param(params[Number(n) - 1]));
