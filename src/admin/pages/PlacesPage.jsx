import { useCallback, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { addRooms, isMobile, listPlaces, savePlace, saveRoom, tenDigits } from "../api";
import { Drawer, Field, LoadState, PageHead, Switch } from "../ui";
import { blankToNull, useLoad, useNotice } from "../helpers";
import { STICKER_FONTS_LINK, STICKER_H, STICKER_SHEET_CSS, STICKER_W, stickerFontCss, stickerSvg } from "../../utils/sticker";
import "./places.css";

/**
 * Rest houses and their rooms. A room's code is the opaque id its QR sticker
 * carries: the database makes it, nobody types it, and it never changes -- so
 * renaming a room or editing its house never breaks a sticker already on a
 * wall. Switching a house off switches all its rooms off with it (a trigger
 * does that); switching it back on leaves the rooms off until someone says so.
 */

const EMPTY = {
  name: "",
  address: "",
  area: "",
  pin_code: "",
  city: "Vrindavan",
  latitude: "",
  longitude: "",
  whatsapp_number: "",
  is_active: true,
};

const MAX_ADD = 200;
const MAX_ROOM_LEN = 20;

const byRoom = (a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true, sensitivity: "base" });
const byName = (a, b) => a.name.localeCompare(b.name);
const norm = (n) => String(n).trim().toLowerCase();

/* Always the public site, whichever address the admin happens to be using:
   a sticker printed from a laptop or a preview build must still send guests to
   the real menu. Same default as scripts/generate-qr.mjs, so stickers printed
   either way are identical. */
const SITE = (import.meta.env.VITE_SITE_URL || "https://www.inroomdining.in").replace(/\/$/, "");

// --------------------------------------------------------------- room lists
/**
 * "G1, G2, 201-205" -> ["G1", "G2", "201", …, "205"]. A range needs digits on
 * both ends and the same letters in front ("G1-G9"); a dash without digits on
 * both sides ("B-12") is taken as a room number as written. Leading zeros carry through
 * ("01-10" gives "01" … "10").
 */
function parseRooms(text) {
  const out = [];
  const seen = new Set();
  const errors = [];
  const push = (n) => {
    if (n.length > MAX_ROOM_LEN) {
      errors.push(`"${n}" is too long for a room number.`);
      return;
    }
    if (!seen.has(norm(n))) {
      seen.add(norm(n));
      out.push(n);
    }
  };

  const tokens = text.replace(/\s*-\s*/g, "-").split(/[\s,;]+/).filter(Boolean);
  for (const t of tokens) {
    const m = t.match(/^([A-Za-z]*)(\d+)-([A-Za-z]*)(\d+)$/);
    if (!m) {
      push(t);
      continue;
    }
    if (m[1].toLowerCase() !== m[3].toLowerCase()) {
      errors.push(`"${t}" has different letters at each end; write it as two ranges.`);
      continue;
    }
    const [, prefix, from, , to] = m;
    const a = Number(from);
    const b = Number(to);
    if (b < a) {
      errors.push(`"${t}" runs backwards.`);
      continue;
    }
    if (b - a + 1 > MAX_ADD) {
      errors.push(`"${t}" is more than ${MAX_ADD} rooms.`);
      continue;
    }
    const width = from.startsWith("0") ? from.length : 0;
    for (let i = a; i <= b; i++) push(prefix + String(i).padStart(width, "0"));
  }
  return { numbers: out, errors };
}

function preview(list, max = 8) {
  return list.length <= max ? list.join(", ") : `${list.slice(0, max).join(", ")} … ${list[list.length - 1]}`;
}

// ----------------------------------------------------------------- stickers
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const roomUrl = (id) => `${SITE}/menu?id=${encodeURIComponent(id)}`;

/* Same settings as scripts/generate-qr.mjs: 'M' survives a scuffed sticker. */
async function roomSticker(place, room, opts = {}) {
  const QRCode = (await import("qrcode")).default;
  const modules = QRCode.create(roomUrl(room.id), { errorCorrectionLevel: "M" }).modules;
  return stickerSvg({ house: place.name, room: room.room_number, code: room.id, modules, ...opts });
}

