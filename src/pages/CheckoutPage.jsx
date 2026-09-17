import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../context/cart-context";
import BillSummary from "../components/BillSummary";
import { rupees, formatPhone } from "../utils/format";
import { makeOrderId, saveOrder } from "../utils/orders";
import { TulsiLeaf, MorPankh, Matka } from "../components/Motifs";

const PROFILE_KEY = "brajrasoi.profile.v1";

const AREAS = [
  "Parikrama Marg",
  "Raman Reti",
  "Banke Bihari Temple area",
  "Loi Bazaar",
  "Chhatikara Road",
  "Jait Road",
  "Gopinath Bagh",
  "Vrindavan Bypass",
  "Chaitanya Vihar",
  "Sunrakh Road",
  "Mathura Road",
  "Other (tell us in the note)",
];

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
  house: "",
  area: AREAS[0],
  landmark: "",
  pincode: "281121",
  note: "",
  payment: "cod",
  remember: true,
};

export default function CheckoutPage() {
  const { lines, bill, instructions, coupon, donate, clear } = useCart();
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [placing, setPlacing] = useState(false);

  /* If they have ordered here before, pre-fill — still never forced to sign up. */
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PROFILE_KEY));
      if (saved) setForm((f) => ({ ...f, ...saved, payment: f.payment }));
    } catch {
      /* ignore */
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
    if (form.house.trim().length < 5)
      next.house = "House / flat and street, please";
    if (!/^\d{6}$/.test(form.pincode.trim()))
      next.pincode = "Six-digit PIN code";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function placeOrder(e) {
    e.preventDefault();
    if (!validate()) {
      const first = document.querySelector(".input.invalid, .textarea.invalid");
      first?.focus();
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setPlacing(true);

    if (form.remember) {
      try {
        const { payment, ...keep } = form;
        localStorage.setItem(PROFILE_KEY, JSON.stringify(keep));
      } catch {
        /* ignore */
      }
    }

    const placedAt = new Date();
    const order = {
      id: makeOrderId(),
      placedAt: placedAt.toISOString(),
      etaMinutes: 38,
      status: "confirmed",
      customer: {
        name: form.name.trim(),
        phone: phoneDigits,
        house: form.house.trim(),
        area: form.area,
        landmark: form.landmark.trim(),
        pincode: form.pincode.trim(),
        city: "Vrindavan, Mathura (U.P.)",
      },
      note: [instructions.trim(), form.note.trim()].filter(Boolean).join(" · "),
      payment: PAYMENTS.find((p) => p.id === form.payment),
      lines,
      bill,
      coupon,
      donate,
    };

    saveOrder(order);
    /* a beat of "sending to the kitchen" so the demo feels like the real thing */
    setTimeout(() => {
      clear();
      navigate(`/order/${order.id}`, { replace: true });
    }, 900);
  }

  const sattvicCount = lines.filter((l) => l.sattvic).length;

  return (
    <main className="wrap page" id="main">
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

      <form className="checkout-grid" onSubmit={placeOrder} noValidate>
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
                <h2 className="form-card__title">Delivery address</h2>
                <p className="form-card__sub">
                  We deliver across Vrindavan and up to Chhatikara.
                </p>
              </div>
            </div>

            <label className="field" htmlFor="house">
              <span className="field-label">
                House / flat, building &amp; street{" "}
                <span className="req">*</span>
              </span>
              <input
                id="house"
                className={`input ${errors.house ? "invalid" : ""}`}
                value={form.house}
                onChange={set("house")}
                placeholder="e.g. 14/3 Gopal Kunj, Gali No. 4, behind the dharamshala"
                autoComplete="address-line1"
              />
              {errors.house && (
                <span className="field-error">{errors.house}</span>
              )}
            </label>

            <div className="field-row">
              <label className="field" htmlFor="area">
                <span className="field-label">Area</span>
                <select
                  id="area"
                  className="input"
                  value={form.area}
                  onChange={set("area")}
                >
                  {AREAS.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </label>

              <label className="field" htmlFor="pincode">
                <span className="field-label">
                  PIN code <span className="req">*</span>
                </span>
                <input
                  id="pincode"
                  className={`input ${errors.pincode ? "invalid" : ""}`}
                  value={form.pincode}
                  onChange={(e) => {
                    setForm((f) => ({
                      ...f,
                      pincode: e.target.value.replace(/\D/g, "").slice(0, 6),
                    }));
                    setErrors((p) => (p.pincode ? { ...p, pincode: null } : p));
                  }}
                  inputMode="numeric"
                  autoComplete="postal-code"
                />
                {errors.pincode && (
                  <span className="field-error">{errors.pincode}</span>
                )}
              </label>
            </div>

            <label className="field" htmlFor="landmark">
              <span className="field-label">Landmark</span>
              <input
                id="landmark"
                className="input"
                value={form.landmark}
                onChange={set("landmark")}
                placeholder="e.g. opposite Prem Mandir gate 2"
              />
              <span className="field-hint">
                Galis here are narrow — a landmark saves everyone a phone call.
              </span>
            </label>

            <label className="field" htmlFor="note">
              <span className="field-label">Note for the rider</span>
              <textarea
                id="note"
                className="textarea"
                value={form.note}
                onChange={set("note")}
                maxLength={180}
                placeholder="Second floor, the green door. Cows usually sitting outside."
              />
            </label>

            <label className="remember">
              <input
                type="checkbox"
                checked={form.remember}
                onChange={set("remember")}
              />
              <span className="donate__box" aria-hidden="true" />
              <span>Remember these details on this device for next time</span>
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
              Braj Rasoi
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

            <button
              type="submit"
              className="btn btn-gold btn-block"
              disabled={placing}
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
            <p className="side-card__fine">
              By placing this order you agree to receive delivery updates on
              WhatsApp. Demo only — no payment is taken and no food will
              actually arrive.
            </p>
          </div>
        </aside>
      </form>
    </main>
  );
}
