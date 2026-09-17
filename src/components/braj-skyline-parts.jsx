/**
 * Architectural parts for the Braj skyline.
 *
 * Modelled on what Vrindavan actually has standing — Madan Mohan and Govind Dev
 * (red-sandstone Nagara), Prem Mandir (Nagara in the Rajasthani–Gujarati manner:
 * 150 carved pillars, nine domes, seventeen kalash and a grand flag mast),
 * Rangji (a seven-storeyed Dravidian gopuram with its 50-ft dhwaja stambha),
 * and the jharokha-fronted havelis of Loi Bazaar.
 *
 * Terms used below are the ones the buildings themselves use:
 *   adhisthana   plinth mouldings          jangha      the wall above them
 *   devakoshtha  wall niche                pilaster    engaged half-column
 *   kapota       the eave / chhajja        kanguras    parapet merlons
 *   lata         vertical band up a spire  bhumi-amalaka  corner disc per storey
 *   gavaksha     horseshoe (chaitya) arch  shukanasa   antefix over the vestibule
 *   amalaka      ribbed crowning disc      kalasha     the pot above it
 *   tala         a gopuram storey          shala       its barrel-vaulted roof
 *   kuta         square corner cell        stupi       pot on a shala ridge
 *
 * Nothing here sets `opacity`. Solid shapes take the layer's tone; ornament and
 * openings take `.cut`, the same tone lightened, so overlaps never darken.
 */

import {
  rekhaHalf,
  rekhaPath,
  cuspedArch,
  gavaksha,
} from "./braj-skyline-geometry";

/* ------------------------------------------------------------- components */

/** Amalaka disc, kalasha pot, and the dhwaja above it. */
export function Kalasha({ cx, y, s = 1, flag = true, mast = true }) {
  return (
    <g transform={`translate(${cx} ${y}) scale(${s})`}>
      <rect x="-9" y="-4" width="18" height="4" />
      <ellipse cx="0" cy="-7" rx="11" ry="5" />
      <ellipse cx="0" cy="-12" rx="7.5" ry="3.6" />
      <rect x="-2.2" y="-18" width="4.4" height="7" />
      <path d="M0 -29 c-5.5 4.5 -5.5 10 0 12 c5.5 -2 5.5 -7.5 0 -12z" />
      {mast && <rect x="-1" y="-52" width="2" height="24" />}
      {flag && <path d="M1 -52 c7 2 11 2 16 5.5 c-5 3.5 -9 3.5 -16 5.5z" />}
    </g>
  );
}

/** Kapota — the eave that throws water clear of the wall. */
export function Kapota({ cx, y, w, t = 5 }) {
  return (
    <g>
      <rect x={cx - w / 2} y={y} width={w} height={t} />
      <rect x={cx - w / 2 - 4} y={y + t} width={w + 8} height={t * 0.5} />
    </g>
  );
}

/** Kanguras — the row of merlons along a parapet. */
export function Merlons({ x, y, width, n, h = 9 }) {
  const step = width / n;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const mx = x + step * (i + 0.5);
        return (
          <path
            key={i}
            d={`M${mx - step * 0.28} ${y} h${step * 0.56} v${-h * 0.45} l${-step * 0.14} ${-h * 0.25} v${-h * 0.3} h${-step * 0.28} v${h * 0.3} l${-step * 0.14} ${h * 0.25} z`}
          />
        );
      })}
    </g>
  );
}

/** Engaged half-column: base, shaft, lotus capital. */
export function Pilaster({ cx, base, h, w = 7 }) {
  return (
    <g>
      <rect
        x={cx - w * 0.85}
        y={base - w * 0.7}
        width={w * 1.7}
        height={w * 0.7}
      />
      <rect
        x={cx - w / 2}
        y={base - h + w * 0.8}
        width={w}
        height={h - w * 1.5}
      />
      <rect
        x={cx - w * 0.8}
        y={base - h + w * 0.3}
        width={w * 1.6}
        height={w * 0.5}
      />
      <rect x={cx - w} y={base - h} width={w * 2} height={w * 0.35} />
    </g>
  );
}

