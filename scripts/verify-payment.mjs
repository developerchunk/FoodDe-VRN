/**
 * Tests the Razorpay signature logic without Docker or a deployment.
 *
 *   npm run verify:payment
 *
 * Both failure modes here are silent. A check that accepts anything means
 * anyone can mark an order paid without paying; a check that accepts nothing
 * means no payment is ever confirmed and no kitchen is ever told to cook. From
 * the outside neither looks like an error, so they are tested directly.
 */
import { createHmac } from "node:crypto";
import {
  checkoutSignatureIsValid,
  webhookSignatureIsValid,
} from "../supabase/functions/_shared/razorpay.ts";

const KEY_SECRET = "rzp_test_key_secret";
const WEBHOOK_SECRET = "a_different_webhook_secret";
const ORDER = "order_QabcDEF123456";
const PAYMENT = "pay_QxyzGHI789012";
const BODY = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: PAYMENT, order_id: ORDER } } } });

/* Computed with node:crypto, independently of the module under test. */
const sign = (secret, msg) => createHmac("sha256", secret).update(msg).digest("hex");
const CHECKOUT_SIG = sign(KEY_SECRET, `${ORDER}|${PAYMENT}`);
const WEBHOOK_SIG = sign(WEBHOOK_SECRET, BODY);

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `\n          ${detail}` : ""}`);
};

console.log("\nthe checkout return signature\n");
check(await checkoutSignatureIsValid(ORDER, PAYMENT, CHECKOUT_SIG, KEY_SECRET), "a genuine signature is accepted");
check(await checkoutSignatureIsValid(ORDER, PAYMENT, CHECKOUT_SIG.toUpperCase(), KEY_SECRET), "hex case does not matter");
check(await checkoutSignatureIsValid(ORDER, PAYMENT, ` ${CHECKOUT_SIG} `, KEY_SECRET), "surrounding whitespace is tolerated");
check(!(await checkoutSignatureIsValid("order_TAMPERED", PAYMENT, CHECKOUT_SIG, KEY_SECRET)), "a different order id is rejected");
check(!(await checkoutSignatureIsValid(ORDER, "pay_TAMPERED", CHECKOUT_SIG, KEY_SECRET)), "a different payment id is rejected");
check(!(await checkoutSignatureIsValid(ORDER, PAYMENT, CHECKOUT_SIG, "wrong_secret")), "the wrong key secret is rejected");
check(!(await checkoutSignatureIsValid(ORDER, PAYMENT, "0".repeat(64), KEY_SECRET)), "a well-formed but wrong signature is rejected");
check(!(await checkoutSignatureIsValid(ORDER, PAYMENT, undefined, KEY_SECRET)), "a missing signature is rejected");
check(!(await checkoutSignatureIsValid(undefined, PAYMENT, CHECKOUT_SIG, KEY_SECRET)), "a missing order id is rejected");
/* Without this, an unconfigured deployment would confirm every payment. */
check(!(await checkoutSignatureIsValid(ORDER, PAYMENT, CHECKOUT_SIG, undefined)), "an unset key secret rejects everything", "anything else would confirm payments nobody made");
/* Razorpay signs order|payment, in that order. Signing payment|order instead
   is a mistake that still produces a plausible-looking hex string. */
check(
  !(await checkoutSignatureIsValid(ORDER, PAYMENT, sign(KEY_SECRET, `${PAYMENT}|${ORDER}`), KEY_SECRET)),
  "the two ids the wrong way round is rejected",
);

console.log("\nthe webhook signature\n");
check(await webhookSignatureIsValid(BODY, WEBHOOK_SIG, WEBHOOK_SECRET), "a genuine webhook signature is accepted");
check(!(await webhookSignatureIsValid(BODY + " ", WEBHOOK_SIG, WEBHOOK_SECRET)), "a body altered by one byte is rejected");
check(!(await webhookSignatureIsValid(BODY, WEBHOOK_SIG, "wrong_secret")), "the wrong webhook secret is rejected");
check(!(await webhookSignatureIsValid(BODY, null, WEBHOOK_SECRET)), "a missing signature header is rejected");
check(!(await webhookSignatureIsValid(BODY, WEBHOOK_SIG, undefined)), "an unset webhook secret rejects everything");
/* Meta prefixes its signature "sha256="; Razorpay does not. Accepting the
   prefixed form would mean the two conventions had been muddled. */
check(!(await webhookSignatureIsValid(BODY, `sha256=${WEBHOOK_SIG}`, WEBHOOK_SECRET)), "a Meta-style sha256= prefix is not accepted");

console.log("\nthe two schemes must not be interchangeable\n");
check(!(await webhookSignatureIsValid(BODY, CHECKOUT_SIG, WEBHOOK_SECRET)), "a checkout signature does not pass as a webhook one");
check(!(await checkoutSignatureIsValid(ORDER, PAYMENT, WEBHOOK_SIG, KEY_SECRET)), "a webhook signature does not pass as a checkout one");
check(!(await webhookSignatureIsValid(BODY, sign(KEY_SECRET, BODY), WEBHOOK_SECRET)), "the key secret cannot stand in for the webhook secret");

console.log(
  failures === 0
    ? "\nAll payment signature checks passed. The deployed endpoints still have to\nbe proven against Razorpay itself, with a real test payment.\n"
    : `\n${failures} check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
