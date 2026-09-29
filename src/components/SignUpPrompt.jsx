import { useEffect, useRef } from "react";
import { Cloche, TulsiLeaf } from "./Icons";

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

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
