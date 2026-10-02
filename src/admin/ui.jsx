import { useCallback, useEffect, useRef, useState } from "react";
import { NoticeContext, STATUS_LABEL } from "./helpers";

/**
 * The few pieces every admin page is built from. Deliberately plain: these are
 * forms and tables for people doing data entry on a phone at a kitchen door as
 * often as at a desk, so every control is large enough to hit and every list
 * folds into cards on a narrow screen.
 */

// ------------------------------------------------------------------ notices

export function NoticeProvider({ children }) {
  const [notice, setNotice] = useState(null);
  const timer = useRef();
  const notify = useCallback((message, tone = "ok") => {
    clearTimeout(timer.current);
    setNotice({ message, tone, key: Date.now() });
    timer.current = setTimeout(() => setNotice(null), tone === "error" ? 7000 : 3500);
  }, []);
  return (
    <NoticeContext.Provider value={notify}>
      {children}
      <div className="adm-notice-slot" aria-live="polite">
        {notice && (
          <div key={notice.key} className={`adm-notice adm-notice--${notice.tone}`} role="status">
            {notice.message}
          </div>
        )}
      </div>
    </NoticeContext.Provider>
  );
}

// --------------------------------------------------------------------- layout
export function PageHead({ title, sub, children }) {
  return (
    <header className="adm-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="adm-head__sub">{sub}</p>}
      </div>
      {children && <div className="adm-head__actions">{children}</div>}
    </header>
  );
}

export function LoadState({ loading, error, empty, emptyText, onRetry }) {
  if (error)
    return (
      <div className="adm-state adm-state--error" role="alert">
        <p>{error}</p>
        {onRetry && (
          <button type="button" className="btn btn-ghost" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    );
  if (loading)
    return (
      <div className="adm-state">
        <span className="spinner spinner--dark" aria-hidden="true" /> Loading…
      </div>
    );
  if (empty) return <div className="adm-state">{emptyText}</div>;
  return null;
}

// ---------------------------------------------------------------------- forms
export function Field({ label, hint, error, required, children, wide }) {
  return (
    <label className={`field adm-field ${wide ? "adm-field--wide" : ""}`}>
      <span className="field-label">
        {label}
        {required && <span className="req"> *</span>}
      </span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/**
 * An on/off switch. With `onChange` returning a promise, it shows the new
 * position at once and goes back if the save fails -- the admin sees the
 * truth, not what they hoped.
 */
export function Switch({ checked, onChange, label, disabled, size }) {
  const [pending, setPending] = useState(null);
  const shown = pending ?? checked;
  const flip = async () => {
    if (disabled || pending !== null) return;
    const next = !checked;
    setPending(next);
    try {
      await onChange(next);
    } finally {
      setPending(null);
    }
  };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={shown}
      aria-label={label}
      className={`adm-switch ${shown ? "is-on" : ""} ${size === "sm" ? "adm-switch--sm" : ""}`}
      onClick={flip}
      disabled={disabled}
      aria-busy={pending !== null}
    >
      <span className="adm-switch__knob" />
    </button>
  );
}

/**
 * A form that slides over the list it belongs to. Full screen on a phone. The
 * Escape key and the backdrop both close it, unless it is saving.
 */
export function Drawer({ open, title, onClose, children, footer, busy }) {
  const panel = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector("input, select, textarea")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, busy, onClose]);

  if (!open) return null;
  return (
    <div className="adm-drawer" role="dialog" aria-modal="true" aria-label={title}>
      <div className="adm-drawer__backdrop" onClick={() => !busy && onClose()} />
      <div className="adm-drawer__panel" ref={panel}>
        <header className="adm-drawer__head">
          <h2>{title}</h2>
          <button type="button" className="adm-icon-btn" onClick={onClose} disabled={busy} aria-label="Close">
            ×
          </button>
        </header>
        <div className="adm-drawer__body">{children}</div>
        {footer && <footer className="adm-drawer__foot">{footer}</footer>}
      </div>
    </div>
  );
}

/** A button that asks once more before doing something hard to undo. */
export function ConfirmButton({ children, confirm, onConfirm, className = "btn btn-ghost", disabled }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!asking)
    return (
      <button type="button" className={className} onClick={() => setAsking(true)} disabled={disabled}>
        {children}
      </button>
    );
  return (
    <span className="adm-confirm">
      <span>{confirm}</span>
      <button
        type="button"
        className="btn adm-btn-danger adm-btn-sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            setBusy(false);
            setAsking(false);
          }
        }}
      >
        {busy ? "Working…" : "Yes"}
      </button>
      <button type="button" className="btn btn-ghost adm-btn-sm" onClick={() => setAsking(false)} disabled={busy}>
        No
      </button>
    </span>
  );
}

// --------------------------------------------------------------------- badges
const TONE = {
  pending_payment: "muted",
  paid: "info",
  sent_to_kitchen: "info",
  preparing: "teal",
  out_for_delivery: "gold",
  delivered: "ok",
  cancelled: "bad",
  failed: "bad",
  accepted: "ok",
  rejected: "bad",
  sent: "info",
  pending: "muted",
  offered: "info",
  declined: "bad",
  taken: "muted",
  late: "muted",
  queued: "muted",
  sending: "info",
  retry: "gold",
  delivered_msg: "ok",
  read: "ok",
};

export function Badge({ status, children, tone }) {
  return (
    <span className={`adm-badge adm-badge--${tone ?? TONE[status] ?? "muted"}`}>
      {children ?? STATUS_LABEL[status] ?? String(status).replace(/_/g, " ")}
    </span>
  );
}
