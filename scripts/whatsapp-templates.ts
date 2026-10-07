/**
 * Submits the fan-out's message templates to Meta for approval.
 *
 *   deno run --allow-net --allow-read scripts/whatsapp-templates.ts <WABA_ID>
 *   deno run --allow-net --allow-read scripts/whatsapp-templates.ts <WABA_ID> --create
 *
 * Without --create it only reports which templates already exist and their
 * review status. The bodies are imported from the fan-out itself, so what is
 * submitted is exactly what the code fills in. WABA_ID is the WhatsApp Business
 * Account id from WhatsApp Manager (not the phone number id).
 *
 * Deno rather than Node so it can import the TypeScript the edge functions use.
 */
import { TEMPLATES } from "../supabase/functions/_shared/fanout.ts";

const GRAPH = "https://graph.facebook.com/v25.0";

/* Meta will not review a template with variables unless each has a sample. */
const SAMPLES: Record<string, string[]> = {
  ird_kitchen_order_v2: ["IRD-1001", "2 × Dal Tadka, 1 × Jeera Rice", "Less chilli please"],
  ird_delivery_offer: [
    "IRD-1001",
    "Vrinda Thali, Chaitanya Vihar",
    "Rishi Bhawan Guest House, Room 101, Ramnagar Colony",
  ],
  ird_delivery_taken: ["IRD-1001"],
  ird_delivery_pickup_v2: [
    "IRD-1001",
    "Vrinda Thali, Anand Vatika Cut, Chaitanya Vihar, Vrindavan 281121 (2 × Thali) — Map: https://maps.google.com/?q=27.567314,77.678539",
    "Rishi Bhawan Guest House",
    "101",
    "Parikrama Marg, Ramnagar Colony, Vrindavan 281121 — Map: https://maps.google.com/?q=27.563452,77.696353",
    "Asha",
    "+919876543210",
  ],
  ird_guest_out_for_delivery: [
    "Asha",
    "IRD-1001",
    "Rishi Bhawan Guest House",
    "101",
    "https://inroomdining.in/order/2f6c1d0e",
  ],
  ird_guest_delivered: ["Asha", "IRD-1001", "101", "https://inroomdining.in/receipt/2f6c1d0e"],
  ird_guest_order_accepted: ["Asha", "IRD-1001", "https://inroomdining.in/order/2f6c1d0e"],
  ird_admin_order_alert: [
    "IRD-1001",
    "Vrinda Thali rejected it",
    "Ekyam Sattvic Kitchen: accepted; Vrinda Thali: rejected",
    "Rishi Bhawan Guest House",
    "101",
    "Asha",
    "+919876543210",
  ],
  ird_delivery_pickup: [
    "IRD-1001",
    "Vrinda Thali, Chaitanya Vihar",
    "Rishi Bhawan Guest House",
    "101",
    "Parikrama Marg, Ramnagar Colony, Vrindavan",
    "Asha",
    "+919876543210",
  ],
  ird_property_order: ["101", "30 Sept, 7:42 pm", "IRD-1001"],
  ird_guest_confirmation: [
    "Asha",
    "IRD-1001",
    "Rishi Bhawan Guest House",
    "101",
    "₹498",
    "https://inroomdining.in/receipt/2f6c1d0e",
  ],
};

const [waba, flag] = Deno.args;
if (!waba || !/^\d+$/.test(waba)) {
  console.error("usage: whatsapp-templates.ts <WABA_ID> [--create]");
  Deno.exit(1);
}

/* The token is read from .env, never printed and never written anywhere. */
const env = await Deno.readTextFile(new URL("../.env", import.meta.url));
const token = env
  .match(/^WHATSAPP_TOKEN=(.*)$/m)?.[1]
  ?.trim()
  .replace(/^["']|["']$/g, "");
if (!token) {
  console.error("WHATSAPP_TOKEN is not set in .env");
  Deno.exit(1);
}
const auth = { authorization: `Bearer ${token}` };

/* Templates belong to one account and only its numbers can send them. Meta also
   gives every business a Test account with a +1 555 number, whose id looks just
   like the real one; submitting there once cost a day of review. Refuse any
   account that does not hold the number the fan-out sends from. */
const SENDING_NUMBER_ID = "1312451105289256";
const numbers = await fetch(
  `${GRAPH}/${waba}/phone_numbers?fields=id,display_phone_number`,
  { headers: auth },
).then((r) => r.json());
if (numbers.error) {
  console.error(`could not read that account: ${numbers.error.message}`);
  Deno.exit(1);
}
// deno-lint-ignore no-explicit-any
if (!numbers.data?.some((n: any) => n.id === SENDING_NUMBER_ID)) {
  // deno-lint-ignore no-explicit-any
  const held = numbers.data?.map((n: any) => n.display_phone_number).join(", ") || "none";
  console.error(
    `account ${waba} does not hold the sending number (${SENDING_NUMBER_ID}); it holds: ${held}`,
  );
  Deno.exit(1);
}

const existing = await fetch(
  `${GRAPH}/${waba}/message_templates?fields=name,status,language,category,rejected_reason&limit=200`,
  { headers: auth },
).then((r) => r.json());
if (existing.error) {
  console.error(`could not list templates: ${existing.error.message}`);
  Deno.exit(1);
}
// deno-lint-ignore no-explicit-any
const have = new Map<string, any>(existing.data.map((t: any) => [t.name, t]));

for (const t of Object.values(TEMPLATES) as { name: string; body: string; buttons?: readonly string[] }[]) {
  const found = have.get(t.name);
  if (found) {
    const why = found.rejected_reason && found.rejected_reason !== "NONE"
      ? ` (${found.rejected_reason})`
      : "";
    console.log(`${t.name}: already exists — ${found.status}${why}`);
    continue;
  }
  if (flag !== "--create") {
    console.log(`${t.name}: missing (run with --create to submit it)`);
    continue;
  }

  const res = await fetch(`${GRAPH}/${waba}/message_templates`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({
      name: t.name,
      language: "en",
      category: "UTILITY",
      components: [
        { type: "BODY", text: t.body, example: { body_text: [SAMPLES[t.name]] } },
        /* Accept / Reject. The payload each button returns is set per message
           when it is sent; the template fixes only the labels and order. */
        ...(t.buttons?.length
          ? [{
            type: "BUTTONS",
            buttons: t.buttons.map((text) => ({ type: "QUICK_REPLY", text })),
          }]
          : []),
      ],
    }),
  }).then((r) => r.json());

  if (res.error) {
    const detail = res.error.error_user_msg ?? res.error.message;
    console.log(`${t.name}: REFUSED — ${detail}`);
  } else {
    console.log(`${t.name}: submitted — ${res.status} (id ${res.id}, ${res.category})`);
  }
}
