import { useState } from "react";
import { isMobile, listKitchens, saveKitchen, tenDigits } from "../api";
import { Badge, Drawer, Field, LoadState, PageHead, Switch } from "../ui";
import { blankToNull, timeIn, timeOut, useLoad, useNotice } from "../helpers";

/**
 * Partner kitchens. The WhatsApp number is where its orders go, with the
 * Accept / Reject buttons, and its hours decide when its dishes can be ordered.
 * Switching a kitchen off takes every one of its dishes off the guest menu.
 */

const EMPTY = {
  place_name: "",
  owner_name: "",
  whatsapp_number: "",
  address: "",
  area: "",
  pin_code: "",
  city: "Vrindavan",
  latitude: "",
  longitude: "",
  opens_at: "",
  closes_at: "",
  is_sunday_off: false,
  fssai_license: "",
  gst_number: "",
  is_active: true,
};

const hours = (k) =>
  k.opens_at && k.closes_at ? `${timeIn(k.opens_at)} – ${timeIn(k.closes_at)}` : "Always open";

function validate(f) {
  const e = {};
  if (f.place_name.trim().length < 2) e.place_name = "A name is required.";
  if (!isMobile(f.whatsapp_number)) e.whatsapp_number = "A 10-digit Indian mobile number.";
  if (Boolean(f.opens_at) !== Boolean(f.closes_at)) e.closes_at = "Give both opening and closing time, or neither.";
  for (const k of ["latitude", "longitude"]) {
    if (f[k] !== "" && f[k] != null && !Number.isFinite(Number(f[k]))) e[k] = "A number, e.g. 27.5723";
  }
  return e;
}

function KitchenForm({ initial, onSaved, onClose }) {
  const [f, setF] = useState(() => ({
    ...EMPTY,
    ...initial,
    opens_at: timeIn(initial?.opens_at),
    closes_at: timeIn(initial?.closes_at),
    latitude: initial?.latitude ?? "",
    longitude: initial?.longitude ?? "",
  }));
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
      const row = await saveKitchen({
        id: initial?.id,
        place_name: f.place_name.trim(),
        owner_name: blankToNull(f.owner_name),
        whatsapp_number: tenDigits(f.whatsapp_number),
        address: blankToNull(f.address),
        area: blankToNull(f.area),
        pin_code: blankToNull(f.pin_code),
        city: blankToNull(f.city) ?? "Vrindavan",
        latitude: f.latitude === "" ? null : Number(f.latitude),
        longitude: f.longitude === "" ? null : Number(f.longitude),
        opens_at: timeOut(f.opens_at),
        closes_at: timeOut(f.closes_at),
        is_sunday_off: f.is_sunday_off,
        fssai_license: blankToNull(f.fssai_license),
        gst_number: blankToNull(f.gst_number),
        is_active: f.is_active,
      });
      notify(initial?.id ? "Kitchen saved" : "Kitchen added");
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
      title={initial?.id ? `Edit ${initial.place_name}` : "Add a kitchen"}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="kitchen-form" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save kitchen"}
          </button>
        </>
      }
    >
      <form id="kitchen-form" className="adm-form" onSubmit={submit} noValidate>
        <Field label="Kitchen name" required error={errors.place_name} wide>
          <input className="input" value={f.place_name} onChange={set("place_name")} />
        </Field>
        <Field label="Owner" hint="Who to ask for">
          <input className="input" value={f.owner_name ?? ""} onChange={set("owner_name")} />
        </Field>
        <Field
          label="WhatsApp number"
          required
          error={errors.whatsapp_number}
          hint="Orders arrive here with Accept / Reject buttons"
        >
          <input className="input" inputMode="tel" value={f.whatsapp_number} onChange={set("whatsapp_number")} />
        </Field>

        <h3 className="adm-section-title">Hours</h3>
        <Field label="Opens at" hint="Leave both empty if always open">
          <input className="input" type="time" value={f.opens_at} onChange={set("opens_at")} />
        </Field>
        <Field label="Closes at" error={errors.closes_at} hint="May be after midnight, e.g. 01:00">
          <input className="input" type="time" value={f.closes_at} onChange={set("closes_at")} />
        </Field>
        <label className="adm-check adm-field--wide">
          <input type="checkbox" checked={f.is_sunday_off} onChange={set("is_sunday_off")} /> Closed on Sundays
        </label>

        <h3 className="adm-section-title">Where it is</h3>
        <Field label="Address" wide hint="Riders are sent here to collect">
          <textarea className="textarea" rows={2} value={f.address ?? ""} onChange={set("address")} />
        </Field>
        <Field label="Area">
          <input className="input" value={f.area ?? ""} onChange={set("area")} />
        </Field>
        <Field label="PIN code">
          <input className="input" inputMode="numeric" value={f.pin_code ?? ""} onChange={set("pin_code")} />
        </Field>
        <Field label="Latitude" error={errors.latitude} hint="From Google Maps; gives riders a map pin">
          <input className="input" inputMode="decimal" value={f.latitude} onChange={set("latitude")} />
        </Field>
        <Field label="Longitude" error={errors.longitude}>
          <input className="input" inputMode="decimal" value={f.longitude} onChange={set("longitude")} />
        </Field>

        <h3 className="adm-section-title">Registration</h3>
        <Field label="FSSAI licence">
          <input className="input" value={f.fssai_license ?? ""} onChange={set("fssai_license")} />
        </Field>
        <Field label="GST number">
          <input className="input" value={f.gst_number ?? ""} onChange={set("gst_number")} />
        </Field>

        <label className="adm-check adm-field--wide">
          <input type="checkbox" checked={f.is_active} onChange={set("is_active")} /> Active — its dishes can be
          ordered
        </label>
      </form>
    </Drawer>
  );
}

