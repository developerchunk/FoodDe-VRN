import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { signInWithGoogle } from "../lib/auth";
import { profileOf } from "../lib/profile";
import { UserIcon } from "./Icons";

/**
 * The header's one button: Sign up for a guest, their profile once they have.
 *
 * Sign up is Google sign-in -- a Google account that has not been here before
 * becomes a new account, one that has simply signs in -- so there is no second
 * button to choose between. It returns to the page it was clicked on.
 */
export default function AccountButton({ className = "account-button" }) {
  const { user, signedIn, loading } = useAuth();
  const { pathname } = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (loading) return null;

  if (signedIn) {
    const first = profileOf(user).name.split(" ")[0];
    return (
      <Link
        to="/profile"
        className={`${className} ${pathname === "/profile" ? "is-active" : ""}`}
        aria-label="Your profile"
      >
        <UserIcon size={20} />
        <span className="account-button__label">{first || "Profile"}</span>
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={busy}
        title={error ?? undefined}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await signInWithGoogle();
          /* On success the browser is already leaving for Google. */
          if (!result.ok) {
            setError(result.error);
            setBusy(false);
          }
        }}
      >
        <UserIcon size={20} />
        <span className="account-button__label">{busy ? "Opening…" : "Sign up"}</span>
      </button>
      {error && (
        <span className="sr-only" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
