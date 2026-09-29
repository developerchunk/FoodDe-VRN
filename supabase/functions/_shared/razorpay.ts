/**
 * Razorpay signs two different things two different ways, and confusing them
 * is a silent security hole rather than an error.
 *
 *   checkout return: HMAC-SHA256("<order_id>|<payment_id>", KEY_SECRET)
 *   webhook:         HMAC-SHA256(<raw request body>, WEBHOOK_SECRET)
 *
 * Different message, different secret. A webhook checked with the key secret
 * would reject everything; a checkout return checked against the raw body
 * would accept nothing. Neither mistake looks like a bug from the outside --
 * payments simply stop being confirmed.
 *
 * Both are plain lowercase hex, with no "sha256=" prefix (that is Meta's
 * convention, not Razorpay's).
 */
import { hmacHex, safeEqual } from "./hmac.ts";

/** The signature the checkout modal hands back to the browser. */
export async function checkoutSignatureIsValid(
  razorpayOrderId: string | undefined,
  razorpayPaymentId: string | undefined,
  signature: string | undefined,
  keySecret: string | undefined,
): Promise<boolean> {
  /* An unset secret must reject, not accept: "" would otherwise be hashed and
     an attacker who knew that could sign their own confirmations. */
  if (!keySecret) return false;
  if (!razorpayOrderId || !razorpayPaymentId || !signature) return false;
  const expected = await hmacHex(keySecret, `${razorpayOrderId}|${razorpayPaymentId}`);
  return safeEqual(signature.trim().toLowerCase(), expected);
}

/** The signature on a webhook POST, computed over the exact bytes received. */
export async function webhookSignatureIsValid(
  rawBody: string,
  signature: string | null,
  webhookSecret: string | undefined,
): Promise<boolean> {
  if (!webhookSecret) return false;
  if (!signature) return false;
  const expected = await hmacHex(webhookSecret, rawBody);
  return safeEqual(signature.trim().toLowerCase(), expected);
}
