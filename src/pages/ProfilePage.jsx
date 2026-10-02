import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { signInWithGoogle, signOut } from "../lib/auth";
import { profileOf, saveProfile } from "../lib/profile";
import { formatPhone } from "../utils/format";
import { Cloche, GoogleMark } from "../components/Icons";

/**
 * A signed-up guest's own details: the name and WhatsApp number checkout fills
 * in for them. Changing either at checkout changes that order only; this page
 * is the one place the saved values change.
 */

function SignUpCard() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  return (
    <main className="wrap page page--narrow" id="main">
      <div className="empty-state card empty-state--page">
        <Cloche size={42} />
        <h1 className="section-title">Sign up to save your details</h1>
        <p className="muted">
          Your name and number are filled in at checkout, and your orders follow
          you to any device.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const result = await signInWithGoogle();
            if (!result.ok) {
              setError(result.error);
              setBusy(false);
            }
          }}
        >
          <GoogleMark /> {busy ? "Opening Google…" : "Sign up with Google"}
        </button>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}

function ProfileForm({ user }) {
  const saved = profileOf(user);
  const [form, setForm] = useState({ name: saved.name, phone: saved.phone });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const changed = form.name.trim() !== saved.name.trim() || form.phone !== saved.phone;

  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    if (form.name.trim().length < 3) next.name = "Please tell us your full name";
    if (form.phone && form.phone.length !== 10) next.phone = "Enter the 10-digit number";
    else if (form.phone && !/^[6-9]/.test(form.phone))
      next.phone = "Indian mobile numbers start with 6, 7, 8 or 9";
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    setStatus(null);
    try {
      await saveProfile(form);
      setStatus({ tone: "ok", text: "Saved. Checkout will use these from now on." });
    } catch (err) {
      setStatus({ tone: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="wrap page page--narrow" id="main">
      <header className="page__head">
        <div>
          <p className="eyebrow">Your account</p>
          <h1 className="page__title">Profile</h1>
          <p className="page__sub">Signed in as {user.email}</p>
        </div>
      </header>

      <form className="card profile-card" onSubmit={submit} noValidate>
        <label className="field" htmlFor="profile-name">
          <span className="field-label">
            Full name <span className="req">*</span>
          </span>
          <input
            id="profile-name"
            className={`input ${errors.name ? "invalid" : ""}`}
            value={form.name}
            onChange={(e) => {
              setForm((f) => ({ ...f, name: e.target.value }));
              setErrors((p) => ({ ...p, name: null }));
            }}
            autoComplete="name"
          />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </label>

        <div className="field">
          <label className="field-label" htmlFor="profile-phone">
            WhatsApp mobile number
          </label>
          <div className="phone-group">
            <span className="phone-prefix">+91</span>
            <input
              id="profile-phone"
              className={`input ${errors.phone ? "invalid" : ""}`}
              value={formatPhone(form.phone)}
              onChange={(e) => {
                setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }));
                setErrors((p) => ({ ...p, phone: null }));
              }}
              inputMode="numeric"
              placeholder="98765 43210"
              autoComplete="tel-national"
            />
          </div>
          {errors.phone ? (
            <span className="field-error">{errors.phone}</span>
          ) : (
            <span className="field-hint">Filled in for you at checkout. Order updates go here.</span>
          )}
        </div>

        {status && (
          <p className={status.tone === "ok" ? "profile-card__ok" : "field-error"} role="status">
            {status.text}
          </p>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={busy || !changed}>
          {busy ? "Saving…" : "Save details"}
        </button>
      </form>

      <div className="profile-links">
        <Link to="/orders" className="btn btn-ghost">
          Your orders
        </Link>
        <button type="button" className="btn btn-ghost" onClick={signOut}>
          Sign out
        </button>
      </div>
    </main>
  );
}

export default function ProfilePage() {
  const { user, signedIn, loading } = useAuth();

  if (loading) {
    return (
      <main className="wrap page page--narrow" id="main">
        <div className="empty-state card empty-state--page">
          <span className="spinner spinner--dark" aria-hidden="true" />
        </div>
      </main>
    );
  }
  if (!signedIn) return <SignUpCard />;
  /* Keyed on the account, so signing in as someone else starts a fresh form. */
  return <ProfileForm key={user.id} user={user} />;
}
