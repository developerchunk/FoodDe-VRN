import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCart } from "../context/cart-context";
import { useMenu } from "../hooks/useMenu";
import BillSummary from "../components/BillSummary";
import QtyStepper from "../components/QtyStepper";
import { DishPicture } from "../components/DishParts";
import SignUpPrompt from "../components/SignUpPrompt";
import Sheet from "../components/Sheet";
import { rupees, formatPhone } from "../utils/format";
import { fetchPairings } from "../lib/menu";
import { confirmCashOnDelivery, placeOrder } from "../lib/orders";
import {
  codeFromScanned,
  useProperty,
  useResolveRoom,
} from "../utils/property";
import {
  BuildingIcon,
  ChevronIcon,
  Cloche,
  QrIcon,
  TulsiLeaf,
  UserIcon,
} from "../components/Icons";
import { useCartAvailability } from "../hooks/useCartAvailability";
import UnavailableNotice from "../components/UnavailableNotice";
import { useAuth } from "../hooks/useAuth";
import { hasSavedProfile, profileOf } from "../lib/profile";
import { signInWithGoogle } from "../lib/auth";
import QrScanner from "../components/QrScanner";
import { canScanQr } from "../utils/qr";
import { track } from "../lib/track";

const PROFILE_KEY = "brajrasoi.profile.v1";
const PROMPT_KEY = "brajrasoi.signupPrompt.v1";
/* What the guest has filled in so far, for this tab only: a trip to the
   coupons screen and back must not empty the form or reset how they pay. */
const DRAFT_KEY = "ird.checkoutDraft.v1";

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  emailOptIn: false,
  remember: true,
};

function loadDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY)) ?? null;
  } catch {
    return null;
  }
}

/* If they have ordered here before, pre-fill — still never forced to sign up. */
function loadProfile() {
  const draft = loadDraft();
  if (draft?.form) return { ...emptyForm, ...draft.form };
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY));
    /* `note` was a field here once; the cart's instructions replaced it */
    // eslint-disable-next-line no-unused-vars
    const { note, ...rest } = saved ?? {};
    return saved ? { ...emptyForm, ...rest } : emptyForm;
  } catch {
    return emptyForm;
  }
}

const PAYMENTS = [
  { id: "online", title: "Pay online", sub: "UPI, cards, net banking" },
  { id: "cod", title: "Cash on delivery", sub: "Pay in cash or online when it arrives" },
];

const CheckIcon = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
    <path d="M3 8.5 6 12l7-8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * The whole checkout on one page, kept short: where it goes and who it is for
 * at the top, the food, the offers, the bill folded to one line, and the pay
 * button always in reach at the bottom. Changing the room, the guest's details,
 * the note or the way of paying each opens a sheet rather than growing the
 * page. Coupons have a screen of their own (/cart/coupons).
 *
 * Online, the order is placed and the payment window opens; nothing reaches a
 * kitchen until it goes through. Cash on delivery sends it to the kitchens at
 * once, and the money is taken at the door.
 */
