import { randomBytes } from "node:crypto";

/**
 * Opaque code for a QR address.
 *
 * Crockford-ish base32 with the vowels removed, so a code can be read aloud
 * over the phone without I/l/1 or O/0 confusion and cannot accidentally spell
 * a word. 10 characters of this alphabet is ~48 bits — far past guessing.
 *
 * These get printed on stickers and placed in rooms. Changing the scheme later
 * means physically replacing every sticker, so it is worth being unguessable
 * from the very first one.
 */
const ALPHABET = "23456789bcdfghjkmnpqrstvwxyz";

export function makePublicCode(length = 10) {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
