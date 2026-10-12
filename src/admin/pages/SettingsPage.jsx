import { useState } from "react";
import { isMobile, listSettings, saveSetting, tenDigits } from "../api";
import { Field, LoadState, PageHead } from "../ui";
import { fromPaise, toPaise, useLoad, useNotice } from "../helpers";
import { rupees } from "../../utils/format";

/**
 * Values the business changes without a deploy. The edge functions read them,
 * so a change here takes effect on the next order. Only keys that already
 * exist are updated: migrations 0018 and 0025 create them, and a typo here
 * must not quietly create a setting nothing reads.
 */

const ALERTS = "admin_whatsapp";

/* Read by price_order() for every bill, in the cart and when the order is
   placed, and the minimum by the check on every new order. Stored as whole
   paise. */
const CHARGES = [
  { key: "delivery_paise", label: "Delivery charge (₹)" },
  { key: "packing_paise", label: "Packing charge (₹)" },
  { key: "free_delivery_above_paise", label: "Free delivery from (₹)", hint: "Food total before any coupon" },
  { key: "min_order_paise", label: "Minimum order (₹)", hint: "Food total before any coupon; 0 for none" },
];

/* Rupees with at most two decimals, up to ₹10,000. */
const validRupees = (v) => /^\d{1,5}(\.\d{1,2})?$/.test(String(v).trim()) && Number(v) <= 10000;

function Charges({ rows, onSaved }) {
  const current = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const [f, setF] = useState(() =>
    Object.fromEntries(CHARGES.map((c) => [c.key, fromPaise(Number(current[c.key]))])),
  );
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const notify = useNotice();
  const changed = CHARGES.filter((c) => validRupees(f[c.key]) && String(toPaise(f[c.key])) !== current[c.key]);
  const invalid = CHARGES.some((c) => !validRupees(f[c.key]));

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    for (const c of CHARGES) if (!validRupees(f[c.key])) errs[c.key] = "Rupees, up to ₹10,000.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const saved = {};
      try {
        for (const c of changed) {
          const paise = String(toPaise(f[c.key]));
          await saveSetting(c.key, paise);
          saved[c.key] = paise;
        }
      } finally {
        /* whatever reached the database, even if a later one failed */
        if (Object.keys(saved).length) onSaved(saved);
      }
      notify("Charges saved");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const fee = Number(current.delivery_paise);
  const above = Number(current.free_delivery_above_paise);

  return (
    <section className="adm-card">
      <h2>Charges &amp; minimum order</h2>
      <p className="adm-muted" style={{ marginBottom: 16 }}>
        {fee === 0
          ? "Delivery is free on every order."
          : `Now: ${rupees(fee)} delivery, free when the food comes to ${rupees(above)} or more.`}{" "}
        Packing is {Number(current.packing_paise) === 0 ? "free" : rupees(Number(current.packing_paise))} per order.{" "}
        {Number(current.min_order_paise) === 0
          ? "There is no minimum order."
          : `Orders need at least ${rupees(Number(current.min_order_paise))} of food.`}{" "}
        Changes apply to the next bill a guest sees.
      </p>
      <form className="adm-form" onSubmit={submit} noValidate>
        {CHARGES.map((c) => (
          <Field key={c.key} label={c.label} required error={errors[c.key]} hint={c.hint}>
            <input
              className="input"
              inputMode="decimal"
              value={f[c.key]}
              onChange={(e) => setF((s) => ({ ...s, [c.key]: e.target.value }))}
            />
          </Field>
        ))}
        <div className="adm-field--wide">
          <button type="submit" className="btn btn-primary" disabled={busy || (!changed.length && !invalid)}>
            {busy ? "Saving…" : "Save charges"}
          </button>
        </div>
      </form>
    </section>
  );
}

function AlertsNumber({ current, onSaved }) {
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const notify = useNotice();
  const unchanged = tenDigits(value) === (current ?? "");

  const submit = async (e) => {
    e.preventDefault();
    if (!isMobile(value)) {
      setError("A 10-digit Indian mobile number.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const n = tenDigits(value);
      await saveSetting(ALERTS, n);
      setValue(n);
      onSaved(n);
      notify("Alerts number saved");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="adm-card">
      <h2>Alerts WhatsApp number</h2>
      <p className="adm-muted">When an order gets stuck, a message goes to this number:</p>
      <ul className="adm-muted" style={{ margin: "8px 0 16px", paddingLeft: 20, listStyle: "disc", display: "grid", gap: 4 }}>
        <li>a kitchen rejects an order;</li>
        <li>a kitchen has not answered 10 minutes after the guest paid;</li>
        <li>no delivery partner has accepted within 10 minutes, or every one of them declined.</li>
      </ul>
      <form className="adm-form" onSubmit={submit} noValidate>
        <Field label="WhatsApp number" required error={error} hint={current ? `Now: ${current}` : "Not set yet"}>
          <input
            className="input"
            inputMode="tel"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
        <div className="adm-field--wide">
          <button type="submit" className="btn btn-primary" disabled={busy || unchanged}>
            {busy ? "Saving…" : "Save number"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default function SettingsPage() {
  const { data, error, loading, reload, setData } = useLoad(listSettings);
  const rows = data ?? [];
  const alerts = rows.find((r) => r.key === ALERTS);
  const charges = rows.filter((r) => CHARGES.some((c) => c.key === r.key));

  return (
    <>
      <PageHead title="Settings" sub="Business values that take effect on the next order." />

      <LoadState loading={loading && !data} error={error} onRetry={reload} />

      {data && !alerts && (
        <div className="adm-state adm-state--error" role="alert">
          <p>
            The alerts number setting does not exist yet. Migration 0018 (admin) has not been applied to this database;
            apply it, then reload this page.
          </p>
          <button type="button" className="btn btn-ghost" onClick={reload}>
            Reload
          </button>
        </div>
      )}

      {data && charges.length < CHARGES.length && (
        <div className="adm-state adm-state--error" role="alert">
          <p>
            The charges and minimum order settings do not exist yet. Migration 0025 (charges) has not been applied to this
            database; apply it, then reload this page.
          </p>
          <button type="button" className="btn btn-ghost" onClick={reload}>
            Reload
          </button>
        </div>
      )}

      {charges.length === CHARGES.length && (
        <Charges
          rows={charges}
          onSaved={(saved) => setData(rows.map((r) => (r.key in saved ? { ...r, value: saved[r.key] } : r)))}
        />
      )}

      {alerts && (
        <AlertsNumber
          current={alerts.value}
          onSaved={(value) => setData(rows.map((r) => (r.key === ALERTS ? { ...r, value } : r)))}
        />
      )}
    </>
  );
}
