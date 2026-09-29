/**
 * The two security decisions Meta's webhook turns on, kept apart from the
 * handler so they can be tested without Docker or a deployment.
 *
 * Neither is optional. The handshake is how Meta proves the endpoint is ours;
 * the signature is how we prove a POST came from Meta. Without the second, the
 * URL is a public write endpoint into message_log for anyone who learns it.
 */

/** Meta's GET handshake: echo hub.challenge only if the token matches. */
export function handshake(
  params: URLSearchParams,
  expectedToken: string | undefined,
): { status: number; body: string } {
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  /* An unset token would otherwise make undefined === undefined true and hand
     the endpoint to whoever asked first. */
  if (!expectedToken) return { status: 500, body: "verify token not configured" };
  if (mode !== "subscribe") return { status: 403, body: "bad mode" };
  if (!token || token !== expectedToken) return { status: 403, body: "bad verify token" };
  if (!challenge) return { status: 400, body: "no challenge" };
  return { status: 200, body: challenge };
}

const hex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/** Constant-time compare; returns false on length mismatch without leaking where. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * X-Hub-Signature-256 is an HMAC-SHA256 of the RAW request body. It must be
 * checked before the body is parsed — re-serialising JSON changes the bytes and
 * the signature no longer matches.
 */
export async function signatureIsValid(
  header: string | null,
  rawBody: string,
  appSecret: string | undefined,
): Promise<boolean> {
  if (!appSecret) return false;
  if (!header || !header.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return safeEqual(header.slice("sha256=".length).toLowerCase(), hex(mac));
}
