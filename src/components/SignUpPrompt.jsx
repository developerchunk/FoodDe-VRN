import { useEffect, useRef } from "react";
import { Cloche, TulsiLeaf } from "./Icons";
import { GoogleMark } from "./Icons";


/**
 * Offered once at checkout, never enforced. Signing in buys order history on
 * any device; skipping costs nothing but keeps the order on this one. The skip
 * button, the scrim and Escape all lead to the same place, so there is no way
 * to get stuck behind it.
 */
export default function SignUpPrompt({ open, onGoogle, onSkip }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const { style } = document.body;
    const prev = style.overflow;
    style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && onSkip();
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => {
      style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onSkip]);

  if (!open) return null;

  return (
    <div
      className="prompt"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-title"
    >
      <button
        type="button"
        className="prompt__scrim"
        onClick={onSkip}
        aria-label="Continue without signing up"
      />

      <div className="prompt__panel" ref={panelRef} tabIndex={-1}>
        <span className="prompt__grip" aria-hidden="true" />

        <span className="prompt__mark" aria-hidden="true">
          <Cloche size={26} />
        </span>

        <h2 id="prompt-title" className="prompt__title">
          Save this order to your account?
        </h2>
        <p className="prompt__sub">
          Sign up with Google and your orders, receipts and addresses follow you
          to any device — plus the offers we keep for regulars.
        </p>

        <button type="button" className="prompt__google" onClick={onGoogle}>
          <GoogleMark />
          Continue with Google
        </button>

        <button type="button" className="prompt__skip" onClick={onSkip}>
          Continue to checkout without sign-up
        </button>

        <p className="prompt__note">
          <TulsiLeaf size={13} />
          <span>
            Without Google sign-in your orders stay on this device only — you
            will not be able to see your order history or account details, and
            they are lost if you clear your browser or switch phones.
          </span>
        </p>
      </div>
    </div>
  );
}
