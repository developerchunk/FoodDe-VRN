import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { signInWithGoogle, signOut } from "../lib/auth";
import { GoogleMark } from "./Icons";

/**
 * Sign in, or sign out again.
 *
 * `signedIn` means a real account. Every guest already has an anonymous
 * session, and offering to sign them out of that would be nonsense.
 *
 * Signing in leaves for Google and returns to whichever page this was clicked
 * on, so it never costs a guest their place mid-order.
 */
export default function SignInButton({ variant = "link", onError }) {
  const { signedIn, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  /* Shown here when the caller has nowhere to put it. A sign-in that fails
     silently is indistinguishable from a dead button. */
  const [error, setError] = useState(null);

  if (loading) return null;

  const go = async () => {
    setBusy(true);
    if (signedIn) {
      await signOut();
      setBusy(false);
      return;
    }
    const result = await signInWithGoogle();
    if (!result.ok) {
      if (onError) onError(result.error);
      else setError(result.error);
      setBusy(false);
    }
    /* On success the browser leaves for Google; nothing to reset. */
  };

  if (variant === "button") {
    return (
      <>
        <button type="button" className="btn btn-ghost" onClick={go} disabled={busy}>
          {signedIn ? (
            "Sign out"
          ) : (
            <>
              <GoogleMark /> {busy ? "Opening…" : "Sign in with Google"}
            </>
          )}
        </button>
        {error && (
          <span className="signin__error" role="alert">
            {error}
          </span>
        )}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        className="site-nav__link site-nav__link--plain"
        onClick={go}
        disabled={busy}
        title={error ?? undefined}
      >
        {signedIn ? "Sign out" : "Sign in"}
      </button>
      {error && (
        <span className="sr-only" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
