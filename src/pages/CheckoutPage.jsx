import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../context/cart-context";
import BillSummary from "../components/BillSummary";
import SignUpPrompt from "../components/SignUpPrompt";
import { rupees, formatPhone } from "../utils/format";
import { placeOrder } from "../lib/orders";
import { useProperty } from "../utils/property";
import { TulsiLeaf, MorPankh, Matka } from "../components/Motifs";
import { SELLER } from "../utils/seller";
import { useCartAvailability } from "../hooks/useCartAvailability";

const PROFILE_KEY = "brajrasoi.profile.v1";
const PROMPT_KEY = "brajrasoi.signupPrompt.v1";

const PAYMENTS = [
  {
    id: "cod",
    label: "Cash on delivery",
    note: "Pay the rider when the food reaches you",
  },
  {
    id: "upi",
    label: "UPI on delivery",
    note: "Scan the rider’s QR at the door",
  },
  {
    id: "online",
    label: "Pay online now",
    note: "Demo only — no payment gateway is connected",
  },
];

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  emailOptIn: false,
  note: "",
  payment: "cod",
  remember: true,
};

/* If they have ordered here before, pre-fill — still never forced to sign up. */
function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY));
    return saved
      ? { ...emptyForm, ...saved, payment: emptyForm.payment }
      : emptyForm;
  } catch {
    return emptyForm;
  }
}

export default function CheckoutPage() {
  const { lines, bill, instructions, coupon, donate, clear, flash, remove } =
    useCart();

  /* A cart can outlive the hours that made its dishes orderable. place_order
     refuses the whole order in that case; catching it here means the guest is
     told before they fill anything in, not after. */
  const availability = useCartAvailability(lines);
  const unavailable = availability.unavailable;
  const blocked = availability.status === "ok" && unavailable.length > 0;
  const navigate = useNavigate();
  const house = useProperty();
  const [form, setForm] = useState(loadProfile);
  const [errors, setErrors] = useState({});
  const [placing, setPlacing] = useState(false);

  /* Becomes the Supabase session once auth lands. Until then nobody is signed
     in, so the prompt and the e-mail opt-in always show. */
  const user = null;

  /* Offered once per browsing session — declining must not mean being asked
     again on the way back from the cart. */
  const [prompt, setPrompt] = useState(() => {
    if (user) return false;
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
        const { payment: _payment, ...keep } = form;
        localStorage.setItem(PROFILE_KEY, JSON.stringify(keep));
      } catch {
        /* ignore */
      }
    }

    try {
      const placed = await placeOrder({
        addressCode: house.addressId,
        lines,
        guest: {
          name: form.name.trim(),
          phone: phoneDigits,
          email: form.email.trim() || null,
        },
        coupon,
        donate,
        note: [instructions.trim(), form.note.trim()].filter(Boolean).join(" · "),
      });

      clear();
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
        open={prompt}
        onSkip={closePrompt}
        onGoogle={() => {
          closePrompt();
          /* wired to supabase.auth.signInWithOAuth once the project exists */
          flash("Google sign-in is not connected yet — carry on as a guest.");
        }}
      />

      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Menu</Link>
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
            No account, no password, no OTP. Three details and the kitchen gets
            going.
          </p>
        </div>
      </header>

      <form className="checkout-grid" onSubmit={submit} noValidate>
        <section className="checkout-grid__main">
          <div className="card form-card">
            <div className="form-card__head">
              <Matka size={22} />
              <div>
                <h2 className="form-card__title">Your details</h2>
                <p className="form-card__sub">
                  Only what we need to cook, call and reach your door.
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
                  We send order status and notifications to this number on
                  WhatsApp.
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
                  Only used to send you this receipt — never for marketing.
                </span>
              )}
            </label>

            {/* an account already keeps the receipt, so this is only for guests */}
            {!user && (
              <label className="remember remember--email">
                <input
                  type="checkbox"
                  checked={form.emailOptIn}
                  onChange={set("emailOptIn")}
                  disabled={!form.email.trim()}
                />
                <span className="donate__box" aria-hidden="true" />
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
                delivery. You can always sign up later with the same number to
                see your <strong>order history, receipts and support</strong> —
                it is never required to place an order.
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
                  Taken from the QR code you scanned — nothing to type.
                </p>
              </div>
            </div>

            {house.addressId ? (
              <div className="room-card">
                <p className="room-card__place">{house.property}</p>
                <p className="room-card__room">Room {house.room}</p>
                {house.address && (
                  <p className="room-card__addr">{house.address}</p>
                )}
              </div>
            ) : (
              <p className="side-card__error" role="alert">
                We do not know which room you are in. Please scan the QR code in
                your room to order.
              </p>
            )}

            <label className="field" htmlFor="note">
              <span className="field-label">
                Anything for the kitchen or the rider?
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
              <span className="donate__box" aria-hidden="true" />
              <span>Remember my details on this device for next time</span>
            </label>
          </div>

          <div className="card form-card">
            <div className="form-card__head">
              <MorPankh size={20} />
              <div>
                <h2 className="form-card__title">Payment</h2>
                <p className="form-card__sub">
                  This is a demo storefront — nothing is actually charged.
                </p>
              </div>
            </div>

            <div
              className="pay-options"
              role="radiogroup"
              aria-label="Payment method"
            >
              {PAYMENTS.map((p) => (
                <label
                  key={p.id}
                  className={`pay ${form.payment === p.id ? "is-on" : ""}`}
                >
                  <input
                    type="radio"
                    name="payment"
                    value={p.id}
                    checked={form.payment === p.id}
                    onChange={set("payment")}
                  />
                  <span className="pay__dot" aria-hidden="true" />
                  <span className="pay__text">
                    <strong>{p.label}</strong>
                    <small>{p.note}</small>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </section>

        <aside className="checkout-grid__side">
          <div className="card side-card">
            <h2 className="side-card__title">
              {bill.itemCount} {bill.itemCount === 1 ? "item" : "items"} from
              {" "}
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
              By placing this order you agree to receive delivery updates on
              WhatsApp. Payment is taken before the kitchen is notified.
            </p>
          </div>
        </aside>
      </form>
    </main>
  );
}
