import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteDish,
  deleteDishImage,
  listCategories,
  listDishes,
  listKitchens,
  listMealWindows,
  saveDish,
  setDishAvailable,
  uploadDishImage,
} from "../api";
import { kb, prepareDishPhoto } from "../image";
import { Badge, ConfirmButton, Drawer, Field, LoadState, PageHead, Switch } from "../ui";
import { blankToNull, fromPaise, timeIn, timeOut, toPaise, useLoad, useNotice } from "../helpers";
import { rupees } from "../../utils/format";
import "./menu.css";

/**
 * Every dish on the one menu guests see, and the kitchen that cooks it. The
 * kitchen is what splits an order into kitchen messages, so a dish cannot be
 * saved without one. The "On menu" switch saves the moment it is flipped:
 * a dish that has run out should vanish from guests' phones now, not after
 * someone finds the Save button.
 */

const EMPTY = {
  name: "",
  kitchen_id: "",
  category_id: "",
  price: "",
  description: "",
  ingredients: "",
  cooking_time_mins: "",
  /* Off until someone says otherwise: calling a dish with onion "Sattvic" to
     a pilgrim is worse than not saying it of one without. */
  is_sattvic: false,
  is_spicy: false,
  is_loved: false,
  meal_time: "all_day",
  meal_starts_at: "",
  meal_ends_at: "",
  sort_order: "0",
  is_available: true,
};

const NONE = [];

const loadAll = async () => {
  const [dishes, kitchens, categories, windows] = await Promise.all([
    listDishes(),
    listKitchens(),
    listCategories(),
    listMealWindows(),
  ]);
  return { dishes, kitchens, categories, windows };
};

const span = (a, b) => `${timeIn(a)} – ${timeIn(b)}`;

/** "All day", "Breakfast", or "Breakfast · 07:30 – 10:00" when the dish has its own hours. */
function mealLabel(d, windows) {
  const w = windows.find((x) => x.slot === d.meal_time);
  const label = w?.label ?? (d.meal_time === "all_day" ? "All day" : d.meal_time);
  return d.meal_starts_at && d.meal_ends_at ? `${label} · ${span(d.meal_starts_at, d.meal_ends_at)}` : label;
}

/* Rupees as typed: "149", "149.5", "₹1,249.50". More than two decimals would
   be a fraction of a paisa, so it is refused rather than rounded quietly. */
const cleanPrice = (v) => String(v ?? "").replace(/[₹,\s]/g, "");
const PRICE = /^\d+(\.\d{1,2})?$/;
const WHOLE = /^-?\d+$/;

function validate(f) {
  const e = {};
  if (f.name.trim().length < 2) e.name = "A name is required.";
  if (!f.kitchen_id) e.kitchen_id = "Choose the kitchen that cooks it.";
  if (!f.category_id) e.category_id = "Choose a category.";
  const price = cleanPrice(f.price);
  if (!PRICE.test(price) || toPaise(price) <= 0) e.price = "A price in rupees, e.g. 149 or 149.50";
  const mins = String(f.cooking_time_mins).trim();
  if (mins && (!/^\d+$/.test(mins) || Number(mins) < 1 || Number(mins) > 600))
    e.cooking_time_mins = "Whole minutes, e.g. 20";
  if (String(f.sort_order).trim() && !WHOLE.test(String(f.sort_order).trim()))
    e.sort_order = "A whole number, e.g. 10";
  if (f.meal_time !== "all_day" && Boolean(f.meal_starts_at) !== Boolean(f.meal_ends_at))
    e.meal_ends_at = "Give both start and end, or neither.";
  return e;
}

/** The fields of a dish as the database wants them, from the form. */
function toRow(f) {
  const own = f.meal_time !== "all_day" && f.meal_starts_at && f.meal_ends_at;
  return {
    name: f.name.trim(),
    kitchen_id: f.kitchen_id,
    category_id: f.category_id,
    price_paise: toPaise(cleanPrice(f.price)),
    description: blankToNull(f.description),
    ingredients: blankToNull(f.ingredients),
    cooking_time_mins: String(f.cooking_time_mins).trim() ? Number(f.cooking_time_mins) : null,
    is_sattvic: f.is_sattvic,
    is_spicy: f.is_spicy,
    is_loved: f.is_loved,
    meal_time: f.meal_time,
    /* The database refuses a window on an all-day dish, and half a window. */
    meal_starts_at: own ? timeOut(f.meal_starts_at) : null,
    meal_ends_at: own ? timeOut(f.meal_ends_at) : null,
    sort_order: String(f.sort_order).trim() ? Number(f.sort_order) : 0,
    is_available: f.is_available,
  };
}