export default function KitchensPage() {
  const { data, error, loading, reload, setData } = useLoad(listKitchens);
  const [editing, setEditing] = useState(null);
  const notify = useNotice();
  const kitchens = data ?? [];

  const toggle = async (k, on) => {
    try {
      const row = await saveKitchen({ id: k.id, is_active: on });
      setData(kitchens.map((x) => (x.id === k.id ? row : x)));
      notify(on ? `${k.place_name} is on — its dishes are back on the menu` : `${k.place_name} is off — its dishes are off the menu`);
    } catch (e) {
      notify(e.message, "error");
    }
  };

  return (
    <>
      <PageHead title="Kitchens" sub="Partner kitchens, where their orders go, and when they cook.">
        <button type="button" className="btn adm-btn-action" onClick={() => setEditing({})}>
          Add kitchen
        </button>
      </PageHead>

      <LoadState
        loading={loading && !data}
        error={error}
        onRetry={reload}
        empty={data && !kitchens.length}
        emptyText="No kitchens yet. Add the first one."
      />

      {kitchens.length > 0 && (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Kitchen</th>
                <th>WhatsApp</th>
                <th>Hours</th>
                <th>Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {kitchens.map((k) => (
                <tr key={k.id} className={k.is_active ? "" : "is-off"}>
                  <td className="adm-cell-main">
                    <strong>{k.place_name}</strong>
                    <small>{[k.owner_name, k.area].filter(Boolean).join(" · ") || "—"}</small>
                  </td>
                  <td data-label="WhatsApp" className="adm-mono">
                    {k.whatsapp_number}
                  </td>
                  <td data-label="Hours">
                    {hours(k)}
                    {k.is_sunday_off && (
                      <>
                        {" "}
                        <Badge tone="gold">Sun off</Badge>
                      </>
                    )}
                  </td>
                  <td data-label="Active">
                    <Switch checked={k.is_active} label={`${k.place_name} active`} onChange={(on) => toggle(k, on)} />
                  </td>
                  <td className="actions">
                    <button type="button" className="btn btn-ghost adm-btn-sm" onClick={() => setEditing(k)}>
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
        <KitchenForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(row) => {
            setData(
              editing.id ? kitchens.map((x) => (x.id === row.id ? row : x)) : [...kitchens, row].sort((a, b) => a.place_name.localeCompare(b.place_name)),
            );
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