/* Four stickers to an A4 page, each 88 x 132 mm. The same sheet
   scripts/generate-qr.mjs writes, so stickers look the same either way. */
async function stickerSheet(place, rooms) {
  const cards = [];
  for (const r of rooms) cards.push(`<div class="card">${await roomSticker(place, r, { width: "100%", height: "100%" })}</div>`);
  return `<!doctype html><html><head><meta charset="utf-8"><title>QR stickers — ${escapeHtml(place.name)}</title>
<link rel="stylesheet" href="${STICKER_FONTS_LINK}">
<style>${STICKER_SHEET_CSS}</style></head><body>
${cards.join("\n")}
<script>window.addEventListener("load", function () {
  document.fonts.ready.then(function () { window.focus(); window.print(); });
});</script>
</body></html>`;
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const fileName = (room, ext) => `${room.id}-room-${room.room_number.replace(/\W+/g, "")}.${ext}`;

/* The sticker with its fonts inside it, so it prints the same from any
   machine or print shop. */
async function stickerWithFonts(place, room) {
  const fontCss = await stickerFontCss(place.name + room.room_number + room.id);
  return roomSticker(place, room, { fontCss });
}

async function downloadSvg(place, room) {
  const svg = await stickerWithFonts(place, room);
  saveBlob(new Blob([svg], { type: "image/svg+xml" }), fileName(room, "svg"));
}

/* The same sticker as one print-ready PNG: 1600 x 2400 px, about
   13.5 x 20 cm at 300 dpi. The whole card rather than the bare QR, because the
   house name and room on it are what stop a sticker going on the wrong door. */
const PNG_W = 1600;
const PNG_H = (PNG_W * STICKER_H) / STICKER_W;

async function downloadPng(place, room) {
  const svg = await stickerWithFonts(place, room);
  const src = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = PNG_W;
    canvas.height = PNG_H;
    canvas.getContext("2d").drawImage(img, 0, 0, PNG_W, PNG_H);
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("This browser could not make the image."))), "image/png"),
    );
    saveBlob(blob, fileName(room, "png"));
  } finally {
    URL.revokeObjectURL(src);
  }
}

/* Not in api.js: one update for every room of a house that is still off. */
async function switchAllRoomsOn(placeId) {
  const { data, error } = await supabase
    .from("addresses")
    .update({ is_active: true })
    .eq("place_id", placeId)
    .eq("is_active", false)
    .select("id, room_number, is_active, created_at");
  if (error) throw new Error(error.message);
  return data;
}

// --------------------------------------------------------------- place form
function validate(f) {
  const e = {};
  if (f.name.trim().length < 2) e.name = "A name is required.";
  if (f.address.trim().length < 5) e.address = "The full address is required; guests see it.";
  if (f.pin_code.trim() && !/^\d{6}$/.test(f.pin_code.trim())) e.pin_code = "Six digits, e.g. 281121";
  if (f.whatsapp_number.trim() && !isMobile(f.whatsapp_number)) e.whatsapp_number = "A 10-digit Indian mobile number.";
  const range = { latitude: 90, longitude: 180 };
  for (const k of ["latitude", "longitude"]) {
    const v = String(f[k]).trim();
    if (v !== "" && !(Number.isFinite(Number(v)) && Math.abs(Number(v)) <= range[k])) e[k] = "A number, e.g. 27.5723";
  }
  if ((String(f.latitude).trim() === "") !== (String(f.longitude).trim() === ""))
    e.longitude = "Give both latitude and longitude, or neither.";
  return e;
}

