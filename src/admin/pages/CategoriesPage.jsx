import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteCategory, listCategories, listDishes, saveCategory } from "../api";
import { ConfirmButton, Drawer, Field, LoadState, PageHead, Switch } from "../ui";
import { useLoad, useNotice } from "../helpers";
import "./menu.css";

/**
 * The headings the guest menu is grouped under. The menu shows them in sort
 * order; switching one off hides it and every dish in it, without touching
 * the dishes themselves. A category with dishes in it cannot be deleted --
 * the dishes need somewhere to be.
 */

const EMPTY = { name: "", slug: "", sort_order: "0", is_active: true };
const NONE = [];

/** "South Indian & Dosa" -> "south-indian-dosa" */
const slugify = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const SLUG = /^[a-z0-9-]+$/;

const loadAll = async () => {
  const [categories, dishes] = await Promise.all([listCategories(), listDishes()]);
  return { categories, dishes };
};

const bySort = (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name);

function validate(f) {
  const e = {};
  if (f.name.trim().length < 2) e.name = "A name is required.";
  if (!SLUG.test(f.slug.trim())) e.slug = "Only a–z, 0–9 and hyphens, e.g. south-indian";
  if (!/^-?\d+$/.test(String(f.sort_order).trim())) e.sort_order = "A whole number, e.g. 10";
  return e;
}

function CategoryForm({ initial, dishCount, onSaved, onDeleted, onClose }) {
  const [f, setF] = useState(() => ({
    ...EMPTY,
    ...(initial?.id
      ? { name: initial.name, slug: initial.slug, sort_order: String(initial.sort_order ?? 0), is_active: initial.is_active }
      : {}),
  }));
  /* A new category's slug follows its name until someone edits the slug. An
     existing one keeps its slug unless changed by hand. */
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.id));
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
      const row = await saveCategory({
        id: initial?.id,
        name: f.name.trim(),
        slug: f.slug.trim(),
        sort_order: Number(f.sort_order),
        is_active: f.is_active,
      });
      notify(initial?.id ? "Category saved" : "Category added");
      onSaved(row);
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      await deleteCategory(initial.id);
      notify(`${initial.name} deleted`);
      onDeleted(initial.id);
    } catch (err) {
      notify(err.message, "error");
    }
  };

  return (
    <Drawer
      open
      title={initial?.id ? `Edit ${initial.name}` : "Add a category"}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          {initial?.id && dishCount === 0 && (
            <span className="adm-menu-foot-start">
              <ConfirmButton
                className="btn btn-ghost adm-menu-delete"
                confirm="Delete this category?"
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
          <button type="submit" form="category-form" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save category"}
          </button>
        </>
      }
    >
      <form id="category-form" className="adm-form" onSubmit={submit} noValidate>
        <Field label="Name" required error={errors.name} hint="As guests see it on the menu" wide>
          <input
            className="input"
            value={f.name}
            onChange={(e) => {
              const name = e.target.value;
              setF((s) => ({ ...s, name, ...(slugTouched ? {} : { slug: slugify(name) }) }));
            }}
          />
        </Field>
        <Field label="Slug" error={errors.slug} hint="Short name used in links. Made from the name.">
          <input
            className="input adm-mono"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={f.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set("slug")(e);
            }}
          />
        </Field>
        <Field label="Sort order" error={errors.sort_order} hint="Lower comes first on the menu">
          <input className="input" inputMode="numeric" value={f.sort_order} onChange={set("sort_order")} />
        </Field>
        <label className="adm-check adm-field--wide">
          <input type="checkbox" checked={f.is_active} onChange={set("is_active")} /> Shown on the menu
        </label>
        {initial?.id && dishCount > 0 && (
          <p className="adm-muted adm-field--wide">
            {dishCount} {dishCount === 1 ? "dish is" : "dishes are"} in this category, so it cannot be deleted. Switch it
            off to hide it.
          </p>
        )}
      </form>
    </Drawer>
  );
}

export default function CategoriesPage() {
  const { data, error, loading, reload, setData } = useLoad(loadAll);
  const [editing, setEditing] = useState(null);
  const notify = useNotice();

  /* Saves can finish out of order; each patches what is on screen by then. */
  const latest = useRef(data);
  useEffect(() => {
    latest.current = data;
  }, [data]);
  const setCategories = (fn) => {
    const next = { ...latest.current, categories: fn(latest.current.categories) };
    latest.current = next;
    setData(next);
  };

  const categories = data?.categories ?? NONE;
  const dishes = data?.dishes ?? NONE;
  const counts = useMemo(() => {
    const m = new Map();
    for (const d of dishes) m.set(d.category_id, (m.get(d.category_id) ?? 0) + 1);
    return m;
  }, [dishes]);

  const toggle = async (c, on) => {
    try {
      const row = await saveCategory({ id: c.id, is_active: on });
      setCategories((list) => list.map((x) => (x.id === c.id ? row : x)));
      notify(on ? `${c.name} is back on the menu` : `${c.name} is hidden, with its dishes`);
    } catch (e) {
      notify(e.message, "error");
    }
  };

  /* Stable, so the drawer does not refocus its first field on every render. */
  const close = useCallback(() => setEditing(null), []);

  return (
    <>
      <PageHead
        title="Categories"
        sub="The menu shows categories in sort order, lowest first. Switching one off hides it and all its dishes from guests."
      >
        <button type="button" className="btn adm-btn-action" onClick={() => setEditing({})} disabled={!data}>
          Add category
        </button>
      </PageHead>

      <LoadState
        loading={loading && !data}
        error={error}
        onRetry={reload}
        empty={data && !categories.length}
        emptyText="No categories yet. Add the first one."
      />

      {categories.length > 0 && (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Category</th>
                <th className="num">Order</th>
                <th className="num">Dishes</th>
                <th>Shown</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className={c.is_active ? "" : "is-off"}>
                  <td className="adm-cell-main">
                    <strong>{c.name}</strong>
                    <small className="adm-mono">{c.slug}</small>
                  </td>
                  <td data-label="Order" className="num">
                    {c.sort_order}
                  </td>
                  <td data-label="Dishes" className="num">
                    {counts.get(c.id) ?? 0}
                  </td>
                  <td data-label="Shown">
                    <Switch checked={c.is_active} label={`${c.name} shown`} onChange={(on) => toggle(c, on)} />
                  </td>
                  <td className="actions">
                    <button type="button" className="btn btn-ghost adm-btn-sm adm-menu-tap" onClick={() => setEditing(c)}>
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
        <CategoryForm
          initial={editing}
          dishCount={editing.id ? (counts.get(editing.id) ?? 0) : 0}
          onClose={close}
          onSaved={(row) => {
            setCategories((list) =>
              (list.some((x) => x.id === row.id) ? list.map((x) => (x.id === row.id ? row : x)) : [...list, row]).sort(bySort),
            );
            setEditing(null);
          }}
          onDeleted={(id) => {
            setCategories((list) => list.filter((x) => x.id !== id));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