/** Devakoshtha — a wall niche between pilasters, with its gavaksha hood. */
export function Niche({ cx, base, w, h }) {
  return (
    <g>
      <path className="cut" d={cuspedArch(cx - w / 2, base, w, h, 5)} />
      <path d={gavaksha(cx, base - h, w * 0.78, h * 0.34)} />
      <Pilaster cx={cx - w * 0.72} base={base} h={h * 0.92} w={w * 0.2} />
      <Pilaster cx={cx + w * 0.72} base={base} h={h * 0.92} w={w * 0.2} />
    </g>
  );
}

/**
 * A rekha-shikhara temple: plinth mouldings, a carved wall, the spire with its
 * latas and corner bhumi-amalakas, the shukanasa antefix over the vestibule,
 * and urushringa half-spires clustered up its shoulders.
 */
export function Shikhara({ cx, base, w, h, cluster = true, detail = true }) {
  const half = w / 2;
  const wallH = detail ? h * 0.26 : h * 0.18;
  const spireBase = base - wallH;
  const spireH = h - wallH;
  const bhumis = [0.16, 0.33, 0.5, 0.66, 0.8];

  return (
    <g>
      {/* urushringa: the clustered half-spires */}
      {cluster && (
        <>
          {[-1, 1].map((sd) => (
            <g key={`o${sd}`}>
              <path
                d={rekhaPath(cx + sd * w * 0.88, base, w * 0.38, h * 0.38, 12)}
              />
              <Kalasha
                cx={cx + sd * w * 0.88}
                y={base - h * 0.38}
                s={w / 300}
                flag={false}
                mast={false}
              />
            </g>
          ))}
          {[-1, 1].map((sd) => (
            <g key={`i${sd}`}>
              <path
                d={rekhaPath(cx + sd * w * 0.55, base, w * 0.44, h * 0.6, 14)}
              />
              <Kalasha
                cx={cx + sd * w * 0.55}
                y={base - h * 0.6}
                s={w / 250}
                flag={false}
                mast={false}
              />
            </g>
          ))}
        </>
      )}

      {/* adhisthana — the stepped plinth */}
      <rect x={cx - half * 1.5} y={base - 7} width={w * 1.5} height="7" />
      <rect x={cx - half * 1.38} y={base - 12} width={w * 1.38} height="5" />
      <rect
        x={cx - half * 1.28}
        y={base - wallH}
        width={w * 1.28}
        height={wallH - 12}
      />

      {/* jangha — the carved wall, with its niche and pilasters */}
      {detail && (
        <>
          <Niche cx={cx} base={base - 12} w={w * 0.36} h={wallH * 0.62} />
          <Pilaster
            cx={cx - half * 1.08}
            base={base - 12}
            h={wallH * 0.74}
            w={w * 0.1}
          />
          <Pilaster
            cx={cx + half * 1.08}
            base={base - 12}
            h={wallH * 0.74}
            w={w * 0.1}
          />
          {/* the carved wall panels */}
          <g className="cut">
            <rect
              x={cx - half * 0.78}
              y={base - wallH + 4}
              width={w * 0.06}
              height={wallH * 0.3}
            />
            <rect
              x={cx + half * 0.72}
              y={base - wallH + 4}
              width={w * 0.06}
              height={wallH * 0.3}
            />
          </g>
          <Kapota cx={cx} y={base - wallH} w={w * 1.34} t={4.5} />
        </>
      )}

      {/* the spire */}
      <path d={rekhaPath(cx, spireBase, w, spireH)} />

      {/* latas — the vertical bands up its face */}
      <g className="cut">
        {[-0.44, 0.44].map((k, i) => (
          <path
            key={i}
            d={`M${cx + half * k} ${spireBase} L${cx + rekhaHalf(half, 0.9) * k * 1.9} ${spireBase - spireH * 0.9}`}
            stroke="currentColor"
            strokeWidth={Math.max(w * 0.022, 1.2)}
            fill="none"
          />
        ))}
      </g>

      {/* bhumi-amalakas stepping up each corner */}
      {detail &&
        bhumis.map((f, i) => {
          const dx = rekhaHalf(half, f);
          const y = spireBase - spireH * f;
          const r = Math.max(w * 0.075 * (1 - f * 0.45), 1.6);
          return (
            <g key={i}>
              <ellipse cx={cx - dx} cy={y} rx={r} ry={r * 0.52} />
              <ellipse cx={cx + dx} cy={y} rx={r} ry={r * 0.52} />
            </g>
          );
        })}

      {/* gavaksha band low on the spire, and the shukanasa over the vestibule */}
      {detail && (
        <>
          <path
            className="cut"
            d={gavaksha(cx, spireBase - spireH * 0.12, w * 0.3, spireH * 0.12)}
          />
          <path
            d={`M${cx - w * 0.3} ${spireBase} L${cx - w * 0.3} ${spireBase - spireH * 0.2} C${cx - w * 0.3} ${spireBase - spireH * 0.38} ${cx + w * 0.3} ${spireBase - spireH * 0.38} ${cx + w * 0.3} ${spireBase - spireH * 0.2} L${cx + w * 0.3} ${spireBase} Z`}
          />
          <path
            className="cut"
            d={gavaksha(cx, spireBase - spireH * 0.03, w * 0.19, spireH * 0.14)}
          />
        </>
      )}

      <Kalasha cx={cx} y={spireBase - spireH} s={w / 130} />
    </g>
  );
}

