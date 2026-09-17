export default function QtyStepper({
  qty,
  onAdd,
  onRemove,
  label,
  size = "md",
}) {
  return (
    <div className={`stepper stepper--${size}`}>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove one ${label}`}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <rect
            x="2.5"
            y="7"
            width="11"
            height="2"
            rx="1"
            fill="currentColor"
          />
        </svg>
      </button>
      <span
        className="stepper__qty"
        aria-live="polite"
        aria-label={`${qty} in cart`}
      >
        {qty}
      </span>
      <button
        type="button"
        onClick={onAdd}
        aria-label={`Add one more ${label}`}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <rect
            x="2.5"
            y="7"
            width="11"
            height="2"
            rx="1"
            fill="currentColor"
          />
          <rect
            x="7"
            y="2.5"
            width="2"
            height="11"
            rx="1"
            fill="currentColor"
          />
        </svg>
      </button>
    </div>
  );
}