/* Never let a failed clean-up of an old photo spoil a save that worked. */
const dropImage = (url) => {
  if (url) deleteDishImage(url).catch(() => {});
};

function DishPhoto({ shownUrl, photo, processing, error, onPick, onRemove, onUndo, removing }) {
  return (
    <div className="field adm-field adm-field--wide">
      <span className="field-label">Photo</span>
      <div className="adm-menu-photo">
        {shownUrl ? (
          <img className="adm-menu-photo__img" src={shownUrl} alt="" width={480} height={480} />
        ) : (
          <div className="adm-menu-photo__img adm-menu-photo__none">{processing ? "Preparing…" : "No photo"}</div>
        )}
        <div className="adm-menu-photo__side">
          {photo ? (
            <span className="adm-muted">
              {photo.width} × {photo.height} · {kb(photo.bytes)}
              <br />
              Ready — uploads when you save.
            </span>
          ) : removing ? (
            <span className="adm-muted">
              The photo will be removed when you save.{" "}
              <button type="button" className="adm-menu-link" onClick={onUndo}>
                Keep it
              </button>
            </span>
          ) : shownUrl ? (
            <span className="adm-muted">Current photo</span>
          ) : (
            <span className="adm-muted">Square, cropped from the middle. Made small on this device first.</span>
          )}
          <div className="adm-menu-photo__btns">
            {/* Two inputs: `capture` sends a phone straight to the camera, and
                some phones then offer no way back to the gallery. */}
            <label className="btn btn-ghost adm-btn-sm adm-menu-file adm-menu-file--camera">
              <input type="file" accept="image/*" capture="environment" onChange={onPick} disabled={processing} />
              Take photo
            </label>
            <label className="btn btn-ghost adm-btn-sm adm-menu-file">
              <input type="file" accept="image/*" onChange={onPick} disabled={processing} />
              {shownUrl ? "Replace photo" : "Choose photo"}
            </label>
            {shownUrl && (
              <button type="button" className="btn btn-ghost adm-btn-sm" onClick={onRemove} disabled={processing}>
                Remove
              </button>
            )}
          </div>
          {error && <span className="field-error">{error}</span>}
        </div>
      </div>
    </div>
  );
}