function PlaceForm({ initial, onSaved, onClose }) {
  const [f, setF] = useState(() => ({
    ...EMPTY,
    ...initial,
    area: initial?.area ?? "",
    pin_code: initial?.pin_code ?? "",
    whatsapp_number: initial?.whatsapp_number ?? "",
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
      const lat = String(f.latitude).trim();
      const lng = String(f.longitude).trim();
      const row = await savePlace({
        id: initial?.id,
        name: f.name.trim(),
        address: f.address.trim(),
        area: blankToNull(f.area),
        pin_code: blankToNull(f.pin_code),
        city: blankToNull(f.city) ?? "Vrindavan",
        latitude: lat === "" ? null : Number(lat),
        longitude: lng === "" ? null : Number(lng),
        whatsapp_number: f.whatsapp_number.trim() ? tenDigits(f.whatsapp_number) : null,
        is_active: f.is_active,
      });
      notify(initial?.id ? "Accommodation partner saved" : "Accommodation partner added — now add its rooms");
      onSaved(row, initial?.id && initial.is_active !== f.is_active);
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open
      title={initial?.id ? `Edit ${initial.name}` : "Add an accommodation partner"}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="place-form" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save accommodation partner"}
          </button>
        </>
      }
    >
      <form id="place-form" className="adm-form" onSubmit={submit} noValidate>
        <Field label="Accommodation Partner name" required error={errors.name} wide hint="Guests see this at the top of the menu">
          <input className="input" value={f.name} onChange={set("name")} />
        </Field>
        <Field label="Address" required error={errors.address} wide hint="Shown to guests and sent to riders">
          <textarea className="textarea" rows={2} value={f.address} onChange={set("address")} />
        </Field>
        <Field label="Area">
          <input className="input" value={f.area} onChange={set("area")} />
        </Field>
        <Field label="PIN code" error={errors.pin_code}>
          <input className="input" inputMode="numeric" value={f.pin_code} onChange={set("pin_code")} />
        </Field>
        <Field label="City">
          <input className="input" value={f.city ?? ""} onChange={set("city")} />
        </Field>
        <Field
          label="WhatsApp number"
          error={errors.whatsapp_number}
          hint="The accommodation partner is told here about every order from one of its rooms"
        >
          <input className="input" inputMode="tel" value={f.whatsapp_number} onChange={set("whatsapp_number")} />
        </Field>
        <Field label="Latitude" error={errors.latitude} hint="From Google Maps; gives riders a map pin">
          <input className="input" inputMode="decimal" value={f.latitude} onChange={set("latitude")} />
        </Field>
        <Field label="Longitude" error={errors.longitude}>
          <input className="input" inputMode="decimal" value={f.longitude} onChange={set("longitude")} />
        </Field>

        <label className="adm-check adm-field--wide">
          <input type="checkbox" checked={f.is_active} onChange={set("is_active")} /> Active — guests in its rooms can
          order
        </label>
        {initial?.id && initial.is_active && !f.is_active && (
          <p className="adm-places-warn adm-field--wide">
            Switching it off switches every room off too, and their QR codes stop working until you switch them back on.
          </p>
        )}
      </form>
    </Drawer>
  );
}

// ------------------------------------------------------------------- rooms
function AddRooms({ place, rooms, onAdded, onBusy }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const notify = useNotice();

  const plan = useMemo(() => {
    const { numbers, errors } = parseRooms(text);
    const have = new Set(rooms.map((r) => norm(r.room_number)));
    return {
      errors,
      add: numbers.filter((n) => !have.has(norm(n))),
      skip: numbers.filter((n) => have.has(norm(n))),
    };
  }, [text, rooms]);

  const tooMany = plan.add.length > MAX_ADD;
  const canAdd = plan.add.length > 0 && !tooMany && !plan.errors.length && !busy;

  const submit = async (e) => {
    e.preventDefault();
    if (!canAdd) return;
    setBusy(true);
    onBusy(true);
    try {
      const added = await addRooms(place.id, plan.add);
      onAdded(added);
      setText("");
      notify(`Added ${added.length} room${added.length === 1 ? "" : "s"} to ${place.name}`);
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };

  return (
    <form className="adm-places-add" onSubmit={submit} noValidate>
      <Field
        label="Add rooms"
        wide
        hint={`Ranges and single rooms, e.g. "101-110" or "G1, G2, 201-205". Up to ${MAX_ADD} at a time.`}
      >
        <textarea
          className="textarea adm-places-add__box"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoCapitalize="characters"
          spellCheck={false}
        />
      </Field>

      {text.trim() !== "" && (
        <div className="adm-places-plan" aria-live="polite">
          {plan.errors.map((m) => (
            <p key={m} className="field-error">
              {m}
            </p>
          ))}
          {tooMany && <p className="field-error">That is {plan.add.length} rooms; add at most {MAX_ADD} at a time.</p>}
          {plan.add.length > 0 && !tooMany && (
            <p>
              <strong>
                {plan.add.length} new room{plan.add.length === 1 ? "" : "s"}:
              </strong>{" "}
              {preview(plan.add)}
            </p>
          )}
          {plan.skip.length > 0 && (
            <p className="adm-muted">
              Skipping {plan.skip.length} that already exist{plan.skip.length === 1 ? "s" : ""}: {preview(plan.skip)}
            </p>
          )}
          {!plan.add.length && !plan.errors.length && <p className="adm-muted">Nothing new to add.</p>}
        </div>
      )}

      <button type="submit" className="btn adm-btn-action" disabled={!canAdd}>
        {busy ? "Adding…" : plan.add.length && !tooMany ? `Add ${plan.add.length} room${plan.add.length === 1 ? "" : "s"}` : "Add rooms"}
      </button>
    </form>
  );
}

function RoomRow({ place, room, rooms, placeOn, selected, onSelect, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(room.room_number);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const notify = useNotice();

  const toggle = async (on) => {
    try {
      onSaved(await saveRoom({ id: room.id, is_active: on }));
      notify(on ? `Room ${room.room_number} is on` : `Room ${room.room_number} is off — its QR code stops working`);
    } catch (e) {
      notify(e.message, "error");
    }
  };

  const rename = async (e) => {
    e.preventDefault();
    const next = value.trim();
    if (!next) return setError("A room number is required.");
    if (next.length > MAX_ROOM_LEN) return setError("Too long for a room number.");
    if (rooms.some((r) => r.id !== room.id && norm(r.room_number) === norm(next)))
      return setError("Another room already has that number.");
    if (next === room.room_number) return setEditing(false);
    setBusy(true);
    try {
      onSaved(await saveRoom({ id: room.id, room_number: next }));
      notify(`Renamed to room ${next}. Its code is unchanged; reprint the sticker so the label matches.`);
      setEditing(false);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (editing)
    return (
      <li className="adm-places-room is-editing">
        <form className="adm-places-rename" onSubmit={rename} noValidate>
          <label className="field">
            <span className="field-label">Room number</span>
            <input
              className="input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={busy}
              autoFocus
            />
            {error ? (
              <span className="field-error">{error}</span>
            ) : (
              <span className="field-hint">
                Code <span className="adm-mono">{room.id}</span> stays the same.
              </span>
            )}
          </label>
          <div className="adm-places-rename__actions">
            <button type="submit" className="btn btn-primary adm-btn-sm" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="btn btn-ghost adm-btn-sm"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setValue(room.room_number);
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </li>
    );

  return (
    <li className={`adm-places-room ${room.is_active ? "" : "is-off"}`}>
      <label className="adm-places-room__pick">
        <input
          type="checkbox"
          checked={selected}
          disabled={!room.is_active}
          onChange={(e) => onSelect(room.id, e.target.checked)}
        />
        <span>
          <strong>Room {room.room_number}</strong>
          <small className="adm-mono">{room.id}</small>
        </span>
      </label>
      <div className="adm-places-room__tools">
        <Switch
          checked={room.is_active}
          disabled={!placeOn}
          label={`Room ${room.room_number} active`}
          onChange={toggle}
          size="sm"
        />
        <button type="button" className="btn btn-ghost adm-btn-sm" onClick={() => setEditing(true)}>
          Rename
        </button>
        <button
          type="button"
          className="btn btn-ghost adm-btn-sm"
          disabled={!room.is_active}
          title={room.is_active ? "Download this room's sticker as a print-ready SVG" : "Switch the room on first"}
          onClick={() => downloadSvg(place, room).catch((e) => notify(`Could not make the sticker: ${e.message}`, "error"))}
        >
          SVG
        </button>
        <button
          type="button"
          className="btn btn-ghost adm-btn-sm"
          disabled={!room.is_active}
          title={room.is_active ? "Download this room's sticker as a print-quality PNG" : "Switch the room on first"}
          onClick={() =>
            downloadPng(place, room).catch((e) => notify(`Could not make the sticker: ${e.message}`, "error"))
          }
        >
          PNG
        </button>
      </div>
    </li>
  );
}

function RoomsDrawer({ place, onRooms, onClose }) {
  const rooms = useMemo(() => [...(place.rooms ?? [])].sort(byRoom), [place.rooms]);
  const [picked, setPicked] = useState(() => new Set());
  const [adding, setAdding] = useState(rooms.length === 0);
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const notify = useNotice();

  // Only rooms that are on can be printed: an off room's sticker leads nowhere.
  const live = rooms.filter((r) => r.is_active);
  const chosen = live.filter((r) => picked.has(r.id));
  const allChosen = live.length > 0 && chosen.length === live.length;
  const offCount = rooms.length - live.length;

  const select = (id, on) =>
    setPicked((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const replace = (row) => onRooms(rooms.map((r) => (r.id === row.id ? row : r)));

  const print = async () => {
    // Opened before any await, or the browser treats it as an unasked pop-up.
    const w = window.open("", "_blank");
    if (!w) {
      notify("The browser blocked the sticker window. Allow pop-ups for this site and try again.", "error");
      return;
    }
    w.document.write("<!doctype html><title>QR stickers</title><p style=\"font-family:sans-serif\">Preparing stickers…</p>");
    setPrinting(true);
    try {
      const html = await stickerSheet(place, chosen);
      w.document.open();
      w.document.write(html);
      w.document.close();
    } catch (e) {
      w.close();
      notify(`Could not make the stickers: ${e.message}`, "error");
    } finally {
      setPrinting(false);
    }
  };

  const allOn = async () => {
    setBusy(true);
    try {
      const rows = await switchAllRoomsOn(place.id);
      const byId = new Map(rows.map((r) => [r.id, r]));
      onRooms(rooms.map((r) => byId.get(r.id) ?? r));
      notify(`Switched ${rows.length} room${rows.length === 1 ? "" : "s"} on`);
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open
      title={`Rooms — ${place.name}`}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button type="button" className="btn btn-primary" onClick={print} disabled={!chosen.length || printing}>
            {printing
              ? "Preparing…"
              : chosen.length
                ? `Print ${chosen.length} QR sticker${chosen.length === 1 ? "" : "s"}`
                : "Print QR stickers"}
          </button>
        </>
      }
    >
      <div className="adm-places-rooms">
        <p className="adm-muted">
          Each room has its own code, printed in its QR sticker. The code never changes, so stickers already on walls
          keep working when you rename a room or edit the accommodation partner.
        </p>

        {!place.is_active && (
          <p className="adm-places-warn">
            This accommodation partner is off, so none of its QR codes work. Switch it on from the list first.
          </p>
        )}

        {adding ? (
          <AddRooms
            place={place}
            rooms={rooms}
            onBusy={setBusy}
            onAdded={(added) => {
              onRooms([...rooms, ...added]);
              setPicked((s) => new Set([...s, ...added.map((r) => r.id)]));
            }}
          />
        ) : (
          <button type="button" className="btn adm-btn-action adm-places-open-add" onClick={() => setAdding(true)}>
            Add rooms
          </button>
        )}

        {rooms.length > 0 && (
          <>
            <div className="adm-places-rooms__bar">
              <label className="adm-check">
                <input
                  type="checkbox"
                  checked={allChosen}
                  disabled={!live.length}
                  onChange={(e) => setPicked(e.target.checked ? new Set(live.map((r) => r.id)) : new Set())}
                />{" "}
                Select all ({live.length} on)
              </label>
              {place.is_active && offCount > 0 && (
                <button type="button" className="btn btn-ghost adm-btn-sm" onClick={allOn} disabled={busy}>
                  Switch {offCount} off room{offCount === 1 ? "" : "s"} on
                </button>
              )}
            </div>
            <ul className="adm-places-list">
              {rooms.map((r) => (
                <RoomRow
                  key={r.id}
                  place={place}
                  room={r}
                  rooms={rooms}
                  placeOn={place.is_active}
                  selected={r.is_active && picked.has(r.id)}
                  onSelect={select}
                  onSaved={replace}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </Drawer>
  );
}

// -------------------------------------------------------------------- page
export default function PlacesPage() {
  const { data, error, loading, reload, setData } = useLoad(listPlaces);
  const [editing, setEditing] = useState(null);
  const [roomsOf, setRoomsOf] = useState(null);
  const notify = useNotice();
  const places = data ?? [];
  const roomsPlace = roomsOf && places.find((p) => p.id === roomsOf);

  // Stable, so the drawers do not re-run their open effect on every list change.
  const closeEdit = useCallback(() => setEditing(null), []);
  const closeRooms = useCallback(() => setRoomsOf(null), []);

  const toggle = async (p, on) => {
    try {
      const row = await savePlace({ id: p.id, is_active: on });
      setData(places.map((x) => (x.id === p.id ? row : x)));
      notify(
        on
          ? `${p.name} is on. Its rooms stay off until you switch them on under Rooms.`
          : `${p.name} is off — its rooms are off too, and their QR codes stop working until switched back on.`,
      );
      // The trigger switches rooms off after the row is returned; fetch what it did.
      await reload();
    } catch (e) {
      notify(e.message, "error");
    }
  };

  const setRooms = (placeId, rooms) =>
    setData(places.map((p) => (p.id === placeId ? { ...p, rooms } : p)));

  return (
    <>
      <PageHead
        title="Accommodation Partners"
        sub="Accommodation partners that carry our QR codes, their rooms, and the stickers for each room."
      >
        <button type="button" className="btn adm-btn-action" onClick={() => setEditing({})}>
          Add place
        </button>
      </PageHead>

      <LoadState
        loading={loading && !data}
        error={error}
        onRetry={reload}
        empty={data && !places.length}
        emptyText="No accommodation partners yet. Add the first one."
      />

      {places.length > 0 && (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Accommodation Partner</th>
                <th>WhatsApp</th>
                <th>Rooms</th>
                <th>Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {places.map((p) => {
                const rooms = p.rooms ?? [];
                const on = rooms.filter((r) => r.is_active).length;
                return (
                  <tr key={p.id} className={p.is_active ? "" : "is-off"}>
                    <td className="adm-cell-main">
                      <strong>{p.name}</strong>
                      <small>{[p.area, p.city].filter(Boolean).join(" · ") || "—"}</small>
                    </td>
                    <td data-label="WhatsApp" className="adm-mono">
                      {p.whatsapp_number || "—"}
                    </td>
                    <td data-label="Rooms">
                      {rooms.length ? `${on} of ${rooms.length} on` : "None yet"}
                    </td>
                    <td data-label="Active">
                      <Switch checked={p.is_active} label={`${p.name} active`} onChange={(v) => toggle(p, v)} />
                    </td>
                    <td className="actions">
                      <span className="adm-places-actions">
                        <button type="button" className="btn btn-ghost adm-btn-sm" onClick={() => setRoomsOf(p.id)}>
                          Rooms &amp; QR
                        </button>
                        <button type="button" className="btn btn-ghost adm-btn-sm" onClick={() => setEditing(p)}>
                          Edit
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <PlaceForm
          initial={editing}
          onClose={closeEdit}
          onSaved={(row, activeChanged) => {
            setData(editing.id ? places.map((x) => (x.id === row.id ? row : x)) : [...places, row].sort(byName));
            setEditing(null);
            if (activeChanged) reload();
            else if (!editing.id) setRoomsOf(row.id);
          }}
        />
      )}

      {roomsPlace && (
        <RoomsDrawer place={roomsPlace} onClose={closeRooms} onRooms={(rooms) => setRooms(roomsPlace.id, rooms)} />
      )}
    </>
  );
}
