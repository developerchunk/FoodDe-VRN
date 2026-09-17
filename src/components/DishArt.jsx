/**
 * Flat SVG dish illustrations.
 *
 * Instead of stock photography (which never looks like Braj food anyway), every
 * dish gets a hand-built illustration from one of these archetypes, tinted by
 * the item's own three-colour palette.
 */

const V = "0 0 200 150";

function Steam({ x = 100, tint }) {
  return (
    <g
      opacity="0.35"
      stroke={tint}
      strokeWidth="3"
      strokeLinecap="round"
      fill="none"
    >
      <path d={`M${x - 16} 34 q -6 -10 0 -19 q 6 -9 0 -18`} />
      <path d={`M${x} 28 q -6 -11 0 -21 q 6 -10 0 -19`} />
      <path d={`M${x + 16} 34 q -6 -10 0 -19 q 6 -9 0 -18`} />
    </g>
  );
}

const ART = {
  /* --- steel thali with katoris --- */
  thali: ([a, b, c]) => (
    <>
      <ellipse cx="100" cy="88" rx="74" ry="48" fill="#dfe4e0" />
      <ellipse cx="100" cy="84" rx="66" ry="42" fill="#eef1ed" />
      <ellipse cx="100" cy="84" rx="58" ry="36" fill="#f7f8f5" />
      <ellipse cx="70" cy="72" rx="18" ry="12" fill={a} />
      <ellipse cx="70" cy="70" rx="15" ry="9.5" fill={a} opacity="0.75" />
      <ellipse cx="112" cy="68" rx="16" ry="10.5" fill={b} />
      <ellipse cx="142" cy="86" rx="14" ry="9" fill={c} />
      <ellipse cx="96" cy="100" rx="24" ry="13" fill="#fffdf6" />
      <ellipse cx="96" cy="99" rx="18" ry="9" fill="#f3ead2" />
      <circle cx="60" cy="97" r="8" fill="#e8d9b4" />
      <circle cx="60" cy="96" r="3" fill={a} />
    </>
  ),

  /* --- katori of curry --- */
  curry: ([a, b, c]) => (
    <>
      <Steam tint={b} />
      <ellipse cx="100" cy="112" rx="58" ry="12" fill="#00000010" />
      <path d="M42 74 q0 42 58 42 q58 0 58 -42 z" fill="#e7ebe6" />
      <path d="M46 78 q2 34 54 34 q52 0 54 -34 z" fill="#d6dcd6" />
      <ellipse cx="100" cy="74" rx="58" ry="17" fill={a} />
      <ellipse cx="100" cy="74" rx="58" ry="17" fill="#000" opacity="0.06" />
      <ellipse cx="100" cy="72" rx="51" ry="13.5" fill={a} />
      <circle cx="84" cy="70" r="7.5" fill={b} />
      <circle cx="112" cy="74" r="6.5" fill={b} />
      <circle cx="100" cy="64" r="5.5" fill={b} />
      <path
        d="M118 63 q8 3 13 8"
        stroke={c}
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M74 78 q7 4 14 4"
        stroke={c}
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),

  /* --- kadhai / dry sabzi --- */
  kadhai: ([a, b, c]) => (
    <>
      <Steam tint={a} />
      <path d="M36 70 q4 46 64 46 q60 0 64 -46 z" fill="#3c3a37" />
      <path d="M40 74 q5 38 60 38 q55 0 60 -38 z" fill="#27262a" />
      <ellipse cx="100" cy="70" rx="64" ry="16" fill="#4a4844" />
      <ellipse cx="100" cy="69" rx="57" ry="13" fill="#2f2e31" />
      <ellipse cx="100" cy="68" rx="48" ry="11" fill={a} />
      <rect
        x="82"
        y="58"
        width="15"
        height="13"
        rx="3"
        fill={b}
        transform="rotate(-14 89 64)"
      />
      <rect
        x="104"
        y="62"
        width="14"
        height="12"
        rx="3"
        fill={b}
        transform="rotate(12 111 68)"
      />
      <rect
        x="92"
        y="70"
        width="13"
        height="11"
        rx="3"
        fill={b}
        opacity="0.85"
      />
      <path d="M72 66 l9 -3 l2 8 z" fill={c} />
      <path d="M124 70 l9 -4 l2 8 z" fill={c} />
      <circle cx="30" cy="70" r="7" fill="#4a4844" />
      <circle cx="170" cy="70" r="7" fill="#4a4844" />
    </>
  ),

  /* --- rice mound on a plate --- */
  rice: ([a, b, c]) => (
    <>
      <ellipse cx="100" cy="106" rx="72" ry="30" fill="#e7ebe6" />
      <ellipse cx="100" cy="104" rx="63" ry="25" fill="#f7f8f5" />
      <path
        d="M58 100 q10 -34 42 -34 q32 0 42 34 z"
        fill={c === "#fffdf6" ? "#fffdf6" : "#fdfaf0"}
      />
      <path d="M64 100 q9 -28 36 -28 q27 0 36 28 z" fill="#fffdf6" />
      <ellipse cx="100" cy="82" rx="24" ry="14" fill={a} opacity="0.9" />
      <ellipse cx="100" cy="80" rx="17" ry="9" fill={b} opacity="0.85" />
      <circle cx="92" cy="78" r="3.2" fill={c} />
      <circle cx="108" cy="83" r="2.8" fill={c} />
      <circle cx="101" cy="72" r="2.6" fill={c} />
      <ellipse cx="150" cy="104" rx="16" ry="9" fill="#e4d2ac" />
      <ellipse cx="150" cy="102" rx="12" ry="6" fill={b} opacity="0.8" />
    </>
  ),

  /* --- fried rounds: kachori, vada, idli, puri --- */
  fried: ([a, b, c]) => (
    <>
      <ellipse cx="100" cy="106" rx="74" ry="30" fill="#e7ebe6" />
      <ellipse cx="100" cy="104" rx="65" ry="25" fill="#f7f8f5" />
      <circle cx="74" cy="84" r="27" fill={b} />
      <circle cx="74" cy="81" r="25" fill={a} />
      <circle cx="74" cy="81" r="17" fill="#ffffff" opacity="0.14" />
      <circle cx="122" cy="92" r="23" fill={b} />
      <circle cx="122" cy="89" r="21" fill={a} />
      <circle cx="122" cy="89" r="13" fill="#ffffff" opacity="0.12" />
      <path
        d="M62 74 q10 -6 20 -1"
        stroke={c}
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M112 84 q9 -5 18 -1"
        stroke={c}
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
        opacity="0.5"
      />
      <ellipse cx="156" cy="100" rx="17" ry="11" fill="#e0e5e0" />
      <ellipse cx="156" cy="98" rx="13" ry="8" fill={c} />
    </>
  ),

  /* --- folded dosa with chutney bowls --- */
  dosa: ([a, b, c]) => (
    <>
      <ellipse cx="100" cy="108" rx="78" ry="30" fill="#e7ebe6" />
      <ellipse cx="100" cy="106" rx="69" ry="25" fill="#f7f8f5" />
      <path d="M30 100 q34 -60 78 -60 q26 0 34 14 q-30 10 -52 46 z" fill={b} />
      <path d="M36 98 q32 -52 70 -53 q20 0 27 10 q-28 10 -48 43 z" fill={a} />
      <path
        d="M54 88 q22 -30 46 -38"
        stroke="#ffffff"
        strokeWidth="3"
        opacity="0.28"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M68 96 q20 -26 42 -35"
        stroke="#ffffff"
        strokeWidth="2.2"
        opacity="0.2"
        fill="none"
        strokeLinecap="round"
      />
      <ellipse cx="146" cy="88" rx="17" ry="11" fill="#e0e5e0" />
      <ellipse cx="146" cy="86" rx="13" ry="8" fill="#eef3e6" />
      <ellipse cx="160" cy="106" rx="17" ry="11" fill="#e0e5e0" />
      <ellipse cx="160" cy="104" rx="13" ry="8" fill={c} />
    </>
  ),

  /* --- peda / laddu / gulab jamun stack --- */
  sweet: ([a, b, c]) => (
    <>
      <ellipse cx="100" cy="112" rx="66" ry="20" fill="#e9dcbd" />
      <ellipse cx="100" cy="108" rx="60" ry="17" fill="#f6ecd4" />
      <circle cx="72" cy="94" r="21" fill={b} />
      <circle cx="72" cy="91" r="19" fill={a} />
      <circle cx="128" cy="94" r="21" fill={b} />
      <circle cx="128" cy="91" r="19" fill={a} />
      <circle cx="100" cy="70" r="23" fill={b} />
      <circle cx="100" cy="67" r="21" fill={a} />
      <circle cx="100" cy="64" r="5" fill={c} />
      <circle cx="72" cy="88" r="3.4" fill={c} />
      <circle cx="128" cy="88" r="3.4" fill={c} />
      <path
        d="M88 52 q12 -8 24 0"
        stroke={c}
        strokeWidth="2"
        fill="none"
        opacity="0.5"
        strokeLinecap="round"
      />
    </>
  ),

  /* --- barfi diamonds --- */
  barfi: ([a, b, c]) => (
    <>
      <ellipse cx="100" cy="112" rx="66" ry="20" fill="#e9dcbd" />
      <ellipse cx="100" cy="108" rx="60" ry="17" fill="#f6ecd4" />
      {[
        [70, 88],
        [100, 80],
        [130, 88],
        [85, 100],
        [115, 100],
      ].map(([x, y], i) => (
        <g key={i}>
          <path d={`M${x} ${y - 16} l20 14 l-20 14 l-20 -14 z`} fill={b} />
          <path d={`M${x} ${y - 19} l20 14 l-20 14 l-20 -14 z`} fill={a} />
          <path d={`M${x} ${y - 19} l20 14 l-20 3 z`} fill={c} opacity="0.35" />
        </g>
      ))}
    </>
  ),

  /* --- jalebi spirals --- */
  jalebi: ([a, b, c]) => (
    <>
      <ellipse cx="100" cy="112" rx="68" ry="20" fill="#e9dcbd" />
      <ellipse cx="100" cy="108" rx="61" ry="17" fill={c} />
      {[
        [70, 86, 1],
        [126, 90, -1],
        [99, 68, 1],
      ].map(([x, y, d], i) => (
        <g key={i} fill="none" strokeLinecap="round">
          <path
            d={`M${x} ${y} m -22 0 a 22 22 0 1 ${d > 0 ? 1 : 0} 44 0 a 22 22 0 1 ${d > 0 ? 1 : 0} -44 0 M${x} ${y} m -13 0 a 13 13 0 1 ${d > 0 ? 0 : 1} 26 0 a 13 13 0 1 ${d > 0 ? 0 : 1} -26 0`}
            stroke={b}
            strokeWidth="9"
          />
          <path
            d={`M${x} ${y} m -22 0 a 22 22 0 1 ${d > 0 ? 1 : 0} 44 0 a 22 22 0 1 ${d > 0 ? 1 : 0} -44 0 M${x} ${y} m -13 0 a 13 13 0 1 ${d > 0 ? 0 : 1} 26 0 a 13 13 0 1 ${d > 0 ? 0 : 1} -26 0`}
            stroke={a}
            strokeWidth="6"
          />
        </g>
      ))}
    </>
  ),

  /* --- kulhad / glass of lassi, thandai, chaas --- */
  drink: ([a, b, c]) => (
    <>
      <ellipse cx="100" cy="126" rx="42" ry="10" fill="#00000010" />
      <path
        d="M68 44 l6 78 q1 8 26 8 q25 0 26 -8 l6 -78 z"
        fill={b}
        opacity="0.85"
      />
      <path d="M72 48 l5 72 q1 5 23 5 q22 0 23 -5 l5 -72 z" fill={a} />
      <path
        d="M72 48 q28 9 56 0 l-1 14 q-27 8 -54 0 z"
        fill="#ffffff"
        opacity="0.35"
      />
      <ellipse cx="100" cy="46" rx="32" ry="9" fill={b} />
      <ellipse cx="100" cy="44" rx="28" ry="7.5" fill="#fffdf6" />
      <circle cx="90" cy="43" r="3.4" fill={c} />
      <circle cx="107" cy="46" r="2.8" fill={c} />
      <circle cx="99" cy="40" r="2.4" fill={c} opacity="0.8" />
      <path
        d="M80 60 q4 30 6 52"
        stroke="#ffffff"
        strokeWidth="4"
        opacity="0.25"
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),

  /* --- filter coffee tumbler --- */
  cup: ([a, b, c]) => (
    <>
      <Steam tint={a} x={96} />
      <ellipse cx="100" cy="126" rx="44" ry="9" fill="#00000010" />
      <path d="M66 116 q34 12 68 0 l-4 -10 q-30 9 -60 0 z" fill="#c9cec9" />
      <path d="M74 58 l6 52 q20 7 40 0 l6 -52 z" fill="#dfe4e0" />
      <path d="M78 62 l5 46 q17 6 34 0 l5 -46 z" fill={a} />
      <path
        d="M78 62 q22 7 44 0 l-2 12 q-20 6 -40 0 z"
        fill={b}
        opacity="0.6"
      />
      <ellipse cx="100" cy="59" rx="23" ry="7" fill="#eef1ed" />
      <ellipse cx="100" cy="58" rx="19" ry="5.5" fill={c} />
    </>
  ),

  /* --- noodle bowl --- */
  noodles: ([a, b, c]) => (
    <>
      <Steam tint={b} />
      <path d="M38 72 q3 46 62 46 q59 0 62 -46 z" fill="#e7ebe6" />
      <path d="M43 77 q4 36 57 36 q53 0 57 -36 z" fill="#cfd6cf" />
      <ellipse
        cx="100"
        cy="72"
        rx="62"
        ry="17"
        fill={c === "#4a7a3b" ? "#8d5a2b" : "#8d5a2b"}
      />
      <ellipse cx="100" cy="70" rx="55" ry="14" fill={a} />
      <g stroke={b} strokeWidth="3.4" fill="none" strokeLinecap="round">
        <path d="M58 68 q14 -10 30 -2 q16 8 32 -2" />
        <path d="M54 76 q16 -8 32 0 q16 8 32 -2" />
        <path d="M70 62 q14 -8 28 0 q14 8 28 0" />
      </g>
      <rect
        x="74"
        y="60"
        width="11"
        height="8"
        rx="2.5"
        fill={c}
        transform="rotate(-18 79 64)"
      />
      <rect
        x="112"
        y="68"
        width="11"
        height="8"
        rx="2.5"
        fill={c}
        transform="rotate(16 117 72)"
      />
      <path
        d="M150 34 l-18 46"
        stroke="#b98e4a"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M160 36 l-18 46"
        stroke="#b98e4a"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </>
  ),

  /* --- soup bowl with spoon --- */
  soup: ([a, b, c]) => (
    <>
      <Steam tint={a} />
      <path d="M44 74 q3 42 56 42 q53 0 56 -42 z" fill="#e7ebe6" />
      <path d="M49 79 q4 33 51 33 q47 0 51 -33 z" fill="#cfd6cf" />
      <ellipse cx="100" cy="74" rx="56" ry="15" fill="#dfe4e0" />
      <ellipse cx="100" cy="73" rx="48" ry="12" fill={a} />
      <circle cx="86" cy="71" r="5" fill={b} />
      <circle cx="110" cy="75" r="4.4" fill={b} />
      <circle cx="100" cy="66" r="3.6" fill={c} />
      <circle cx="118" cy="68" r="3" fill={c} />
      <path
        d="M150 58 q14 4 8 18 q-6 13 -18 8"
        stroke="#c9cec9"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),

  /* --- burger --- */
  burger: ([a, b, c]) => (
    <>
      <ellipse cx="100" cy="126" rx="56" ry="10" fill="#00000010" />
      <path d="M46 62 q0 -34 54 -34 q54 0 54 34 z" fill={a} />
      <path
        d="M46 62 q0 -34 54 -34 q54 0 54 34 z"
        fill="#ffffff"
        opacity="0.1"
      />
      <circle cx="78" cy="44" r="2.6" fill="#fdf6e3" />
      <circle cx="100" cy="38" r="2.6" fill="#fdf6e3" />
      <circle cx="122" cy="45" r="2.6" fill="#fdf6e3" />
      <circle cx="90" cy="52" r="2.2" fill="#fdf6e3" />
      <rect x="42" y="62" width="116" height="9" rx="4.5" fill={c} />
      <path d="M44 71 q56 14 112 0 l0 10 q-56 12 -112 0 z" fill={b} />
      <rect x="46" y="80" width="108" height="11" rx="5" fill="#f0c845" />
      <rect
        x="42"
        y="90"
        width="116"
        height="9"
        rx="4.5"
        fill={c}
        opacity="0.8"
      />
      <path
        d="M46 99 q54 22 108 0 q0 14 -54 14 q-54 0 -54 -14 z"
        fill={a}
        opacity="0.92"
      />
    </>
  ),

  /* --- pizza / uttapam round --- */
  pizza: ([a, b, c]) => (
    <>
      <circle cx="100" cy="80" r="62" fill={b} />
      <circle cx="100" cy="80" r="53" fill={a} />
      <circle cx="100" cy="80" r="44" fill={b} opacity="0.35" />
      <g stroke={b} strokeWidth="2" opacity="0.5">
        <path d="M100 26 v108" />
        <path d="M46 80 h108" />
        <path d="M62 42 l76 76" />
        <path d="M138 42 l-76 76" />
      </g>
      <circle cx="80" cy="64" r="7" fill={c} />
      <circle cx="120" cy="70" r="6" fill="#c4442a" />
      <circle cx="94" cy="98" r="6.4" fill={c} />
      <circle cx="122" cy="98" r="5.4" fill="#c4442a" opacity="0.85" />
      <circle cx="104" cy="52" r="5" fill="#c4442a" opacity="0.7" />
      <circle cx="68" cy="92" r="4.6" fill={c} opacity="0.85" />
    </>
  ),

  /* --- fries carton --- */
  fries: ([a, b, c]) => (
    <>
      <ellipse cx="100" cy="128" rx="46" ry="9" fill="#00000010" />
      <g stroke={a} strokeWidth="9" strokeLinecap="round">
        <path d="M76 84 l-4 -44" />
        <path d="M92 80 l0 -50" />
        <path d="M108 80 l4 -48" />
        <path d="M124 86 l8 -42" />
      </g>
      <g stroke={b} strokeWidth="3" strokeLinecap="round" opacity="0.6">
        <path d="M76 80 l-3 -36" />
        <path d="M108 76 l3 -40" />
      </g>
      <path d="M66 74 h68 l-8 50 q-26 6 -52 0 z" fill={c} />
      <path
        d="M70 78 h60 l-7 42 q-23 5 -46 0 z"
        fill="#ffffff"
        opacity="0.18"
      />
      <path d="M78 92 h44 l-2 12 h-40 z" fill="#ffffff" opacity="0.35" />
    </>
  ),

  /* --- chaat plate --- */
  chaat: ([a, b, c]) => (
    <>
      <ellipse cx="100" cy="98" rx="72" ry="36" fill="#e7ebe6" />
      <ellipse cx="100" cy="95" rx="63" ry="30" fill="#f7f8f5" />
      <ellipse cx="100" cy="93" rx="52" ry="24" fill={a} />
      <path
        d="M58 88 q20 -12 42 -4 q22 8 42 -4"
        stroke={b}
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M62 100 q20 10 40 2 q20 -8 38 2"
        stroke={c}
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        opacity="0.8"
      />
      <g fill="#e8b74a">
        <circle cx="78" cy="84" r="2.4" />
        <circle cx="92" cy="96" r="2.4" />
        <circle cx="112" cy="86" r="2.4" />
        <circle cx="124" cy="98" r="2.4" />
        <circle cx="100" cy="104" r="2.4" />
        <circle cx="66" cy="96" r="2.4" />
      </g>
      <path d="M88 76 l12 -14 l12 14 z" fill={b} opacity="0.9" />
    </>
  ),

  /* --- wrap / spring roll --- */
  roll: ([a, b, c]) => (
    <>
      <ellipse cx="100" cy="110" rx="70" ry="26" fill="#e7ebe6" />
      <ellipse cx="100" cy="108" rx="61" ry="21" fill="#f7f8f5" />
      {[
        [66, 86, -16],
        [100, 94, 6],
        [134, 84, 20],
      ].map(([x, y, r], i) => (
        <g key={i} transform={`rotate(${r} ${x} ${y})`}>
          <rect x={x - 12} y={y - 30} width="24" height="60" rx="12" fill={b} />
          <rect x={x - 10} y={y - 28} width="20" height="56" rx="10" fill={a} />
          <path
            d={`M${x - 8} ${y - 14} h16 M${x - 8} ${y + 2} h16`}
            stroke={b}
            strokeWidth="2"
            opacity="0.5"
          />
        </g>
      ))}
      <ellipse cx="160" cy="104" rx="15" ry="9" fill="#e0e5e0" />
      <ellipse cx="160" cy="102" rx="11" ry="6.5" fill={c} />
    </>
  ),

  /* --- steamed momos --- */
  momo: ([a, b, c]) => (
    <>
      <Steam tint={b} x={96} />
      <ellipse cx="100" cy="112" rx="70" ry="24" fill="#e7ebe6" />
      <ellipse cx="100" cy="110" rx="61" ry="19" fill="#f7f8f5" />
      {[
        [70, 92],
        [100, 84],
        [130, 92],
      ].map(([x, y], i) => (
        <g key={i}>
          <ellipse cx={x} cy={y + 3} rx="22" ry="17" fill={b} />
          <ellipse cx={x} cy={y} rx="21" ry="16" fill={a} />
          <g stroke={b} strokeWidth="2" fill="none" opacity="0.7">
            <path d={`M${x - 14} ${y - 4} q6 -8 5 -12`} />
            <path d={`M${x - 5} ${y - 9} q3 -8 2 -11`} />
            <path d={`M${x + 5} ${y - 9} q-2 -8 -1 -11`} />
            <path d={`M${x + 14} ${y - 4} q-5 -8 -4 -12`} />
          </g>
          <circle cx={x} cy={y - 12} r="3" fill={b} />
        </g>
      ))}
      <ellipse cx="164" cy="106" rx="14" ry="8" fill="#e0e5e0" />
      <ellipse cx="164" cy="104" rx="10" ry="5.5" fill={c} />
    </>
  ),

  /* --- bread: roti, paratha, sandwich --- */
  bread: ([a, b, c]) => (
    <>
      <ellipse cx="100" cy="106" rx="72" ry="28" fill="#e7ebe6" />
      <ellipse cx="100" cy="104" rx="63" ry="23" fill="#f7f8f5" />
      <ellipse cx="96" cy="88" rx="48" ry="27" fill={b} />
      <ellipse cx="96" cy="84" rx="46" ry="26" fill={a} />
      <ellipse cx="96" cy="84" rx="34" ry="18" fill="#ffffff" opacity="0.16" />
      <circle cx="78" cy="76" r="4.4" fill={b} opacity="0.75" />
      <circle cx="108" cy="90" r="3.6" fill={b} opacity="0.65" />
      <circle cx="116" cy="74" r="3" fill={b} opacity="0.55" />
      <circle cx="86" cy="94" r="2.6" fill={b} opacity="0.55" />
      <path
        d="M86 70 q12 4 12 14"
        stroke="#fffdf6"
        strokeWidth="3"
        fill="none"
        opacity="0.5"
        strokeLinecap="round"
      />
      <ellipse cx="152" cy="98" rx="16" ry="10" fill="#e0e5e0" />
      <ellipse cx="152" cy="96" rx="12" ry="7" fill={c} />
    </>
  ),

  /* --- open bowl: rabri, halwa, malai --- */
  bowl: ([a, b, c]) => (
    <>
      <path d="M44 72 q4 44 56 44 q52 0 56 -44 z" fill="#e7ebe6" />
      <path d="M49 77 q5 35 51 35 q46 0 51 -35 z" fill="#d4dad4" />
      <ellipse cx="100" cy="72" rx="56" ry="16" fill="#dfe4e0" />
      <ellipse cx="100" cy="71" rx="48" ry="13" fill={a} />
      <ellipse cx="100" cy="69" rx="38" ry="9.5" fill={b} opacity="0.55" />
      <g fill={c}>
        <ellipse
          cx="88"
          cy="66"
          rx="4"
          ry="2.6"
          transform="rotate(-20 88 66)"
        />
        <ellipse
          cx="108"
          cy="70"
          rx="4"
          ry="2.6"
          transform="rotate(14 108 70)"
        />
        <ellipse cx="99" cy="75" rx="3.4" ry="2.2" />
      </g>
      <path
        d="M62 62 q14 -6 24 -2"
        stroke="#ffffff"
        strokeWidth="3"
        opacity="0.4"
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),

  /* --- makhan mishri on a leaf --- */
  leaf: ([a, b, c]) => (
    <>
      <ellipse cx="100" cy="112" rx="64" ry="16" fill="#00000008" />
      <path
        d="M100 126 q-58 -14 -58 -46 q0 -32 58 -44 q58 12 58 44 q0 32 -58 46 z"
        fill={c}
      />
      <path
        d="M100 120 q-50 -13 -50 -40 q0 -28 50 -39 q50 11 50 39 q0 27 -50 40 z"
        fill={c}
        opacity="0.75"
      />
      <path d="M100 38 v84" stroke="#2f5525" strokeWidth="2.2" opacity="0.45" />
      <g stroke="#2f5525" strokeWidth="1.4" opacity="0.3">
        <path d="M100 58 l-22 10 M100 58 l22 10 M100 78 l-24 10 M100 78 l24 10 M100 98 l-18 8 M100 98 l18 8" />
      </g>
      <ellipse cx="100" cy="82" rx="30" ry="21" fill={b} />
      <ellipse cx="100" cy="78" rx="28" ry="20" fill={a} />
      <ellipse cx="92" cy="72" rx="10" ry="6" fill="#ffffff" opacity="0.7" />
      <g fill="#ffffff">
        <rect
          x="112"
          y="66"
          width="7"
          height="7"
          rx="1.5"
          transform="rotate(18 115 69)"
        />
        <rect
          x="84"
          y="90"
          width="6.5"
          height="6.5"
          rx="1.5"
          transform="rotate(-14 87 93)"
        />
        <rect
          x="106"
          y="92"
          width="6"
          height="6"
          rx="1.5"
          transform="rotate(26 109 95)"
        />
      </g>
    </>
  ),

  /* --- combo platter: two things on one plate --- */
  combo: ([a, b, c]) => (
    <>
      <ellipse cx="100" cy="100" rx="78" ry="40" fill="#e7ebe6" />
      <ellipse cx="100" cy="97" rx="69" ry="34" fill="#f7f8f5" />
      <path d="M100 63 a34 34 0 0 0 0 68 z" fill={a} opacity="0.25" />
      <circle cx="68" cy="86" r="21" fill={b} />
      <circle cx="68" cy="83" r="19" fill={a} />
      <circle cx="68" cy="83" r="11" fill="#ffffff" opacity="0.14" />
      <ellipse cx="128" cy="86" rx="26" ry="17" fill="#dfe4e0" />
      <ellipse cx="128" cy="84" rx="22" ry="14" fill={c} />
      <ellipse cx="128" cy="82" rx="15" ry="9" fill={c} opacity="0.7" />
      <ellipse cx="92" cy="114" rx="24" ry="11" fill="#e4d2ac" />
      <ellipse cx="92" cy="112" rx="18" ry="8" fill={b} opacity="0.75" />
      <circle cx="150" cy="110" r="9" fill={a} />
      <circle cx="150" cy="108" r="7.5" fill={b} />
    </>
  ),
};

export default function DishArt({ item, className = "", decorative = true }) {
  const render = ART[item.art] || ART.curry;
  const palette = item.palette || ["#e39a2a", "#c3771a", "#4a7a3b"];
  const gid = `bg-${item.id}`;

  return (
    <svg
      viewBox={V}
      className={className}
      role={decorative ? "presentation" : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `Illustration of ${item.name}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <radialGradient id={gid} cx="50%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#fffdf6" />
          <stop offset="100%" stopColor="#f3e6cd" />
        </radialGradient>
      </defs>
      <rect width="200" height="150" fill={`url(#${gid})`} />
      {/* faint jaali lattice, like light through a temple screen */}
      <g stroke="#0b3a38" strokeWidth="0.7" opacity="0.06">
        <path d="M-10 40 L40 -10 M-10 90 L90 -10 M-10 140 L140 -10 M40 160 L190 10 M90 160 L210 40 M140 160 L210 90" />
        <path d="M210 40 L160 -10 M210 90 L110 -10 M210 140 L60 -10 M160 160 L10 10 M110 160 L-10 40 M60 160 L-10 90" />
      </g>
      {render(palette)}
    </svg>
  );
}
