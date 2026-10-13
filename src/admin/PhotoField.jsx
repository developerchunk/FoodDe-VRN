import { kb } from "./image";

/**
 * A photo field for the admin's forms: what is there now, a photo chosen and
 * waiting to upload, or one marked for removal. Used for dish photos and
 * category pictures. The photo is made small on this device first
 * (prepareDishPhoto); the form uploads it when it saves.
 */
export default function PhotoField({
  label = "Photo",
  shownUrl,
  photo,
  processing,
  error,
  onPick,
  onRemove,
  onUndo,
  removing,
}) {
  return (
    <div className="field adm-field adm-field--wide">
      <span className="field-label">{label}</span>
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
