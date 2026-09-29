/**
 * The interface's icon set, drawn as small inline SVGs so they take the colour
 * of whatever they sit in. The cloche is the brand mark.
 */

const line = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

/** The brand mark: a serving cloche on its plate. */
export function Cloche({ size = 40, className = "" }) {
  return (
    <svg
      viewBox="0 0 48 36"
      width={size}
      height={size * 0.75}
      className={className}
      aria-hidden="true"
    >
      <circle cx="24" cy="5.5" r="3" fill="currentColor" />
      <path d="M5 28 a19 19 0 0 1 38 0 z" fill="currentColor" />
      <path
        d="M11.5 23 a13 13 0 0 1 8 -9.5"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.45"
      />
      <rect
        x="1"
        y="29.5"
        width="46"
        height="4.5"
        rx="2.25"
        fill="currentColor"
      />
    </svg>
  );
}

/** Marks a dish cooked without onion or garlic. */
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
      <path d="M10 4 v16" stroke="#fff" strokeWidth="0.9" opacity="0.6" />
    </svg>
  );
}

const Svg = ({ size = 20, className = "", children }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    aria-hidden="true"
    {...line}
  >
    {children}
  </svg>
);

export const CartIcon = (p) => (
  <Svg {...p}>
    <path d="M3.5 5h2.2l2 11.2a1.6 1.6 0 0 0 1.6 1.3h7.7a1.6 1.6 0 0 0 1.6-1.2L20.5 8.5H6.8" />
    <circle cx="10" cy="20.3" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="17" cy="20.3" r="1.2" fill="currentColor" stroke="none" />
  </Svg>
);

export const ClockIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

export const BuildingIcon = (p) => (
  <Svg {...p}>
    <path d="M4 21V9l8-5 8 5v12" />
    <path d="M9 21v-5h6v5M3 21h18" />
    <path d="M9 10.5h.01M12 10.5h.01M15 10.5h.01" strokeWidth="2.4" />
  </Svg>
);

export const SearchIcon = (p) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Svg>
);

export const ArrowIcon = (p) => (
  <Svg {...p}>
    <path d="M5 12h13M13 6l6 6-6 6" />
  </Svg>
);

export const StarIcon = ({ size = 14, className = "" }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    aria-hidden="true"
  >
    <path
      d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z"
      fill="currentColor"
    />
  </svg>
);

export const ChiliIcon = (p) => (
  <Svg {...p}>
    <path d="M18 7c1.5 5-3 12-12 13 4-3 6-8 6-11 0-2 1.5-3 3-3s2.4.3 3 1z" />
    <path d="M17 6c0-2 1-3 2.5-3.5" />
  </Svg>
);

export const RupeeIcon = (p) => (
  <Svg {...p}>
    <path d="M7 5h10M7 9h10M7 5c5 0 7 1.5 7 4s-2.5 4-7 4l7 7" />
  </Svg>
);

export const ChefIcon = (p) => (
  <Svg {...p}>
    <path d="M7 14.5V20h10v-5.5" />
    <path d="M7 14.5a4 4 0 0 1-.6-7.9A5 5 0 0 1 12 3.5a5 5 0 0 1 5.6 3.1A4 4 0 0 1 17 14.5z" />
    <path d="M7 17h10" />
  </Svg>
);

export const ScooterIcon = (p) => (
  <Svg {...p}>
    <circle cx="6" cy="17" r="2.6" />
    <circle cx="18" cy="17" r="2.6" />
    <path d="M8.6 17h6.8l2-6.5H13M15 5h2.2l.8 5.5" />
    <path d="M3.5 12.5h6l1.4 4.5" />
  </Svg>
);

export const ShieldIcon = (p) => (
  <Svg {...p}>
    <path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z" />
    <path d="m8.8 12 2.2 2.2 4.2-4.4" />
  </Svg>
);

export const LeafIcon = (p) => (
  <Svg {...p}>
    <path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15" />
    <path d="M5 19l8-8" />
  </Svg>
);

/** Category glyphs for the sidebar and the phone's category sheet. */
export function CategoryGlyph({ icon, size = 24 }) {
  const common = { width: size, height: size, "aria-hidden": true };
  switch (icon) {
    case "kadhai":
      return (
        <svg viewBox="0 0 28 24" {...common}>
          <path d="M3 9 q1 12 11 12 q10 0 11 -12z" fill="currentColor" />
          <ellipse
            cx="14"
            cy="9"
            rx="11"
            ry="3.4"
            fill="currentColor"
            opacity="0.5"
          />
          <path
            d="M14 2.5 v3 M9 4 v2 M19 4 v2"
            stroke="currentColor"
            strokeWidth="1.4"
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
          <path d="M3 11 q1 10 11 10 q10 0 11 -10z" fill="currentColor" />
          <path
            d="M7 9 q1.5 -4 4 -4 q2 0 3 2 q1 -3 4 -3 q3 0 3.5 5"
            fill="currentColor"
            opacity="0.5"
          />
        </svg>
      );
    case "noodles":
      return (
        <svg viewBox="0 0 28 24" {...common}>
          <path d="M3 11 q1 10 11 10 q10 0 11 -10z" fill="currentColor" />
          <path
            d="M8 10 q1 -6 3 -7 M12 10 q0 -6 2 -8 M16 10 q0 -5 3 -7"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            opacity="0.6"
          />
        </svg>
      );
    case "bread":
      return (
        <svg viewBox="0 0 28 24" {...common}>
          <ellipse cx="14" cy="13" rx="12" ry="8" fill="currentColor" />
          <path
            d="M8 11 l2 2 M13 9 l2 2 M17 14 l2 2 M11 16 l2 2"
            stroke="#fff"
            strokeWidth="1.4"
            strokeLinecap="round"
            opacity="0.55"
          />
        </svg>
      );
    case "sweet":
      return (
        <svg viewBox="0 0 28 24" {...common}>
          <circle cx="9" cy="15" r="6" fill="currentColor" />
          <circle cx="20" cy="15" r="6" fill="currentColor" opacity="0.75" />
          <circle cx="14.5" cy="8" r="5.5" fill="currentColor" opacity="0.9" />
        </svg>
      );
    case "cup":
      return (
        <svg viewBox="0 0 28 24" {...common}>
          <path d="M6 4 h14 l-2 17 h-10z" fill="currentColor" />
          <path d="M7 9 h12" stroke="#fff" strokeWidth="1.5" opacity="0.5" />
          <path
            d="M16 4 l3 -3"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
    case "snack":
      return (
        <svg viewBox="0 0 28 24" {...common}>
          <path d="M14 3 L25 20 H3z" fill="currentColor" />
          <path
            d="M9 15 h10"
            stroke="#fff"
            strokeWidth="1.4"
            opacity="0.5"
            strokeLinecap="round"
          />
        </svg>
      );
    case "star":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path
            d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z"
            fill="currentColor"
          />
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
            opacity="0.3"
          />
          <circle cx="8.5" cy="11" r="3" fill="currentColor" />
          <circle cx="17" cy="9.5" r="2.6" fill="currentColor" opacity="0.8" />
          <circle cx="15" cy="16.5" r="3.4" fill="currentColor" opacity="0.6" />
        </svg>
      );
  }
}

/** A QR sticker, for the "scan it" button. */
export function QrIcon({ size = 18 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1" />
    </svg>
  );
}


/** Google's mark, for the sign-in button. Used in more than one place. */
export function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
