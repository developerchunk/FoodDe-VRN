import { useState } from "react";
import { deleteCoupon, listCoupons, saveCoupon } from "../api";
import { Badge, ConfirmButton, Drawer, Field, LoadState, PageHead, Switch } from "../ui";
import { fromPaise, toPaise, useLoad, useNotice } from "../helpers";
import { rupees } from "../../utils/format";

/**
 * Coupon codes, for the super admin. Every active coupon is offered to guests
 * at checkout with its label, and the database alone decides what it is worth
 * (price_order), so what is saved here is exactly what a guest gets.
 */

const EMPTY = { code: "", label: "", kind: "flat", value: "", min_order: "", max_discount: "", is_active: true };

const worth = (c) =>
  c.kind === "flat"
    ? `${rupees(c.value)} off`
    : `${c.value}% off${c.max_discount_paise ? `, up to ${rupees(c.max_discount_paise)}` : ""}`;

/* A label written for the guest from the rule, so the two never disagree. */
function suggestLabel(f) {
  const v = Number(f.value);
  const min = Number(f.min_order);
  if (!v) return "";
  const what = f.kind === "flat" ? `₹${v} off` : `${v}% off`;
  const cap = f.kind === "percent" && Number(f.max_discount) ? ` (max ₹${Number(f.max_discount)})` : "";
  return min ? `${what} on orders above ₹${min}${cap}` : `${what} any order${cap}`;
}

function validate(f, isNew, existing) {
  const e = {};
  if (!/^[A-Z0-9]{3,20}$/.test(f.code)) e.code = "3–20 capital letters or digits, no spaces.";
  else if (isNew && existing.some((c) => c.code === f.code)) e.code = "That code already exists.";
  if (f.label.trim().length < 4) e.label = "Guests see this line at checkout.";
  const v = Number(f.value);
  if (!(v > 0)) e.value = "More than zero.";
  else if (f.kind === "percent" && (v > 100 || !Number.isInteger(v))) e.value = "A whole percentage up to 100.";
  if (f.min_order !== "" && !(Number(f.min_order) >= 0)) e.min_order = "Zero or more.";
  if (f.max_discount !== "" && !(Number(f.max_discount) > 0)) e.max_discount = "More than zero, or leave empty.";
  return e;
}