/**
 * Phamsana mandapa — the pillared hall under a stepped pyramidal roof, each
 * course battered in beneath its own kapota, with kuta cells at the corners.
 */
export function Mandapa({ cx, base, w, h, tiers = 5, detail = true }) {
  const wallH = h * 0.34;
  const roofH = h - wallH;
  const step = roofH / tiers;
  const wallTop = base - wallH;

  return (
    <g>
      <rect x={cx - w / 2 - 5} y={base - 6} width={w + 10} height="6" />
      <rect x={cx - w / 2} y={wallTop} width={w} height={wallH - 6} />
      <path
        className="cut"
        d={cuspedArch(cx - w * 0.2, base - 6, w * 0.4, wallH * 0.72, 5)}
      />
      {detail && (
        <>
          <Pilaster
            cx={cx - w * 0.38}
            base={base - 6}
            h={wallH * 0.8}
            w={w * 0.07}
          />
          <Pilaster
            cx={cx + w * 0.38}
            base={base - 6}
            h={wallH * 0.8}
            w={w * 0.07}
          />
        </>
      )}
      <Kapota cx={cx} y={wallTop} w={w * 1.16} t={4} />

      {Array.from({ length: tiers }, (_, i) => {
        const wBot = w * (1 - i * 0.16);
        const wTop = w * (1 - (i + 1) * 0.16);
        const yBot = wallTop - step * i;
        const yTop = wallTop - step * (i + 1);
        return (
          <g key={i}>
            <path
              d={`M${cx - wBot / 2} ${yBot} L${cx - wTop / 2} ${yTop} L${cx + wTop / 2} ${yTop} L${cx + wBot / 2} ${yBot} Z`}
            />
            <Kapota cx={cx} y={yTop} w={wTop * 1.22} t={step * 0.16} />
            {detail && i < tiers - 1 && (
              <path
                className="cut"
                d={gavaksha(cx, yBot - step * 0.2, wTop * 0.3, step * 0.4)}
              />
            )}
          </g>
        );
      })}

      <ellipse
        cx={cx}
        cy={wallTop - roofH - w * 0.04}
        rx={w * 0.14}
        ry={w * 0.07}
      />
      <Kalasha
        cx={cx}
        y={wallTop - roofH - w * 0.08}
        s={w / 190}
        flag={false}
        mast={false}
      />
    </g>
  );
}

/**
 * Dravidian gopuram, after Rangji: a battered tower of seven talas, each with
 * its row of kuta and shala cells, capped by a barrel-vaulted shala roof with
 * stupis along the ridge.
 */
