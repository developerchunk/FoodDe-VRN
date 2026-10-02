import { useCallback, useState } from "react";
import { isMobile, listPartners, savePartner, tenDigits } from "../api";
import { Drawer, Field, LoadState, PageHead, Switch } from "../ui";
import { useLoad, useNotice } from "../helpers";

/**
 * Delivery partners. Everyone on duty is offered every new pickup on WhatsApp
 * and the first to accept takes it. There is no delete: past orders point at
 * the partner who carried them, so switching someone off is how they leave.
 */

const EMPTY = { name: "", whatsapp_number: "", is_active: true };

function validate(f) {
  const e = {};
  if (f.name.trim().length < 2) e.name = "A name is required.";
  if (!isMobile(f.whatsapp_number)) e.whatsapp_number = "A 10-digit Indian mobile number.";
  return e;
}

function PartnerForm({ initial, onSaved, onClose }) {
  const [f, setF] = useState(() => ({ ...EMPTY, ...initial }));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const notify = useNotice();
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const errs = validate(f);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const row = await savePartner({
        id: initial?.id,
        name: f.name.trim(),
        whatsapp_number: tenDigits(f.whatsapp_number),
        is_active: f.is_active,
      });
      notify(initial?.id ? "Partner saved" : "Partner added");
      onSaved(row);
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open
      title={initial?.id ? `Edit ${initial.name}` : "Add a delivery partner"}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="partner-form" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save partner"}
          </button>
        </>
      }
    >
      <form id="partner-form" className="adm-form" onSubmit={submit} noValidate>
        <Field label="Name" required error={errors.name}>
          <input className="input" value={f.name} onChange={set("name")} autoComplete="off" />
        </Field>
        <Field
          label="WhatsApp number"
          required
          error={errors.whatsapp_number}
          hint="Pickups arrive here with Accept / Reject buttons"
        >
          <input className="input" inputMode="tel" value={f.whatsapp_number} onChange={set("whatsapp_number")} />
        </Field>
        <label className="adm-check adm-field--wide">
          <input type="checkbox" checked={f.is_active} onChange={set("is_active")} /> On duty — offered every new
          pickup
        </label>
      </form>
    </Drawer>
  );
}

export default function DeliveryPage() {
  const { data, error, loading, reload, setData } = useLoad(listPartners);
  const [editing, setEditing] = useState(null);
  const notify = useNotice();
  const partners = data ?? [];
  const onDuty = partners.filter((p) => p.is_active).length;
  const close = useCallback(() => setEditing(null), []);

  const toggle = async (p, on) => {
    try {
      const row = await savePartner({ id: p.id, is_active: on });
      setData(partners.map((x) => (x.id === p.id ? row : x)));
      notify(on ? `${p.name} is on duty — new pickups will be offered` : `${p.name} is off duty — no more pickups offered`);
    } catch (e) {
      notify(e.message, "error");
    }
  };

  return (
    <>
      <PageHead
        title="Delivery partners"
        sub="Every partner on duty gets each new pickup on WhatsApp with Accept / Reject. The first to accept takes it, and the rest are told it has been taken."
      >
        <button type="button" className="btn adm-btn-action" onClick={() => setEditing({})}>
          Add partner
        </button>
      </PageHead>

      <LoadState
        loading={loading && !data}
        error={error}
        onRetry={reload}
        empty={data && !partners.length}
        emptyText="No delivery partners yet. Add the first one."
      />

      {data && partners.length > 0 && onDuty === 0 && (
        <div className="adm-state adm-state--error" role="status">
          <p>Nobody is on duty, so new orders have no one to pick them up.</p>
        </div>
      )}

      {partners.length > 0 && (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Partner</th>
                <th>WhatsApp</th>
                <th>On duty</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => (
                <tr key={p.id} className={p.is_active ? "" : "is-off"}>
                  <td className="adm-cell-main">
                    <strong>{p.name}</strong>
                    <small>{p.is_active ? "Gets new pickups" : "Off duty"}</small>
                  </td>
                  <td data-label="WhatsApp" className="adm-mono">
                    {p.whatsapp_number}
                  </td>
                  <td data-label="On duty">
                    <Switch checked={p.is_active} label={`${p.name} on duty`} onChange={(on) => toggle(p, on)} />
                  </td>
                  <td className="actions">
                    <button type="button" className="btn btn-ghost adm-btn-sm" onClick={() => setEditing(p)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && partners.length > 0 && (
        <p className="adm-muted" style={{ marginTop: 12 }}>
          Partners are never deleted, because past orders show who delivered them. Switch someone off when they stop
          riding.
        </p>
      )}

      {editing && (
        <PartnerForm
          initial={editing}
          onClose={close}
          onSaved={(row) => {
            setData(
              editing.id ? partners.map((x) => (x.id === row.id ? row : x)) : [...partners, row].sort((a, b) => a.name.localeCompare(b.name)),
            );
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
