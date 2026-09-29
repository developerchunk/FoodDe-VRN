import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCart } from "../context/cart-context";
import BillSummary from "../components/BillSummary";
import SignUpPrompt from "../components/SignUpPrompt";
import { rupees, formatPhone } from "../utils/format";
import { placeOrder } from "../lib/orders";
import {
  codeFromScanned,
  useProperty,
  useResolveRoom,
} from "../utils/property";
import { BuildingIcon, QrIcon, TulsiLeaf } from "../components/Icons";
import { SELLER } from "../utils/seller";
import { useCartAvailability } from "../hooks/useCartAvailability";
import { useAuth } from "../hooks/useAuth";
import { signInWithGoogle } from "../lib/auth";
import QrScanner from "../components/QrScanner";
import { canScanQr } from "../utils/qr";

const PROFILE_KEY = "brajrasoi.profile.v1";
const PROMPT_KEY = "brajrasoi.signupPrompt.v1";

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  emailOptIn: false,
  note: "",
  remember: true,
};

/* If they have ordered here before, pre-fill — still never forced to sign up. */
function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY));
    return saved
      ? { ...emptyForm, ...saved }
      : emptyForm;
  } catch {
    return emptyForm;
  }
}

export default function CheckoutPage() {
  const { lines, bill, instructions, coupon, flash, remove } =
    useCart();

  /* A cart can outlive the hours that made its dishes orderable. place_order
     refuses the whole order in that case; catching it here means the guest is
     told before they fill anything in, not after. */
  const availability = useCartAvailability(lines);
  const unavailable = availability.unavailable;
  const blocked = availability.status === "ok" && unavailable.length > 0;
  const navigate = useNavigate();
  /* Sent here by the order page when a payment failed or timed out. */
  const failedPayment = useLocation().state?.paymentFailed ?? null;
  const house = useProperty();
  const resolveRoom = useResolveRoom();
  const [roomCode, setRoomCode] = useState("");
  const [roomLookup, setRoomLookup] = useState({ busy: false, error: null });
  /* Held separately from "we have no room at all": a guest correcting a room
     still has a good one, and must be able to change their mind. */
  const [changingRoom, setChangingRoom] = useState(false);
  const [scanning, setScanning] = useState(false);

  /* A scanned sticker gives back the whole link, not the bare id. */
  async function onScanned(text) {
    setScanning(false);
    const code = codeFromScanned(text);
    setRoomLookup({ busy: true, error: null });
    const result = await resolveRoom(code);
    setRoomLookup({
      busy: false,
      error: result.ok ? null : "That QR code is not one of ours.",
    });
    if (result.ok) setChangingRoom(false);
  }

  async function findRoom(e) {
    e.preventDefault();
    setRoomLookup({ busy: true, error: null });
    const result = await resolveRoom(roomCode);
    setRoomLookup({ busy: false, error: result.ok ? null : result.error });
    if (result.ok) {
      setRoomCode("");
      setChangingRoom(false);
    }
  }

  function cancelChange() {
    setChangingRoom(false);
    setRoomCode("");
    setRoomLookup({ busy: false, error: null });
  }
  const [form, setForm] = useState(loadProfile);
  const [errors, setErrors] = useState({});
  const [placing, setPlacing] = useState(false);

  /* A real account, not the anonymous session every guest already has. */
  const { signedIn } = useAuth();

  /* Offered once per browsing session — declining must not mean being asked
     again on the way back from the cart. */
  const [prompt, setPrompt] = useState(() => {
    try {
      return sessionStorage.getItem(PROMPT_KEY) !== "seen";
    } catch {
      return true;
    }
  });

  const closePrompt = useCallback(() => {
    setPrompt(false);
    try {
      sessionStorage.setItem(PROMPT_KEY, "seen");
    } catch {
      /* private mode — it simply asks again next visit */
    }
  }, []);

  useEffect(() => {
    if (lines.length === 0 && !placing) navigate("/cart", { replace: true });
  }, [lines.length, placing, navigate]);

  const set = (key) => (e) => {
    const value =
      e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: null } : prev));
  };

  const phoneDigits = useMemo(
    () => form.phone.replace(/\D/g, ""),
    [form.phone],
  );

  function validate() {
    const next = {};
    if (form.name.trim().length < 3)
      next.name = "Please tell us your full name";
    if (phoneDigits.length !== 10) next.phone = "Enter the 10-digit number";
    else if (!/^[6-9]/.test(phoneDigits))
      next.phone = "Indian mobile numbers start with 6, 7, 8 or 9";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  const [placeError, setPlaceError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setPlaceError(null);

    /* Belt and braces: the button is disabled, but a stale render or a keyboard
       submit should not get past this either. The server would refuse anyway. */
    if (blocked) {
      setPlaceError(
        "Some items are no longer available. Remove them to place the order.",
      );
      return;
    }

    if (!validate()) {
      const first = document.querySelector(".input.invalid, .textarea.invalid");
      first?.focus();
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    /* Room service needs a room. Without a scanned code there is nowhere to
       deliver to, so there is nothing sensible to submit. */
    if (!house.addressId) {
      setPlaceError(
        "Please scan the QR code in your room so we know where to bring your order.",
      );
      return;
    }

    setPlacing(true);

    if (form.remember) {
      try {
        const keep = { ...form };
        localStorage.setItem(PROFILE_KEY, JSON.stringify(keep));
      } catch {
        /* ignore */
      }
    }

    try {
      const placed = await placeOrder({
        addressCode: house.addressId,
        lines,
        coupon,
        guest: {
          name: form.name.trim(),
          phone: phoneDigits,
          email: form.email.trim() || null,
        },
        note: [instructions.trim(), form.note.trim()]
          .filter(Boolean)
          .join(" · "),
      });

      /* The cart stays until the payment succeeds. An unpaid order is not an
         order, and a guest sent back here to try again must still have their
         food in front of them. OrderSuccessPage clears it once paid. */
      navigate(`/order/${placed.receipt_token}`, { replace: true });
    } catch (err) {
      /* The order was not created, so the cart is deliberately left intact. */
      setPlaceError(err.message);
      setPlacing(false);
    }
  }

  const sattvicCount = lines.filter((l) => l.sattvic).length;

  return (
    <main className="wrap page" id="main">
      <SignUpPrompt
        /* The session arrives a tick after mount, and again on the way
           back from Google, so this is derived rather than stored: someone
           signed in is never asked to sign in. */
        open={prompt && !signedIn}
        onSkip={closePrompt}
        onGoogle={async () => {
          closePrompt();
          /* Leaves for Google and comes back to this page; the cart is in
             localStorage and the room in sessionStorage, both of which survive
             a redirect in the same tab. */
          const result = await signInWithGoogle();
          if (!result.ok) flash(result.error, "error");
        }}
      />

      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/menu">Menu</Link>
        <span aria-hidden="true">›</span>
        <Link to="/cart">Your order</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">Delivery details</span>
      </nav>

      <header className="page__head">
        <div>
          <p className="eyebrow">Step 2 of 2</p>
          <h1 className="page__title">Where should we bring it?</h1>
          <p className="page__sub">
            Three details and we get going.
          </p>
        </div>
      </header>

      <form className="checkout-grid" onSubmit={submit} noValidate>
        <section className="checkout-grid__main">
          <div className="card form-card">
            <div className="form-card__head">
              <BuildingIcon size={22} />
              <div>
                <h2 className="form-card__title">Your details</h2>
                <p className="form-card__sub">
                  Just enough to reach your door.
                </p>
              </div>
            </div>

            <label className="field" htmlFor="name">
              <span className="field-label">
                Full name <span className="req">*</span>
              </span>
              <input
                id="name"
                className={`input ${errors.name ? "invalid" : ""}`}
                value={form.name}
                onChange={set("name")}
                placeholder="e.g. Radhika Sharma"
                autoComplete="name"
                aria-describedby={errors.name ? "name-err" : undefined}
              />
              {errors.name && (
                <span className="field-error" id="name-err">
                  {errors.name}
                </span>
              )}
            </label>

            <div className="field">
              <label className="field-label" htmlFor="phone">
                WhatsApp mobile number <span className="req">*</span>
              </label>
              <div className="phone-group">
                <span className="phone-prefix">
                  <svg
                    className="wa-icon"
                    viewBox="0 0 24 24"
                    width="22"
                    height="22"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.1 14.9l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 0 1 12 4zm4.3 10.6c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-3.2-2.8c-.1-.2 0-.4.1-.5l.4-.5c.1-.2.1-.3 0-.5l-.7-1.6c-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.5.1-.7.3-.8.8-.9 1.8-.4 2.9a9.4 9.4 0 0 0 4.4 4.4c1.4.6 2.4.6 3.1.2.4-.2.9-.7 1-1.2.1-.4.1-.7 0-.8l-.2-.3z" />
                  </svg>
                  +91
                </span>
                <input
                  id="phone"
                  className={`input ${errors.phone ? "invalid" : ""}`}
                  value={formatPhone(form.phone)}
                  onChange={(e) => {
                    setForm((f) => ({
                      ...f,
                      phone: e.target.value.replace(/\D/g, "").slice(0, 10),
                    }));
                    setErrors((p) => (p.phone ? { ...p, phone: null } : p));
                  }}
                  inputMode="numeric"
                  placeholder="98765 43210"
                  autoComplete="tel-national"
                  aria-describedby="phone-hint"
                />
              </div>
              {errors.phone ? (
                <span className="field-error">{errors.phone}</span>
              ) : (
                <span className="field-hint" id="phone-hint">
                  We send order updates here on WhatsApp.
                </span>
              )}
            </div>

            <label className="field" htmlFor="email">
              <span className="field-label">
                E-mail address <span className="opt">optional</span>
              </span>
              <input
                id="email"
                type="email"
                className={`input ${errors.email ? "invalid" : ""}`}
                value={form.email}
                onChange={set("email")}
                placeholder="radhika@example.com"
                autoComplete="email"
                inputMode="email"
              />
              {errors.email ? (
                <span className="field-error">{errors.email}</span>
              ) : (
                <span className="field-hint">
                  To save this order to your email.
                </span>
              )}
            </label>

            {/* An account already keeps the receipt, so this is only for
                guests. Every guest has an anonymous user, so this asks whether
                they are signed in, not whether a user object exists. */}
            {!signedIn && (
              <label className="remember remember--email">
                <input
                  type="checkbox"
                  checked={form.emailOptIn}
                  onChange={set("emailOptIn")}
                  disabled={!form.email.trim()}
                />
                <span className="checkbox__box" aria-hidden="true" />
                <span>Save this order to this e-mail</span>
              </label>
            )}

            <div className="consent-note">
              <span className="consent-note__mark" aria-hidden="true">
                <TulsiLeaf size={14} />
              </span>
              <p>
                We will use this mobile number to{" "}
                <strong>call and coordinate with you</strong> for your order
                delivery, and send you{" "}
                <strong>order history, receipts and support</strong>.
              </p>
            </div>
          </div>

          <div className="card form-card">
            <div className="form-card__head">
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                <path
                  d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="10" r="2.4" />
              </svg>
              <div>
                <h2 className="form-card__title">Delivering to</h2>
                <p className="form-card__sub">
                  From the code you scanned.
                </p>
              </div>
            </div>

            {house.addressId && !changingRoom ? (
              <div className="room-card">
                <p className="room-card__place">{house.property}</p>
                <p className="room-card__room">Room {house.room}</p>
                {house.address && (
                  <p className="room-card__addr">{house.address}</p>
                )}
                {/* Scanning the code in the wrong room, or ordering for a
                    different one, should not mean hunting for another QR. */}
                <button
                  type="button"
                  className="room-card__change"
                  onClick={() => setChangingRoom(true)}
                >
                  Change room
                </button>
              </div>
            ) : (
              <div className="room-find">
                <p className="room-find__lead">
                  There is a QR code in your room. Scan it.
                </p>

                {scanning ? (
                  <QrScanner onCode={onScanned} onClose={() => setScanning(false)} />
                ) : (
                  <>
                    {canScanQr() && (
                      <>
                        <button
                          type="button"
                          className="btn btn-teal btn-block"
                          onClick={() => setScanning(true)}
                        >
                          <QrIcon size={17} /> Scan QR code
                        </button>
                        <p className="room-find__or">
                          <span>or</span>
                        </p>
                      </>
                    )}

                    <label className="field-label" htmlFor="roomCode">
                      QR Code ID
                    </label>
                    <div className="room-find__row">
                      <input
                        id="roomCode"
                        className="input"
                        value={roomCode}
                        onChange={(e) => setRoomCode(e.target.value)}
                        placeholder="e.g. 25dhh3fgsq"
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck="false"
                        aria-invalid={roomLookup.error ? "true" : undefined}
                        onKeyDown={(e) => {
                          /* The checkout form is around this: Enter would
                             submit an order that has nowhere to go. */
                          if (e.key === "Enter") findRoom(e);
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-teal"
                        onClick={findRoom}
                        disabled={roomLookup.busy || !roomCode.trim()}
                      >
                        {roomLookup.busy ? "Checking…" : "Find room"}
                      </button>
                    </div>
                    <p className="field-hint">
                      Not your room number. It is printed under the QR code.
                    </p>
                  </>
                )}
                {roomLookup.error && (
                  <p className="side-card__error" role="alert">
                    {roomLookup.error}
                  </p>
                )}
                {changingRoom && (
                  <button
                    type="button"
                    className="room-find__cancel"
                    onClick={cancelChange}
                  >
                    Keep {house.property} · Room {house.room}
                  </button>
                )}
              </div>
            )}

            <label className="field" htmlFor="note">
              <span className="field-label">
  Anything we should know?
              </span>
              <textarea
                id="note"
                className="textarea"
                value={form.note}
                onChange={set("note")}
                maxLength={180}
                placeholder="Less chilli, please. Leave it at the door."
              />
            </label>

            <label className="remember">
              <input
                type="checkbox"
                checked={form.remember}
                onChange={set("remember")}
              />
              <span className="checkbox__box" aria-hidden="true" />
              <span>Remember my details on this device for next time</span>
            </label>
          </div>

        </section>

        <aside className="checkout-grid__side">
          <div className="card side-card">
            <h2 className="side-card__title">
              {bill.itemCount} {bill.itemCount === 1 ? "item" : "items"} from{" "}
              {SELLER.name}
            </h2>

            <ul className="mini-lines">
              {lines.map((l) => (
                <li key={l.id}>
                  <span className="veg-mark" aria-hidden="true" />
                  <span className="mini-lines__name">
                    {l.name} <em>× {l.qty}</em>
                  </span>
                  <span className="rupee">{rupees(l.price * l.qty)}</span>
                </li>
              ))}
            </ul>

            {sattvicCount > 0 && (
              <p className="sattvic-note">
                <TulsiLeaf size={13} />
                {sattvicCount === lines.length
                  ? "Every dish here is from the sattvic kitchen — no onion, no garlic."
                  : `${sattvicCount} of ${lines.length} dishes are from the sattvic kitchen.`}
              </p>
            )}

            <BillSummary bill={bill} />

            {failedPayment && (
              <p className="side-card__retry" role="alert">
                <strong>{failedPayment}</strong> Your food is still here — try
                again.
              </p>
            )}

            {blocked && (
              <div className="side-card__blocked" role="alert">
                <strong>
                  {unavailable.length === 1
                    ? "One item is no longer available"
                    : `${unavailable.length} items are no longer available`}
                </strong>
                <ul>
                  {unavailable.map((u) => (
                    <li key={u.id}>
                      <span>{u.name}</span>
                      <em>
                        {u.gone
                          ? "no longer on the menu"
                          : "not being served right now"}
                      </em>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="btn btn-ghost btn-block"
                  onClick={() => unavailable.forEach((u) => remove(u.id))}
                >
                  Remove {unavailable.length === 1 ? "it" : "them"} and continue
                </button>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-gold btn-block"
              disabled={placing || blocked}
            >
              {placing ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Sending to the
                  kitchen…
                </>
              ) : (
                <>Place order · {rupees(bill.total)}</>
              )}
            </button>
            {placeError && (
              <p className="side-card__error" role="alert">
                {placeError}
              </p>
            )}
            <p className="side-card__fine">
              Pay now — nothing reaches the kitchen until it goes through.
              Order updates come on WhatsApp.
            </p>
          </div>
        </aside>
      </form>
    </main>
  );
}