export function Gopuram({ cx, base, w, h, talas = 7 }) {
  const doorH = h * 0.3;
  const towerH = h - doorH;
  const step = towerH / (talas + 1.2);
  const widthAt = (i) => w * (1 - (i / talas) * 0.42);

  return (
    <g>
      {/* the dwara, its jambs and its opening */}
      <rect x={cx - w / 2 - 6} y={base - 8} width={w + 12} height="8" />
      <rect x={cx - w / 2} y={base - doorH} width={w} height={doorH - 8} />
      <path
        className="cut"
        d={`M${cx - w * 0.15} ${base - 8} v${-doorH * 0.58} a${w * 0.15} ${w * 0.15} 0 0 1 ${w * 0.3} 0 v${doorH * 0.58} z`}
      />
      <Pilaster
        cx={cx - w * 0.38}
        base={base - 8}
        h={doorH * 0.8}
        w={w * 0.08}
      />
      <Pilaster
        cx={cx + w * 0.38}
        base={base - 8}
        h={doorH * 0.8}
        w={w * 0.08}
      />
      <Kapota cx={cx} y={base - doorH} w={w * 1.2} t={5} />

      {/* the talas */}
      {Array.from({ length: talas }, (_, i) => {
        const wBot = widthAt(i);
        const wTop = widthAt(i + 1);
        const yBot = base - doorH - step * i;
        const yTop = yBot - step;
        const cells = Math.max(3, 6 - Math.floor(i / 2));
        return (
          <g key={i}>
            <path
              d={`M${cx - wBot / 2} ${yBot} L${cx - wTop / 2} ${yTop} L${cx + wTop / 2} ${yTop} L${cx + wBot / 2} ${yBot} Z`}
            />
            {/* the row of shrine cells */}
            <g className="cut">
              {Array.from({ length: cells }, (_, c) => {
                const bx = cx - wTop / 2 + (wTop / cells) * (c + 0.5);
                const cw = (wTop / cells) * 0.46;
                return (
                  <rect
                    key={c}
                    x={bx - cw / 2}
                    y={yBot - step * 0.72}
                    width={cw}
                    height={step * 0.44}
                  />
                );
              })}
            </g>
            <Kapota cx={cx} y={yTop} w={wTop * 1.14} t={step * 0.17} />
            {/* karna-kutas at the corners */}
            <path
              d={`M${cx - wTop / 2 - 3} ${yTop} l3 ${-step * 0.34} l3 ${step * 0.34} z`}
            />
            <path
              d={`M${cx + wTop / 2 + 3} ${yTop} l-3 ${-step * 0.34} l-3 ${step * 0.34} z`}
            />
          </g>
        );
      })}

      {/* the barrel-vaulted shala roof and its stupis */}
      {(() => {
        const topW = widthAt(talas) * 1.06;
        const y = base - doorH - step * talas;
        const vault = step * 1.05;
        return (
          <g>
            <path
              d={`M${cx - topW / 2} ${y} v${-vault * 0.42} a${topW / 2} ${vault * 0.62} 0 0 1 ${topW} 0 v${vault * 0.42} z`}
            />
            <path
              className="cut"
              d={gavaksha(cx, y - vault * 0.1, topW * 0.28, vault * 0.42)}
            />
            {[-0.38, 0, 0.38].map((k, i) => (
              <Kalasha
                key={i}
                cx={cx + topW * k}
                y={y - vault * (k === 0 ? 1.0 : 0.86)}
                s={w / 260}
                flag={k === 0}
                mast={k === 0}
              />
            ))}
          </g>
        );
      })()}
    </g>
  );
}

