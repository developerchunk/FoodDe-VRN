/**
 * Braj motifs, drawn as small inline SVGs.
 * Mor pankh (peacock feather), lotus, bansuri, tulsi, matka, temple arch —
 * the visual vocabulary of Vrindavan, used as ornament rather than iconography.
 */

export function MorPankh({ size = 22, className = "" }) {
  return (
    <svg
      viewBox="0 0 24 34"
      width={size}
      height={size * 1.42}
      className={className}
      aria-hidden="true"
    >
      <ellipse
        cx="12"
        cy="11"
        rx="9.5"
        ry="11"
        fill="currentColor"
        opacity="0.28"
      />
      <ellipse cx="12" cy="10" rx="6.5" ry="8" fill="#e39a2a" />
      <ellipse cx="12" cy="9.5" rx="3.8" ry="5" fill="#1b2f57" />
      <ellipse cx="12" cy="9" rx="1.6" ry="2.2" fill="#4f9b92" />
      <path
        d="M12 21 V33"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M12 21 q-5 3 -7 8 M12 21 q5 3 7 8"
        stroke="currentColor"
        strokeWidth="1.1"
        fill="none"
        opacity="0.55"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Lotus({ size = 24, className = "" }) {
  return (
    <svg
      viewBox="0 0 32 24"
      width={size}
      height={size * 0.75}
      className={className}
      aria-hidden="true"
    >
      <path d="M16 3 q5 7 0 15 q-5 -8 0 -15z" fill="currentColor" />
      <path
        d="M16 18 q-8 -6 -13 -3 q3 7 13 3z"
        fill="currentColor"
        opacity="0.72"
      />
      <path
        d="M16 18 q8 -6 13 -3 q-3 7 -13 3z"
        fill="currentColor"
        opacity="0.72"
      />
      <path
        d="M16 19 q-5 -8 -11 -8 q0 8 11 8z"
        fill="currentColor"
        opacity="0.5"
      />
      <path
        d="M16 19 q5 -8 11 -8 q0 8 -11 8z"
        fill="currentColor"
        opacity="0.5"
      />
    </svg>
  );
}

export function Bansuri({ width = 120, className = "" }) {
  return (
    <svg
      viewBox="0 0 120 14"
      width={width}
      height={14}
      className={className}
      aria-hidden="true"
    >
      <rect
        x="2"
        y="4"
        width="116"
        height="6"
        rx="3"
        fill="currentColor"
        opacity="0.5"
      />
      <g fill="currentColor">
        <circle cx="26" cy="7" r="1.7" />
        <circle cx="40" cy="7" r="1.7" />
        <circle cx="54" cy="7" r="1.7" />
        <circle cx="68" cy="7" r="1.7" />
        <circle cx="82" cy="7" r="1.7" />
        <circle cx="96" cy="7" r="1.7" />
      </g>
    </svg>
  );
}

export function TulsiLeaf({ size = 18, className = "" }) {
  return (
    <svg
      viewBox="0 0 20 24"
      width={size}
      height={size * 1.2}
      className={className}
      aria-hidden="true"
    >
      <path d="M10 1 q9 8 0 21 q-9 -13 0 -21z" fill="currentColor" />
      <path d="M10 4 v16" stroke="#fffdf6" strokeWidth="0.9" opacity="0.6" />
    </svg>
  );
}

export function Matka({ size = 26, className = "" }) {
  return (
    <svg
      viewBox="0 0 28 30"
      width={size}
      height={size * 1.07}
      className={className}
      aria-hidden="true"
    >
      <path
        d="M8 8 q-7 5 -7 12 q0 9 13 9 q13 0 13 -9 q0 -7 -7 -12z"
        fill="currentColor"
        opacity="0.85"
      />
      <rect x="7" y="4" width="14" height="5" rx="2.4" fill="currentColor" />
      <path
        d="M4 18 q10 4 20 0"
        stroke="#fffdf6"
        strokeWidth="1.4"
        fill="none"
        opacity="0.5"
      />
    </svg>
  );
}

export function Diya({ size = 24, className = "" }) {
  return (
    <svg
      viewBox="0 0 28 26"
      width={size}
      height={size * 0.93}
      className={className}
      aria-hidden="true"
    >
      <path d="M13 6 q2 -5 0 -6 q-4 4 0 6z" fill="#e39a2a" />
      <path
        d="M2 15 q12 8 24 0 q-2 8 -12 8 q-10 0 -12 -8z"
        fill="currentColor"
      />
      <ellipse
        cx="14"
        cy="15"
        rx="12"
        ry="3.4"
        fill="currentColor"
        opacity="0.6"
      />
    </svg>
  );
}

/** Cusped temple arch used as a frame around imagery. */
export function ArchFrame({ className = "", children }) {
  return (
    <div className={`arch-frame ${className}`}>
      <svg
        className="arch-frame__cusps"
        viewBox="0 0 100 30"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M0 30 V16 q5 0 5 -5 q0 -6 7 -6 q6 0 6 -5 q0 0 0 0 h64 q0 5 6 5 q7 0 7 6 q0 5 5 5 V30 z"
          fill="currentColor"
        />
      </svg>
      {children}
    </div>
  );
}

/** A row of feather-eyes used as a section divider. */
export function FeatherDivider({ className = "" }) {
  return (
    <div className={`feather-divider ${className}`} aria-hidden="true">
      <span className="feather-divider__line" />
      <MorPankh size={16} />
      <MorPankh size={22} />
      <MorPankh size={16} />
      <span className="feather-divider__line" />
    </div>
  );
}

/** Category glyphs for the sidebar rail. */
export function CategoryGlyph({ icon, size = 26 }) {
  const common = { width: size, height: size, "aria-hidden": true };
  switch (icon) {
    case "feather":
      return <MorPankh size={size * 0.78} />;
    case "kadhai":
      return (
        <svg viewBox="0 0 28 24" {...common}>
          <path d="M3 8 q1 12 11 12 q10 0 11 -12z" fill="currentColor" />
          <ellipse
            cx="14"
            cy="8"
            rx="11"
            ry="3.4"
            fill="currentColor"
            opacity="0.55"
          />
          <path
            d="M14 3 v3 M9 4.5 v2 M19 4.5 v2"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            opacity="0.6"
          />
        </svg>
      );
    case "dosa":
      return (
        <svg viewBox="0 0 28 24" {...common}>
          <path
            d="M2 19 q8 -16 20 -16 q5 0 6 3 q-9 3 -15 13z"
            fill="currentColor"
          />
          <circle cx="23" cy="17" r="4" fill="currentColor" opacity="0.5" />
        </svg>
      );
    case "burger":
      return (
        <svg viewBox="0 0 28 24" {...common}>
          <path d="M3 10 q0 -7 11 -7 q11 0 11 7z" fill="currentColor" />
          <rect
            x="3"
            y="11"
            width="22"
            height="3"
            rx="1.5"
            fill="currentColor"
            opacity="0.55"
          />
          <path
            d="M3 15 q11 6 22 0 q0 5 -11 5 q-11 0 -11 -5z"
            fill="currentColor"
          />
        </svg>
      );
    case "bowl":
      return (
        <svg viewBox="0 0 28 24" {...common}>
          <path d="M3 10 q1 11 11 11 q10 0 11 -11z" fill="currentColor" />
          <path
            d="M6 8 q4 -5 8 -2 q4 3 8 -1"
            stroke="currentColor"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            opacity="0.6"
          />
        </svg>
      );
    case "sweet":
      return (
        <svg viewBox="0 0 28 24" {...common}>
          <circle cx="9" cy="14" r="6" fill="currentColor" />
          <circle cx="20" cy="14" r="6" fill="currentColor" opacity="0.75" />
          <circle cx="14.5" cy="7" r="5.5" fill="currentColor" opacity="0.9" />
        </svg>
      );
    case "thali":
    default:
      return (
        <svg viewBox="0 0 28 24" {...common}>
          <ellipse
            cx="14"
            cy="13"
            rx="13"
            ry="9"
            fill="currentColor"
            opacity="0.28"
          />
          <ellipse
            cx="14"
            cy="12"
            rx="10"
            ry="6.5"
            fill="currentColor"
            opacity="0.18"
          />
          <circle cx="8.5" cy="10" r="3" fill="currentColor" />
          <circle cx="17" cy="9" r="2.6" fill="currentColor" opacity="0.8" />
          <circle cx="15" cy="16" r="3.4" fill="currentColor" opacity="0.6" />
        </svg>
      );
  }
}