function CouponForm({ initial, existing, onSaved, onClose }) {
  const isNew = !initial.code;
  const [f, setF] = useState(() =>
    isNew
      ? EMPTY
      : {
          code: initial.code,
          label: initial.label,
          kind: initial.kind,
          value: initial.kind === "flat" ? fromPaise(initial.value) : String(initial.value),
          min_order: fromPaise(initial.min_order_paise),
          max_discount: fromPaise(initial.max_discount_paise),
          is_active: initial.is_active,
        },
  );
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const notify = useNotice();
  const set = (k) => (e) =>
    setF((s) => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const errs = validate(f, isNew, existing);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const row = await saveCoupon(
        {
          code: f.code,
          label: f.label.trim(),
          kind: f.kind,
          value: f.kind === "flat" ? toPaise(f.value) : Number(f.value),
          min_order_paise: f.min_order === "" ? 0 : toPaise(f.min_order),
          max_discount_paise: f.kind === "percent" && f.max_discount !== "" ? toPaise(f.max_discount) : null,
          is_active: f.is_active,
        },
        isNew,
      );
      notify(isNew ? `${row.code} created` : `${row.code} saved`);
      onSaved(row, isNew);
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const suggestion = suggestLabel(f);

  return (
    <Drawer
      open
      title={isNew ? "New coupon" : `Edit ${initial.code}`}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          {!isNew && (
            <ConfirmButton
              confirm="Delete for good?"
              onConfirm={async () => {
                try {
                  await deleteCoupon(initial.code);
                  notify(`${initial.code} deleted`);
                  onSaved(null, false, initial.code);
                } catch (err) {
                  notify(err.message, "error");
                }
              }}
            >
              Delete
            </ConfirmButton>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="coupon-form" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save coupon"}
          </button>
        </>
      }
    >
      <form id="coupon-form" className="adm-form" onSubmit={submit} noValidate>
        <Field label="Code" required error={errors.code} hint={isNew ? "What guests type, e.g. RADHE50" : "A code cannot be renamed"}>
          <input
            className="input adm-mono"
            value={f.code}
            disabled={!isNew}
            autoCapitalize="characters"
            onChange={(e) => setF((s) => ({ ...s, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") }))}
          />
        </Field>
        <Field label="Type">
          <select className="input" value={f.kind} onChange={set("kind")}>
            <option value="flat">Fixed amount off (₹)</option>
            <option value="percent">Percentage off (%)</option>
          </select>
        </Field>
        <Field label={f.kind === "flat" ? "Amount off (₹)" : "Percent off"} required error={errors.value}>
          <input className="input" inputMode="decimal" value={f.value} onChange={set("value")} />
        </Field>
        <Field label="Minimum order (₹)" error={errors.min_order} hint="Food total before charges; empty for none">
          <input className="input" inputMode="decimal" value={f.min_order} onChange={set("min_order")} />
        </Field>
        {f.kind === "percent" && (
          <Field label="Most it can take off (₹)" error={errors.max_discount} hint="Empty for no cap">
            <input className="input" inputMode="decimal" value={f.max_discount} onChange={set("max_discount")} />
          </Field>
        )}
        <Field
          label="What guests read"
          required
          wide
          error={errors.label}
          hint={
            suggestion && suggestion !== f.label ? (
              <button type="button" className="adm-link" onClick={() => setF((s) => ({ ...s, label: suggestion }))}>
                Use “{suggestion}”
              </button>
            ) : (
              "Shown at checkout beside the code"
            )
          }
        >
          <input className="input" value={f.label} onChange={set("label")} />
        </Field>
        <label className="adm-check adm-field--wide">
          <input type="checkbox" checked={f.is_active} onChange={set("is_active")} /> Active — offered to guests at
          checkout
        </label>
      </form>
    </Drawer>
  );
}

export default function CouponsPage() {
  const { data, error, loading, reload, setData } = useLoad(listCoupons);
  const [editing, setEditing] = useState(null);
  const notify = useNotice();
  const coupons = data ?? [];

  const toggle = async (c, on) => {
    try {
      const row = await saveCoupon({ code: c.code, is_active: on }, false);
      setData(coupons.map((x) => (x.code === c.code ? row : x)));
      notify(on ? `${c.code} is offered at checkout` : `${c.code} is switched off`);
    } catch (e) {
      notify(e.message, "error");
    }
  };

  return (
    <>
      <PageHead title="Coupons" sub="Active coupons are offered to every guest at checkout. The discount is worked out on the server, so it is always exactly what is set here.">
        <button type="button" className="btn adm-btn-action" onClick={() => setEditing({})}>
          New coupon
        </button>
      </PageHead>

      <LoadState
        loading={loading && !data}
        error={error}
        onRetry={reload}
        empty={data && !coupons.length}
        emptyText="No coupons yet."
      />

      {coupons.length > 0 && (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Worth</th>
                <th>Minimum</th>
                <th>Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.code} className={c.is_active ? "" : "is-off"}>
                  <td className="adm-cell-main">
                    <strong className="adm-mono">{c.code}</strong>
                    <small>{c.label}</small>
                  </td>
                  <td data-label="Worth">
                    <Badge tone={c.kind === "flat" ? "info" : "gold"}>{worth(c)}</Badge>
                  </td>
                  <td data-label="Minimum">{c.min_order_paise ? rupees(c.min_order_paise) : "None"}</td>
                  <td data-label="Active">
                    <Switch checked={c.is_active} label={`${c.code} active`} onChange={(on) => toggle(c, on)} />
                  </td>
                  <td className="actions">
                    <button type="button" className="btn btn-ghost adm-btn-sm" onClick={() => setEditing(c)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <CouponForm
          initial={editing}
          existing={coupons}
          onClose={() => setEditing(null)}
          onSaved={(row, isNew, deletedCode) => {
            if (deletedCode) setData(coupons.filter((c) => c.code !== deletedCode));
            else setData(isNew ? [row, ...coupons] : coupons.map((c) => (c.code === row.code ? row : c)));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