/** A courtyard arcade: pillars, cusped arches, chhajja and a merlon parapet. */
export function Colonnade({ x, base, width, h, bays = 4, twoStorey = false }) {
  const bay = width / bays;
  const lower = twoStorey ? h * 0.56 : h;
  return (
    <g>
      <rect x={x - 5} y={base - 6} width={width + 10} height="6" />
      <rect x={x} y={base - lower} width={width} height={lower - 6} />
      {Array.from({ length: bays }, (_, i) => (
        <path
          key={i}
          className="cut"
          d={cuspedArch(
            x + i * bay + bay * 0.2,
            base - 6,
            bay * 0.6,
            lower * 0.74,
          )}
        />
      ))}
      {Array.from({ length: bays + 1 }, (_, i) => (
        <Pilaster
          key={`p${i}`}
          cx={x + i * bay}
          base={base - 6}
          h={lower * 0.86}
          w={bay * 0.1}
        />
      ))}
      <Kapota cx={x + width / 2} y={base - lower} w={width + 16} t={4.5} />

      {twoStorey && (
        <>
          <rect
            x={x + width * 0.04}
            y={base - h}
            width={width * 0.92}
            height={h - lower - 4}
          />
          {Array.from({ length: bays }, (_, i) => (
            <path
              key={`u${i}`}
              className="cut"
              d={cuspedArch(
                x + i * bay + bay * 0.28,
                base - lower - 4,
                bay * 0.44,
                (h - lower) * 0.66,
                5,
              )}
            />
          ))}
          <Kapota cx={x + width / 2} y={base - h} w={width * 0.98} t={4} />
        </>
      )}

      <Merlons x={x} y={base - h - 4} width={width} n={bays * 3} h={9} />
    </g>
  );
}

/** Jharokha — the bracketed balcony window under its own bangla eave. */
export function Jharokha({ cx, y, w = 26 }) {
  return (
    <g>
      <path className="cut" d={cuspedArch(cx - w / 2, y, w, w * 1.22, 5)} />
      {/* the railing and the brackets carrying it */}
      <rect x={cx - w / 2 - 5} y={y - 1} width={w + 10} height="5" />
      <g className="cut">
        {[-0.26, 0, 0.26].map((k, i) => (
          <rect key={i} x={cx + w * k - 0.9} y={y - 7} width="1.8" height="6" />
        ))}
      </g>
      <path d={`M${cx - w / 2 - 5} ${y + 4} l4 6 h${w + 2} l4 -6 z`} />
      {/* the bangla eave above */}
      <path
        d={`M${cx - w / 2 - 8} ${y - w * 1.3} q${w / 2 + 8} ${-w * 0.3} ${w + 16} 0 l-6 -9 q${-(w / 2 + 2)} ${-w * 0.18} ${-(w + 4)} 0 z`}
      />
      <Kalasha cx={cx} y={y - w * 1.52} s={w / 150} flag={false} mast={false} />
    </g>
  );
}

/** A Loi Bazaar haveli: two storeys of jharokhas under a merlon parapet. */
export function Haveli({ x, base, width, h, windows = 3 }) {
  return (
    <g>
      <rect x={x - 5} y={base - 7} width={width + 10} height="7" />
      <rect x={x} y={base - h} width={width} height={h - 7} />
      {Array.from({ length: windows }, (_, i) => {
        const cx = x + (width / windows) * (i + 0.5);
        return (
          <g key={i}>
            <path
              className="cut"
              d={cuspedArch(
                cx - width * 0.1,
                base - 7,
                width * 0.2,
                h * 0.3,
                5,
              )}
            />
            <Jharokha cx={cx} y={base - h * 0.52} w={width * 0.18} />
          </g>
        );
      })}
      <Kapota cx={x + width / 2} y={base - h} w={width + 18} t={5} />
      <Merlons x={x} y={base - h - 5} width={width} n={windows * 4} h={10} />
    </g>
  );
}

/** Dhwaja stambh — Rangji's flag mast, standing free before the temple. */
export function FlagMast({ cx, base, h }) {
  return (
    <g>
      <rect x={cx - 13} y={base - 7} width="26" height="7" />
      <rect x={cx - 9} y={base - 13} width="18" height="6" />
      <rect x={cx - 2.2} y={base - h} width="4.4" height={h - 13} />
      {[0.3, 0.55, 0.78].map((k, i) => (
        <rect key={i} x={cx - 5} y={base - h * k} width="10" height="3" />
      ))}
      <path
        d={`M${cx + 2.2} ${base - h} c15 4 23 4 34 9.5 c-11 6 -19 6 -34 9.5z`}
      />
      <ellipse cx={cx} cy={base - h - 6} rx="5" ry="4" />
    </g>
  );
}

