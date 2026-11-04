import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { collectPayment, fetchCollect } from "../lib/orders";
import { rupees } from "../utils/format";
import { Cloche } from "../components/Icons";

/* While the guest is paying online, look again this often. */
const POLL_MS = 4_000;

/**
 * The rider's page for a cash-on-delivery order: /collect/<collect token>.
 *
 * Sent to the assigned rider on WhatsApp when the order goes out. At the door
 * they choose how the guest is paying:
 *
 *   Online -> a QR of the guest's payment page, for the guest to scan and pay
 *             on their own phone. The moment it goes through, the order is
 *             delivered.
 *   Cash   -> the rider took the cash; recorded, and the order is delivered.
 */
export default function CollectPage() {
  const { token } = useParams();
  const [state, setState] = useState({ order: null, loading: true });
  const [mode, setMode] = useState(null); // null | "online" | "cash"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [qr, setQr] = useState(null);

  const load = useCallback(async () => {
    const order = await fetchCollect(token);
    setState({ order, loading: false });
    return order;
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    fetchCollect(token).then((order) => {
      if (!cancelled) setState({ order, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const { order, loading } = state;
  const payUrl = order ? `${window.location.origin}/pay/${order.pay_token}` : null;
  const paidOnline = order?.collected_via === "online";
  const done = order?.status === "delivered";
  const closed = ["cancelled", "failed", "pending_payment"].includes(order?.status);

  const complete = useCallback(
    async (method) => {
      setBusy(true);
      setError(null);
      try {
        await collectPayment(token, method);
        await load();
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    },
    [token, load],
  );

  /* The QR is drawn only when asked for: most deliveries are cash. */
  useEffect(() => {
    if (mode !== "online" || !payUrl || qr) return;
    let cancelled = false;
    import("qrcode").then(({ default: QRCode }) =>
      QRCode.toDataURL(payUrl, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 520,
        color: { dark: "#04322f", light: "#ffffff" },
      }).then((url) => !cancelled && setQr(url)),
    );
    return () => {
      cancelled = true;
    };
  }, [mode, payUrl, qr]);

  /* Watch for the guest's payment, and hand the order over as soon as it lands. */
  useEffect(() => {
    if (mode !== "online" || done || closed) return undefined;
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const fresh = await load();
      if (fresh?.collected_via === "online" && fresh.status !== "delivered") complete("online");
    }, POLL_MS);
    return () => clearInterval(t);
  }, [mode, done, closed, load, complete]);

  if (loading) {
    return (
      <main className="wrap page page--narrow" id="main">
        <div className="empty-state card empty-state--page">
          <span className="spinner spinner--dark" aria-hidden="true" />
          <h1 className="section-title">Fetching the order…</h1>
        </div>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="wrap page page--narrow" id="main">
        <div className="empty-state card empty-state--page">
          <Cloche size={42} />
          <h1 className="section-title">This link is not valid</h1>
        </div>
      </main>
    );
  }

  const amount = rupees(order.total_paise);

  return (
    <main className="wrap page page--narrow" id="main">
      <section className="card waiting collect" aria-live="polite">
        <p className="eyebrow">Order {order.order_no}</p>
        <p className="waiting__sub collect__where">
          {order.guest_name} · {order.place_name}, Room {order.room_number}
        </p>

        {closed ? (
          <h1 className="waiting__title">This order was cancelled</h1>
        ) : done ? (
          <>
            <span className="collect__tick" aria-hidden="true">
              ✓
            </span>
            <h1 className="waiting__title">Delivered</h1>
            <p className="collect__note">
              {amount} {paidOnline ? "paid online" : "received in cash"}.
            </p>
          </>
        ) : paidOnline && mode !== "online" ? (
          <>
            <h1 className="waiting__title">Paid online</h1>
            <p className="waiting__amount rupees">{amount}</p>
            <button
              type="button"
              className="btn btn-gold btn-block"
              disabled={busy}
              onClick={() => complete("online")}
            >
              Mark as delivered
            </button>
          </>
        ) : mode === "online" ? (
          <>
            <h1 className="waiting__title">Guest pays online</h1>
            <p className="waiting__amount rupees">{amount}</p>
            <p className="collect__note">
              Ask the guest to scan this with their phone camera and pay.
            </p>
            <div className="collect__qr">
              {qr ? (
                <img src={qr} alt="QR code for the payment page" width="260" height="260" />
              ) : (
                <span className="spinner spinner--dark" aria-hidden="true" />
              )}
            </div>
            <p className="collect__wait">
              <span className="spinner spinner--dark" aria-hidden="true" /> Waiting for the
              payment…
            </p>
            <a
              href={payUrl}
              target="_blank"
              rel="noopener"
              className="btn btn-primary btn-block"
            >
              Open payment page
            </a>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => setMode(null)}
            >
              Back
            </button>
          </>
        ) : mode === "cash" ? (
          <>
            <h1 className="waiting__title">Cash received?</h1>
            <p className="waiting__amount rupees">{amount}</p>
            <button
              type="button"
              className="btn btn-gold btn-block"
              disabled={busy}
              onClick={() => complete("cash")}
            >
              {busy ? "Saving…" : `Yes, ${amount} received`}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              disabled={busy}
              onClick={() => setMode(null)}
            >
              Back
            </button>
          </>
        ) : (
          <>
            <h1 className="waiting__title">Collect payment</h1>
            <p className="waiting__amount rupees">{amount}</p>
            <div className="collect__choices">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setMode("online")}
              >
                Online
              </button>
              <button
                type="button"
                className="btn btn-gold"
                onClick={() => setMode("cash")}
              >
                Cash
              </button>
            </div>
          </>
        )}

        {error && (
          <p className="side-card__error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
