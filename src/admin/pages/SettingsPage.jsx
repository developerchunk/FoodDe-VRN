import { useState } from "react";
import { isMobile, listSettings, saveSetting, tenDigits } from "../api";
import { Field, LoadState, PageHead } from "../ui";
import { useLoad, useNotice } from "../helpers";

/**
 * Values the business changes without a deploy. The edge functions read them,
 * so a change here takes effect on the next order. Only keys that already
 * exist are updated: migration 0018 creates them, and a typo here must not
 * quietly create a setting nothing reads.
 */

const ALERTS = "admin_whatsapp";

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

      {alerts && (
        <AlertsNumber
          current={alerts.value}
          onSaved={(value) => setData(rows.map((r) => (r.key === ALERTS ? { ...r, value } : r)))}
        />
      )}
    </>
  );
}