function DishForm({ initial, kitchens, categories, windows, onSaved, onDeleted, onClose }) {
  const [f, setF] = useState(() => ({
    ...EMPTY,
    ...(initial?.id
      ? {
          name: initial.name,
          kitchen_id: initial.kitchen_id,
          category_id: initial.category_id,
          price: fromPaise(initial.price_paise),
          description: initial.description ?? "",
          ingredients: initial.ingredients ?? "",
          cooking_time_mins: initial.cooking_time_mins ?? "",
          is_sattvic: initial.is_sattvic,
          is_spicy: initial.is_spicy,
          is_loved: initial.is_loved,
          meal_time: initial.meal_time ?? "all_day",
          meal_starts_at: timeIn(initial.meal_starts_at),
          meal_ends_at: timeIn(initial.meal_ends_at),
          sort_order: String(initial.sort_order ?? 0),
          is_available: initial.is_available,
        }
      : {}),
  }));
  /* Set once the row exists. A new dish whose photo upload fails is still
     saved; trying again must update that row, not insert a second one. */
  const [id, setId] = useState(initial?.id);
  const [savedUrl, setSavedUrl] = useState(initial?.image_url ?? null);
  const [photo, setPhoto] = useState(null); // { blob, url, width, height, bytes }
  const [removing, setRemoving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const notify = useNotice();
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  useEffect(() => () => photo && URL.revokeObjectURL(photo.url), [photo]);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    /* Cleared so choosing the same file again still fires a change. */
    e.target.value = "";
    if (!file) return;
    setPhotoError("");
    setProcessing(true);
    try {
      const out = await prepareDishPhoto(file);
      setPhoto({ ...out, url: URL.createObjectURL(out.blob) });
      setRemoving(false);
    } catch (err) {
      setPhotoError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const slot = windows.find((w) => w.slot === f.meal_time);
  const allDay = f.meal_time === "all_day";
  const dishName = f.name.trim() || initial?.name || "Dish";

  const submit = async (e) => {
    e.preventDefault();
    const errs = validate(f);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const fields = toRow(f);
    let rowId = id;
    let uploaded = null;
    try {
      let row;
      if (!rowId) {
        /* The photo's file name carries the dish id, so the row comes first. */
        row = await saveDish({ ...fields, image_url: null });
        rowId = row.id;
        setId(row.id);
        setSavedUrl(null);
        onSaved(row, false);
        if (photo) {
          uploaded = await uploadDishImage(rowId, photo.blob);
          row = await saveDish({ id: rowId, image_url: uploaded });
        }
      } else {
        if (photo) {
          uploaded = await uploadDishImage(rowId, photo.blob);
          fields.image_url = uploaded;
        } else if (removing) {
          fields.image_url = null;
        }
        row = await saveDish({ id: rowId, ...fields });
      }
      /* Only now is the old photo unused. */
      if ((photo || removing) && savedUrl && savedUrl !== row.image_url) dropImage(savedUrl);
      notify(initial?.id ? "Dish saved" : "Dish added");
      onSaved(row, true);
    } catch (err) {
      dropImage(uploaded);
      notify(rowId && !id ? `Dish added, but the photo did not save: ${err.message}` : err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      await deleteDish(id);
      dropImage(savedUrl);
      notify(`${dishName} deleted`);
      onDeleted(id);
    } catch (err) {
      notify(err.message, "error");
    }
  };

  const shownUrl = photo?.url ?? (removing ? null : savedUrl);

  return (
    <Drawer
      open
      title={initial?.id ? `Edit ${initial.name}` : "Add a dish"}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          {id && (
            <span className="adm-menu-foot-start">
              <ConfirmButton
                className="btn btn-ghost adm-menu-delete"
                confirm="Delete this dish?"
                onConfirm={remove}
                disabled={busy}
              >
                Delete
              </ConfirmButton>
            </span>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="dish-form" className="btn btn-primary" disabled={busy || processing}>
            {busy ? "Saving…" : "Save dish"}
          </button>
        </>
      }
    >
      <form id="dish-form" className="adm-form" onSubmit={submit} noValidate>
        <Field label="Dish name" required error={errors.name} wide>
          <input className="input" value={f.name} onChange={set("name")} />
        </Field>
        <Field label="Kitchen" required error={errors.kitchen_id} hint="Who cooks it. Their WhatsApp gets this dish's orders.">
          <select className="input" value={f.kitchen_id} onChange={set("kitchen_id")}>
            <option value="">Choose…</option>
            {kitchens.map((k) => (
              <option key={k.id} value={k.id}>
                {k.place_name}
                {k.is_active ? "" : " (off)"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category" required error={errors.category_id}>
          <select className="input" value={f.category_id} onChange={set("category_id")}>
            <option value="">Choose…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.is_active ? "" : " (hidden)"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Price (₹)" required error={errors.price}>
          <input className="input" inputMode="decimal" value={f.price} onChange={set("price")} />
        </Field>
        <Field label="Cooking time (mins)" error={errors.cooking_time_mins}>
          <input
            className="input"
            inputMode="numeric"
            value={f.cooking_time_mins}
            onChange={set("cooking_time_mins")}
          />
        </Field>
        <Field label="Description" wide hint="One or two lines guests read on the menu">
          <textarea className="textarea" rows={2} value={f.description} onChange={set("description")} />
        </Field>
        <Field label="Ingredients" wide>
          <textarea className="textarea" rows={2} value={f.ingredients} onChange={set("ingredients")} />
        </Field>
        <label className="adm-check adm-field--wide">
          <input type="checkbox" checked={f.is_sattvic} onChange={set("is_sattvic")} /> Sattvic (no onion, no garlic)
        </label>
        <label className="adm-check">
          <input type="checkbox" checked={f.is_spicy} onChange={set("is_spicy")} /> Spicy
        </label>
        <label className="adm-check">
          <input type="checkbox" checked={f.is_loved} onChange={set("is_loved")} /> Bestseller
        </label>

        <DishPhoto
          shownUrl={shownUrl}
          photo={photo}
          processing={processing}
          error={photoError}
          removing={removing && Boolean(savedUrl)}
          onPick={pick}
          onRemove={() => {
            setPhoto(null);
            setRemoving(true);
          }}
          onUndo={() => setRemoving(false)}
        />

        <h3 className="adm-section-title">When it is served</h3>
        <Field label="Meal time" wide>
          <select
            className="input"
            value={f.meal_time}
            onChange={(e) => {
              const v = e.target.value;
              /* An all-day dish cannot keep hours of its own. */
              setF((s) => ({ ...s, meal_time: v, ...(v === "all_day" ? { meal_starts_at: "", meal_ends_at: "" } : {}) }));
            }}
          >
            {windows.map((w) => (
              <option key={w.slot} value={w.slot}>
                {w.label}
                {w.starts_at && w.ends_at ? ` (${span(w.starts_at, w.ends_at)})` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Own start"
          hint={
            allDay
              ? "All-day dishes follow the kitchen's hours"
              : slot?.starts_at
                ? `Empty uses ${slot.label}: ${span(slot.starts_at, slot.ends_at)}`
                : "Empty uses the kitchen's hours"
          }
        >
          <input
            className="input"
            type="time"
            value={f.meal_starts_at}
            onChange={set("meal_starts_at")}
            disabled={allDay}
          />
        </Field>
        <Field label="Own end" error={errors.meal_ends_at} hint="May be after midnight">
          <input className="input" type="time" value={f.meal_ends_at} onChange={set("meal_ends_at")} disabled={allDay} />
        </Field>

        <h3 className="adm-section-title">On the menu</h3>
        <Field label="Sort order" error={errors.sort_order} hint="Lower comes first within its category">
          <input className="input" inputMode="numeric" value={f.sort_order} onChange={set("sort_order")} />
        </Field>
        <label className="adm-check">
          <input type="checkbox" checked={f.is_available} onChange={set("is_available")} /> On the menu
        </label>
      </form>
    </Drawer>
  );
}

export default function MenuPage() {
  const { data, error, loading, reload, setData } = useLoad(loadAll);
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState("");
  const [kitchen, setKitchen] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const notify = useNotice();

  /* Saves can finish out of order (two switches flipped quickly); each one
     patches whatever is on screen by then, not the list it started from. */
  const latest = useRef(data);
  useEffect(() => {
    latest.current = data;
  }, [data]);
  const setDishes = (fn) => {
    const next = { ...latest.current, dishes: fn(latest.current.dishes) };
    latest.current = next;
    setData(next);
  };

  const dishes = data?.dishes ?? NONE;
  const kitchens = data?.kitchens ?? NONE;
  const categories = data?.categories ?? NONE;
  const windows = data?.windows ?? NONE;
  const categoryOn = useMemo(() => new Map(categories.map((c) => [c.id, c.is_active])), [categories]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return dishes.filter(
      (d) =>
        (!needle || d.name.toLowerCase().includes(needle)) &&
        (!kitchen || d.kitchen_id === kitchen) &&
        (!category || d.category_id === category) &&
        (!status || d.is_available === (status === "on")),
    );
  }, [dishes, q, kitchen, category, status]);

  const onCount = dishes.filter((d) => d.is_available).length;
  const filtered = shown.length !== dishes.length;

  const toggle = async (d, on) => {
    try {
      await setDishAvailable(d.id, on);
      setDishes((list) => list.map((x) => (x.id === d.id ? { ...x, is_available: on } : x)));
      notify(on ? `${d.name} is back on the menu` : `${d.name} is off the menu`);
    } catch (e) {
      notify(e.message, "error");
    }
  };

  const byName = (a, b) => a.name.localeCompare(b.name);
  /* Stable, so the drawer does not refocus its first field on every save. */
  const close = useCallback(() => setEditing(null), []);

  return (
    <>
      <PageHead
        title="Menu"
        sub="Every dish guests can order, and the kitchen that cooks it. Switching a dish off takes it off every open menu within seconds."
      >
        <button type="button" className="btn adm-btn-action" onClick={() => setEditing({})} disabled={!data}>
          Add dish
        </button>
      </PageHead>

      <LoadState
        loading={loading && !data}
        error={error}
        onRetry={reload}
        empty={data && !dishes.length}
        emptyText="No dishes yet. Add the first one."
      />

      {dishes.length > 0 && (
        <>
          <div className="adm-toolbar">
            <input
              className="input"
              type="search"
              placeholder="Search dishes"
              aria-label="Search dishes"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select className="input" aria-label="Kitchen" value={kitchen} onChange={(e) => setKitchen(e.target.value)}>
              <option value="">All kitchens</option>
              {kitchens.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.place_name}
                </option>
              ))}
            </select>
            <select
              className="input"
              aria-label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select className="input" aria-label="On or off the menu" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">On and off</option>
              <option value="on">On the menu</option>
              <option value="off">Off the menu</option>
            </select>
          </div>
          <p className="adm-muted adm-menu-count">
            {filtered ? `Showing ${shown.length} of ` : ""}
            {dishes.length} {dishes.length === 1 ? "dish" : "dishes"} · {onCount} on the menu
          </p>
        </>
      )}

      {dishes.length > 0 && !shown.length && <div className="adm-state">No dishes match.</div>}

      {shown.length > 0 && (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Dish</th>
                <th>Kitchen</th>
                <th>Category</th>
                <th className="num">Price</th>
                <th>Meal time</th>
                <th>On menu</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => (
                <tr key={d.id} className={d.is_available ? "" : "is-off"}>
                  <td className="adm-cell-main">
                    <div className="adm-row">
                      {d.image_url ? (
                        <img className="adm-thumb" src={d.image_url} alt="" loading="lazy" width={48} height={48} />
                      ) : (
                        <span className="adm-thumb adm-menu-thumb-none" aria-hidden="true" />
                      )}
                      <span className="adm-menu-name">
                        <strong>{d.name}</strong>
                        <small>
                          {[d.is_sattvic && "Sattvic", d.is_spicy && "Spicy", d.is_loved && "Bestseller"]
                            .filter(Boolean)
                            .join(" · ") || " "}
                        </small>
                      </span>
                    </div>
                  </td>
                  <td data-label="Kitchen">
                    <span className="adm-menu-cell">
                      {d.kitchen?.place_name ?? "—"}
                      {d.kitchen && !d.kitchen.is_active && <Badge tone="bad">Kitchen off</Badge>}
                    </span>
                  </td>
                  <td data-label="Category">
                    <span className="adm-menu-cell">
                      {d.category?.name ?? "—"}
                      {categoryOn.get(d.category_id) === false && <Badge tone="bad">Hidden</Badge>}
                    </span>
                  </td>
                  <td data-label="Price" className="num">
                    {rupees(d.price_paise)}
                  </td>
                  <td data-label="Meal time">{mealLabel(d, windows)}</td>
                  <td data-label="On menu">
                    <Switch checked={d.is_available} label={`${d.name} on the menu`} onChange={(on) => toggle(d, on)} />
                  </td>
                  <td className="actions">
                    <button type="button" className="btn btn-ghost adm-btn-sm adm-menu-tap" onClick={() => setEditing(d)}>
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
        <DishForm
          initial={editing}
          kitchens={kitchens}
          categories={categories}
          windows={windows}
          onClose={close}
          onSaved={(row, done) => {
            setDishes((list) =>
              list.some((x) => x.id === row.id) ? list.map((x) => (x.id === row.id ? row : x)) : [...list, row].sort(byName),
            );
            if (done) setEditing(null);
          }}
          onDeleted={(id) => {
            setDishes((list) => list.filter((x) => x.id !== id));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
