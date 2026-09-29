/**
 * HMAC-SHA256 and a constant-time compare, shared by every webhook and
 * signature check in this project.
 *
 * Meta and Razorpay both authenticate their callbacks this way, differing only
 * in what they sign and how they format the header. Two copies of this would
 * eventually differ in some detail that matters, so there is one.
 */

/** HMAC-SHA256 of `message` under `secret`, lowercase hex. */
export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time compare; false on length mismatch, without leaking where. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
