/**
 * Tests the WhatsApp webhook's two security decisions without Docker.
 *
 *   npm run verify:webhook
 *
 * There is no Docker on this machine, so the edge function cannot be served
 * locally and the real handshake cannot be exercised until it is deployed. What
 * can be tested is the logic both decisions rest on, and that is where the
 * dangerous failure modes are: a handshake that accepts an unset token, or a
 * signature check that accepts anything, both look like a working endpoint.
 */
import {
  handshake,
  safeEqual,
  signatureIsValid,
} from "../supabase/functions/whatsapp-webhook/verify.ts";

const SECRET = "ird-test-app-secret";
const BODY = '{"object":"whatsapp_business_account"}';
/* Computed independently by node:crypto and WebCrypto, which agreed. */
const GOOD = "6cf68d1b2766a21946502390a48cb9561d5461b349669a2024b545297d1fd6e4";

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `\n          ${detail}` : ""}`);
};
const q = (o) => new URLSearchParams(o);

console.log("\nMeta's GET handshake\n");
{
  const r = handshake(q({ "hub.mode": "subscribe", "hub.verify_token": "tok", "hub.challenge": "1234" }), "tok");
  check(r.status === 200 && r.body === "1234", "correct token echoes the challenge verbatim", `got ${r.status} ${r.body}`);
}
check(handshake(q({ "hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "1" }), "tok").status === 403, "a wrong token is refused");
check(handshake(q({ "hub.mode": "subscribe", "hub.challenge": "1" }), "tok").status === 403, "a missing token is refused");
check(handshake(q({ "hub.mode": "unsubscribe", "hub.verify_token": "tok", "hub.challenge": "1" }), "tok").status === 403, "a mode other than subscribe is refused");
check(handshake(q({ "hub.mode": "subscribe", "hub.verify_token": "tok" }), "tok").status === 400, "no challenge is a bad request, not a pass");
/* The trap: with the secret unset, an absent token would equal an absent
   expectation and hand the endpoint to whoever called it first. */
{
  const r = handshake(q({ "hub.mode": "subscribe", "hub.challenge": "1" }), undefined);
  check(r.status !== 200, "an unset verify token never returns 200", `got ${r.status} — 200 here would let anyone claim the endpoint`);
}
/* The sharper version of the same trap. An unset variable reads as undefined and
   a missing query param as null, so those two refuse each other by accident. A
   secret set to an empty string is the case that actually matches: "" === "".
   Removing the guard passes every other test and fails only this one. */
{
  const r = handshake(q({ "hub.mode": "subscribe", "hub.verify_token": "", "hub.challenge": "1" }), "");
  check(r.status !== 200, "a blank verify token never returns 200", `got ${r.status} — an empty secret must not match an empty token`);
}

console.log("\nX-Hub-Signature-256\n");
check(await signatureIsValid(`sha256=${GOOD}`, BODY, SECRET), "a correct signature is accepted");
check(await signatureIsValid(`sha256=${GOOD.toUpperCase()}`, BODY, SECRET), "hex case does not matter");
check(!(await signatureIsValid(`sha256=${GOOD}`, BODY + " ", SECRET)), "a body altered by one byte is rejected");
check(!(await signatureIsValid(`sha256=${GOOD}`, BODY, "wrong-secret")), "the wrong app secret is rejected");
check(!(await signatureIsValid(null, BODY, SECRET)), "a missing signature header is rejected");
check(!(await signatureIsValid(GOOD, BODY, SECRET)), "a header without the sha256= prefix is rejected");
check(!(await signatureIsValid(`sha256=${"0".repeat(64)}`, BODY, SECRET)), "a well-formed but wrong signature is rejected");
/* Without this, an unset app secret would mean every POST is trusted. */
check(!(await signatureIsValid(`sha256=${GOOD}`, BODY, undefined)), "an unconfigured app secret rejects everything", "anything else would trust every caller");

console.log("\nconstant-time compare\n");
check(safeEqual("abc", "abc"), "equal strings match");
check(!safeEqual("abc", "abd"), "differing strings do not match");
check(!safeEqual("abc", "abcd"), "different lengths do not match");
check(!safeEqual("", "a"), "empty against non-empty does not match");

console.log(
  failures === 0
    ? "\nAll webhook checks passed. The handshake and signature logic is sound;\nthe deployed endpoint still has to be proven against Meta itself.\n"
    : `\n${failures} check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