/** Kadamba — Krishna's tree: forked trunk under a dense scalloped canopy. */
export function Kadamba({ cx, base, h }) {
  const r = h * 0.3;
  const crown = base - h + r * 0.95;
  const puffs = [
    [0, -r * 0.34, r * 0.82],
    [-r * 0.78, 0, r * 0.66],
    [r * 0.8, -r * 0.06, r * 0.62],
    [-r * 0.42, r * 0.5, r * 0.56],
    [r * 0.46, r * 0.52, r * 0.52],
    [-r * 0.5, -r * 0.78, r * 0.48],
    [r * 0.52, -r * 0.74, r * 0.46],
    [0, r * 0.72, r * 0.46],
  ];
  return (
    <g>
      {/* trunk and its forked branches */}
      <path
        d={`M${cx - 6} ${base} q2 ${-h * 0.3} 1 ${-h * 0.52} h10 q-1 ${h * 0.22} 1 ${h * 0.52} z`}
      />
      <g stroke="currentColor" fill="none" strokeLinecap="round">
        <path d={`M${cx} ${base - h * 0.5} q-8 -10 -17 -16`} strokeWidth="5" />
        <path d={`M${cx} ${base - h * 0.56} q9 -11 18 -17`} strokeWidth="5" />
        <path d={`M${cx} ${base - h * 0.62} v-14`} strokeWidth="4.5" />
      </g>
      {puffs.map(([dx, dy, pr], i) => (
        <circle key={i} cx={cx + dx} cy={crown + dy} r={pr} />
      ))}
      {/* kadamba blossom */}
      <g className="cut">
        {[
          [-r * 0.5, -r * 0.5],
          [r * 0.36, -r * 0.62],
          [-r * 0.1, r * 0.3],
          [r * 0.68, r * 0.1],
          [-r * 0.82, r * 0.12],
        ].map(([dx, dy], i) => (
          <circle key={i} cx={cx + dx} cy={crown + dy} r={r * 0.09} />
        ))}
      </g>
    </g>
  );
}

/** Tulsi in her masonry pot — in Vrindavan she stands in every courtyard. */
export function Tulsi({ cx, base, h }) {
  const potH = h * 0.44;
  return (
    <g>
      <rect x={cx - h * 0.26} y={base - 4} width={h * 0.52} height="4" />
      <path
        d={`M${cx - h * 0.2} ${base - 4} l${h * 0.04} ${-potH} h${h * 0.32} l${h * 0.04} ${potH} z`}
      />
      <rect x={cx - h * 0.24} y={base - potH - 5} width={h * 0.48} height="5" />
      <g>
        <path
          d={`M${cx} ${base - potH - 5} v${-h * 0.2}`}
          stroke="currentColor"
          strokeWidth="2.4"
          fill="none"
        />
        {[-1, 1].map((sd) => (
          <g key={sd}>
            <ellipse
              cx={cx + sd * h * 0.12}
              cy={base - potH - h * 0.2}
              rx={h * 0.1}
              ry={h * 0.13}
            />
            <ellipse
              cx={cx + sd * h * 0.06}
              cy={base - potH - h * 0.36}
              rx={h * 0.08}
              ry={h * 0.11}
            />
          </g>
        ))}
        <ellipse
          cx={cx}
          cy={base - potH - h * 0.42}
          rx={h * 0.09}
          ry={h * 0.12}
        />
      </g>
    </g>
  );
}

/** A peacock on the parapet — the bird that gave Krishna his crown feather. */
export function Peacock({ cx, base, s = 1 }) {
  return (
    <g transform={`translate(${cx} ${base}) scale(${s})`}>
      {/* trailing tail */}
      <path d="M-4 -12 c-16 2 -28 6 -38 13 c12 1 24 -1 36 -5z" />
      <ellipse cx="0" cy="-15" rx="9" ry="7.5" />
      <path d="M4 -19 c5 -4 6 -11 3 -16 c-4 -4 -9 -3 -10 2 c-1 5 2 9 4 12z" />
      <circle cx="8" cy="-36" r="3.4" />
      <path
        d="M10 -39 l1 -6 M8 -40 l-2 -6 M12 -38 l5 -4"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
      />
      <path d="M-2 -8 v7 M3 -8 v7" stroke="currentColor" strokeWidth="1.6" />
    </g>
  );
}