export default function CheckoutPage() {
  const {
    lines,
    bill,
    coupon,
    instructions,
    add,
    decrement,
    remove,
    clear,
    setInstructions,
    flash,
  } = useCart();
  const navigate = useNavigate();

  /* A cart can outlive the hours that made its dishes orderable. place_order
     refuses the whole order in that case; catching it here means the guest is
     told before they try, not after. */
  const availability = useCartAvailability(lines);
  const unavailable = availability.unavailable;
  const blocked = availability.status === "ok" && unavailable.length > 0;

  /* Sent here by the order page when a payment failed or timed out. */
  const failedPayment = useLocation().state?.paymentFailed ?? null;

  /* Add-ons: the database picks dishes from the kitchens already cooking this
     order (it alone knows which those are); the live menu supplies the rest
     and drops anything that stopped being available since. */
  const { items: menu } = useMenu();
  const cartKey = lines.map((l) => l.id).sort().join(",");
  const [pairings, setPairings] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetchPairings(cartKey ? cartKey.split(",") : []).then((ids) => {
      if (!cancelled) setPairings(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [cartKey]);

  const suggestions = pairings
    .map((id) => menu.find((m) => m.id === id))
    .filter((m) => m && m.availableNow && !lines.some((l) => l.id === m.id))
    .slice(0, 6);

  /* Reaching checkout with something in the cart, once per arrival: what it
     was worth is what is lost if the visit ends without paying. */
  const hasLines = lines.length > 0;
  useEffect(() => {
    if (hasLines) track("checkout_view", { value: bill.total, items: lines.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLines]);

  /* Which sheet is open: "room", "details", "note", "pay" or none. */
  const [sheet, setSheet] = useState(null);
  const closeSheet = useCallback(() => setSheet(null), [setSheet]);

  const house = useProperty();
  const resolveRoom = useResolveRoom();
  const [roomCode, setRoomCode] = useState("");
  const [roomLookup, setRoomLookup] = useState({ busy: false, error: null });
  const [scanning, setScanning] = useState(false);

  /* A scanned sticker gives back the whole link, not the bare id. */
  async function onScanned(text) {
    setScanning(false);
    const code = codeFromScanned(text);
    setRoomLookup({ busy: true, error: null });
    const result = await resolveRoom(code, "camera");
    setRoomLookup({
      busy: false,
      error: result.ok ? null : "That QR code is not one of ours.",
    });
    if (result.ok) setSheet(null);
  }

  async function findRoom(e) {
    e.preventDefault();
    setRoomLookup({ busy: true, error: null });
    const result = await resolveRoom(roomCode);
    setRoomLookup({ busy: false, error: result.ok ? null : result.error });
    if (result.ok) {
      setRoomCode("");
      setSheet(null);
    }
  }

  const [form, setForm] = useState(loadProfile);
  const [errors, setErrors] = useState({});
  const [payment, setPayment] = useState(() => loadDraft()?.payment ?? "online");

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ form, payment }));
    } catch {
      /* private mode — the form simply starts from the profile again */
    }
  }, [form, payment]);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState(null);

  /* A real account, not the anonymous session every guest already has. */
  const { signedIn, user } = useAuth();

  /* A signed-up guest's saved name and number fill the form once, when their
     account is known. They can still change either for this order; that never
     touches the profile, which only changes on the profile page. Done during
     render rather than in an effect, so the form never flashes empty first. */
  const [prefilledFor, setPrefilledFor] = useState(null);
  const fromProfile = signedIn && user && prefilledFor === user.id;
  if (signedIn && user && prefilledFor !== user.id) {
    const p = profileOf(user);
    setPrefilledFor(user.id);
    setForm((f) => ({
      ...f,
      name: hasSavedProfile(user) ? p.name || f.name : f.name || p.name,
      phone: p.phone || f.phone,
    }));
  }

  /* Offered once per browsing session — declining must not mean being asked
     again. */
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

  function check() {
    const next = {};
    if (form.name.trim().length < 3)
      next.name = "Please tell us your full name";
    if (phoneDigits.length !== 10) next.phone = "Enter the 10-digit number";
    else if (!/^[6-9]/.test(phoneDigits))
      next.phone = "Indian mobile numbers start with 6, 7, 8 or 9";
    return next;
  }
  const detailsDone = Object.keys(check()).length === 0;

  function saveDetails(e) {
    e.preventDefault();
    const next = check();
    setErrors(next);
    if (Object.keys(next).length === 0) setSheet(null);
  }

  async function submit() {
    setPlaceError(null);

    /* Belt and braces: the button is disabled, but a stale render should not
       get past this either. The server would refuse anyway. */
    if (blocked) {
      setPlaceError(
        "Some items are no longer available. Remove them to place the order.",
      );
      return;
    }

    /* Room service needs a room, and someone to bring it to. What is missing
       opens where it is filled in. */
    if (!house.addressId) {
      track("room_needed");
      setSheet("room");
      return;
    }
    const missing = check();
    if (Object.keys(missing).length) {
      setErrors(missing);
      setSheet("details");
      return;
    }

    setPlacing(true);
    track("checkout_submit", { value: bill.total, items: lines.length, method: payment });

    if (form.remember) {
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(form));
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
        note: instructions.trim(),
      });

      track("order_placed", { value: bill.total, method: payment });
      if (payment === "cod") {
        /* Confirmed means sent to the kitchens: the cart's work is done. */
        await confirmCashOnDelivery(placed.receipt_token);
        track("cod_confirmed", { value: bill.total, items: lines.map((l) => l.id) });
        clear();
      }
      /* Paying online, the cart stays until the payment succeeds. An unpaid
         order is not an order, and a guest sent back here to try again must
         still have their food in front of them. OrderSuccessPage clears it
         once paid. */
      navigate(`/order/${placed.receipt_token}`, { replace: true });
    } catch (err) {
      /* Nothing reached a kitchen, so the cart is deliberately left intact. */
      track("order_error", { reason: String(err.message ?? "").slice(0, 80) });
      setPlaceError(err.message);
      setPlacing(false);
    }
  }

  if (lines.length === 0 && !placing) {
    return (
      <main className="wrap page page--narrow" id="main">
        <div className="empty-state card empty-state--page">
          <Cloche size={44} />
          <h1 className="section-title">Your cart is empty</h1>
          <Link to="/menu" className="btn btn-primary">
            Back to the menu
          </Link>
        </div>
      </main>
    );
  }

  const method = PAYMENTS.find((p) => p.id === payment);
  const offerShown = bill.discount > 0 ? bill.couponCode : null;

  return (
    <main className="wrap page co-page" id="main">
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

      <h1 className="sr-only">Checkout</h1>

      {/* Where it goes and who it is for: one line each, changed in a sheet. */}
      <section className="card co-to" aria-label="Delivery">
        <button type="button" className="co-to__row" onClick={() => setSheet("room")}>
          <BuildingIcon size={19} />
          {house.addressId ? (
            <span className="co-to__text">
              <strong>{house.property}</strong>
              <span>Room {house.room}</span>
            </span>
          ) : (
            <span className="co-to__text co-to__text--ask">
              <strong>Add your room</strong>
              <span>Scan the QR code in your room</span>
            </span>
          )}
          <ChevronIcon size={17} />
        </button>
        <button type="button" className="co-to__row" onClick={() => setSheet("details")}>
          <UserIcon size={19} />
          {detailsDone ? (
            <span className="co-to__text">
              <strong>{form.name.trim()}</strong>
              <span>+91 {formatPhone(phoneDigits)}</span>
            </span>
          ) : (
            <span className="co-to__text co-to__text--ask">
              <strong>Add your details</strong>
              <span>Your name and WhatsApp number</span>
            </span>
          )}
          <ChevronIcon size={17} />
        </button>
      </section>

      <section className="card co-items" aria-label="Items in your order">
        <ul>
          {lines.map((line) => (
            <li key={line.id} className="co-item">
              <span className="veg-mark" aria-hidden="true" />
              <div className="co-item__name">
                <p>{line.name}</p>
                {line.sattvic && (
                  <small>
                    <TulsiLeaf size={10} /> No onion–garlic
                  </small>
                )}
              </div>
              <QtyStepper
                qty={line.qty}
                label={line.name}
                size="sm"
                onAdd={() => add(line)}
                onRemove={() => decrement(line.id)}
              />
              <strong className="co-item__amt rupee">
                {rupees(line.pricePaise * line.qty)}
              </strong>
            </li>
          ))}
        </ul>

        {blocked && <UnavailableNotice unavailable={unavailable} onRemove={remove} />}

        <div className="co-chips">
          <Link to="/menu" className="co-chip">
            <span aria-hidden="true">+</span> Add items
          </Link>
          <button type="button" className="co-chip" onClick={() => setSheet("note")}>
            {instructions.trim() ? <CheckIcon /> : <span aria-hidden="true">✎</span>}
            Cooking requests
          </button>
        </div>
      </section>

      {suggestions.length > 0 && (
        <section className="card co-meal" aria-labelledby="meal-title">
          <h2 id="meal-title" className="co-label">
            Complete your meal
          </h2>
          <ul className="co-meal__list">
            {suggestions.map((s) => (
              <li key={s.id} className="co-meal__item">
                <div className="co-meal__art">
                  <DishPicture item={s} className="" />
                  <button
                    type="button"
                    className="co-meal__add"
                    onClick={() => add(s)}
                    aria-label={`Add ${s.name}`}
                  >
                    +
                  </button>
                </div>
                <p className="co-meal__name">
                  <span className="veg-mark" aria-hidden="true" /> {s.name}
                </p>
                <p className="co-meal__price rupee">{rupees(s.pricePaise)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card co-save" aria-labelledby="save-title">
        <h2 id="save-title" className="co-label">
          Savings corner
        </h2>
        <Link to="/cart/coupons" className="co-save__row">
          <span className="co-save__tag" aria-hidden="true">%</span>
          <span className="co-save__text">
            {offerShown ? (
              <>
                <strong>
                  {rupees(bill.discount)} saved with {offerShown}
                </strong>
                <span>View all coupons ›</span>
              </>
            ) : (
              <>
                <strong>Apply coupon</strong>
                <span>View all coupons ›</span>
              </>
            )}
          </span>
          {offerShown ? (
            <span className="co-save__ok">
              <CheckIcon /> Applied
            </span>
          ) : (
            <ChevronIcon size={17} className="co-save__go" />
          )}
        </Link>
        {bill.subtotal > 0 && bill.delivery === 0 ? (
          <div className="co-save__row">
            <span className="co-save__tag co-save__tag--teal" aria-hidden="true">
              ₹
            </span>
            <span className="co-save__text">
              <strong>Free delivery</strong>
            </span>
            <span className="co-save__ok">
              <CheckIcon /> Applied
            </span>
          </div>
        ) : (
          bill.freeDeliveryGap > 0 && (
            <p className="co-save__hint">
              Add <strong>{rupees(bill.freeDeliveryGap)}</strong> more and delivery is on us.
            </p>
          )
        )}
      </section>

      <BillSummary bill={bill} />

      {bill.minOrderGap > 0 && (
        <p className="co-note co-note--warn" role="status">
          The minimum order is {rupees(bill.subtotal + bill.minOrderGap)}.{" "}
          <Link to="/menu">Add {rupees(bill.minOrderGap)} more</Link> to place it.
        </p>
      )}
      {failedPayment && payment === "online" && (
        <p className="co-note co-note--warn" role="alert">
          <strong>{failedPayment}</strong> Your food is still here — try again.
        </p>
      )}

      {/* Always in reach: how it is paid, and the button that pays. */}
      <div className="pay-bar">
        {placeError && (
          <p className="pay-bar__error" role="alert">
            {placeError}
          </p>
        )}
        <div className="pay-bar__inner">
          <button type="button" className="pay-bar__method" onClick={() => setSheet("pay")}>
            <small>
              Pay using <ChevronIcon size={11} className="pay-bar__up" />
            </small>
            <strong>{method.title}</strong>
          </button>
          <button
            type="button"
            className="btn btn-gold pay-bar__go"
            onClick={submit}
            disabled={placing || blocked || bill.minOrderGap > 0}
          >
            {placing ? (
              <>
                <span className="spinner" aria-hidden="true" /> Placing…
              </>
            ) : payment === "cod" ? (
              <>Place order · {rupees(bill.total)}</>
            ) : (
              <>Pay {rupees(bill.total)}</>
            )}
          </button>
        </div>
      </div>

      <Sheet open={sheet === "room"} title="Delivering to" onClose={closeSheet}>
        {house.addressId && (
          <p className="co-sheet__current">
            Now: <strong>{house.property}</strong> · Room {house.room}
          </p>
        )}
        {scanning ? (
          <QrScanner onCode={onScanned} onClose={() => setScanning(false)} />
        ) : (
          <>
            {canScanQr() && (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={() => setScanning(true)}
                >
                  <QrIcon size={17} /> Scan QR code
                </button>
                <p className="room-find__or">
                  <span>or</span>
                </p>
              </>
            )}
            <form onSubmit={findRoom}>
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
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={roomLookup.busy || !roomCode.trim()}
                >
                  {roomLookup.busy ? "Checking…" : "Find room"}
                </button>
              </div>
              <p className="field-hint">
                Not your room number. It is printed under the QR code.
              </p>
            </form>
          </>
        )}
        {roomLookup.error && (
          <p className="side-card__error" role="alert">
            {roomLookup.error}
          </p>
        )}
      </Sheet>

      <Sheet open={sheet === "details"} title="Your details" onClose={closeSheet}>
        <form onSubmit={saveDetails} noValidate>
          {fromProfile && hasSavedProfile(user) && (
            <p className="checkout-from-profile">
              Filled in from your <Link to="/profile">profile</Link>. Changes
              here are for this order only.
            </p>
          )}

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
              <span className="phone-prefix">+91</span>
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
              className="input"
              value={form.email}
              onChange={set("email")}
              placeholder="radhika@example.com"
              autoComplete="email"
              inputMode="email"
            />
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

          <label className="remember">
            <input
              type="checkbox"
              checked={form.remember}
              onChange={set("remember")}
            />
            <span className="checkbox__box" aria-hidden="true" />
            <span>Remember my details on this device</span>
          </label>

          <p className="co-sheet__fine">
            We use this number to call you about the delivery, and to send your
            order updates, receipts and support on WhatsApp.
          </p>

          <button type="submit" className="btn btn-primary btn-block">
            Save
          </button>
        </form>
      </Sheet>

      <Sheet open={sheet === "note"} title="Cooking requests" onClose={closeSheet}>
        <label className="field" htmlFor="note">
          <span className="field-label">Anything we should know?</span>
          <textarea
            id="note"
            className="textarea"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            maxLength={220}
            rows={3}
            placeholder="Less chilli, please ring the bell twice"
          />
          <span className="field-hint">{220 - instructions.length} characters left</span>
        </label>
        <button type="button" className="btn btn-primary btn-block" onClick={closeSheet}>
          Done
        </button>
      </Sheet>

      <Sheet open={sheet === "pay"} title="Pay using" onClose={closeSheet}>
        <div className="pay-choice" role="radiogroup" aria-label="Pay using">
          {PAYMENTS.map((p) => (
            <label
              key={p.id}
              className={`pay-choice__option ${payment === p.id ? "is-on" : ""}`}
            >
              <input
                type="radio"
                name="payment"
                value={p.id}
                checked={payment === p.id}
                onChange={() => {
                  setPayment(p.id);
                  setSheet(null);
                }}
              />
              <span className="pay-choice__dot" aria-hidden="true" />
              <span className="pay-choice__text">
                <strong>{p.title}</strong>
                <small>{p.sub}</small>
              </span>
            </label>
          ))}
        </div>
      </Sheet>
    </main>
  );
}
