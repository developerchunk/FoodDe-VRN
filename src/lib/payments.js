import { supabase } from "./supabase";

/**
 * Razorpay Standard Checkout.
 *
 * The browser never names a price. It sends a receipt token; the edge function
 * reads the total from the order row and asks Razorpay for exactly that. The
 * signature that comes back is checked server-side with the key secret, which
 * never leaves Supabase — the browser saying "paid" is not evidence of payment.
 */
const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/* How long a payment window may stay open. Razorpay closes itself at this, and
   the order page counts down to the same moment, so the two cannot disagree. */
export const PAY_WINDOW_S = 300;

let scriptPromise = null;
/* Razorpay appends its modal to document.body, so it outlives the React tree
   that opened it. Navigating away while it is open would leave it stranded
   over the next page. */
let openInstance = null;

/** Shut the payment window, if one is open. Safe to call when none is. */
export function closePayment() {
  try {
    openInstance?.close();
  } catch {
    /* already gone */
  }
  openInstance = null;
}

/* Loaded on demand rather than in index.html: most visits never reach
   checkout, and this is a third-party script on every page otherwise. */
function loadCheckoutScript() {
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = SCRIPT_SRC;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      scriptPromise = null;
      reject(new Error("Could not reach Razorpay. Check your connection and try again."));
    };
    document.head.appendChild(el);
  });
  return scriptPromise;
}

/**
 * Opens the payment modal for an order.
 *
 * Resolves { paid: true } once the server has verified the signature,
 * { paid: false, reason: "dismissed" } if the guest closed the modal, and
 * rejects only on something they cannot act on.
 */
export async function payForOrder({ token, onStatus }) {
  if (!supabase) throw new Error("Payments are not configured.");

  onStatus?.("starting");
  const { data: created, error: createErr } = await supabase.functions.invoke(
    "payment-create-order",
    { body: { token } },
  );

  if (createErr) {
    /* The function returns 409 when the order is already paid, which is not a
       failure the guest should see as one. */
    const status = createErr.context?.status;
    if (status === 409) return { paid: true, alreadyPaid: true };
    /* A dish was switched off after the order was placed. Nothing was charged;
       the guest goes back to the cart, which marks the dish. */
    if (status === 410) {
      const body = await createErr.context.json?.().catch(() => null);
      return {
        paid: false,
        reason: "unavailable",
        message: body?.unavailable
          ? `Sorry, ${body.unavailable} is no longer available. Remove it from your order to continue.`
          : "Something in your order is no longer available. Please check your order.",
      };
    }
    throw new Error(
      status === 401
        ? "Payments are misconfigured on our side. Please tell the front desk."
        : "Could not start the payment. Please try again.",
    );
  }

  await loadCheckoutScript();
  onStatus?.("open");

  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: created.key_id,
      amount: created.amount,
      currency: created.currency,
      order_id: created.razorpay_order_id,
      name: "In Room Dining",
      description: `Order ${created.order_no}`,
      prefill: created.prefill,
      theme: { color: "#075B55" },
      /* Razorpay re-opens its own checkout after a failure when this is left
         on, so a guest who deliberately closed the window finds it back in
         front of them seconds later. Closing a payment window must mean the
         attempt is over; retrying is our decision to offer, on our page. */
      retry: { enabled: false },
      /* Razorpay shuts the window itself too, rather than relying on the page
         still being open to do it. */
      timeout: PAY_WINDOW_S,
      handler: async (response) => {
        onStatus?.("verifying");
        const { data: verified, error: verifyErr } = await supabase.functions.invoke(
          "payment-verify",
          {
            body: {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            },
          },
        );
        if (verifyErr || !verified?.paid) {
          /* The money may well have been taken — Razorpay's webhook will
             settle it. Never tell the guest it failed outright. */
          resolve({
            paid: false,
            reason: "unverified",
            message:
              "We could not confirm the payment straight away. If it was taken, " +
              "it will be confirmed shortly — please do not pay again.",
          });
          return;
        }
        openInstance = null;
        resolve({ paid: true, orderNo: verified.order_no });
      },
      modal: {
        ondismiss: () => {
          openInstance = null;
          resolve({ paid: false, reason: "dismissed" });
        },
      },
    });

    rzp.on("payment.failed", (e) => {
      resolve({
        paid: false,
        reason: "failed",
        message: e?.error?.description || "The payment did not go through.",
      });
    });

    try {
      openInstance = rzp;
      rzp.open();
    } catch (err) {
      openInstance = null;
      reject(err);
    }
  });
}
