/**
 * Geometry for the Braj skyline.
 *
 * Kept apart from the components (no component exports here) so React Fast
 * Refresh stays happy, and so the curves can be reasoned about on their own.
 */

/** Profile of a rekha spire: how far out the wall stands at height fraction f. */
export const rekhaHalf = (half, f) =>
  half * (0.13 + 0.87 * Math.pow(1 - f, 0.74));

/** Silhouette of a rekha shikhara, sampled off that profile. */
export const rekhaPath = (cx, base, w, h, steps = 18) => {
  const half = w / 2;
  const left = [];
  const right = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const dx = rekhaHalf(half, f);
    const y = base - h * f;
    left.push([cx - dx, y]);
    right.push([cx + dx, y]);
  }
  const d = [`M${left[0][0].toFixed(1)} ${left[0][1].toFixed(1)}`];
  left.slice(1).forEach(([x, y]) => d.push(`L${x.toFixed(1)} ${y.toFixed(1)}`));
  right
    .slice()
    .reverse()
    .forEach(([x, y]) => d.push(`L${x.toFixed(1)} ${y.toFixed(1)}`));
  d.push("Z");
  return d.join(" ");
};

const qbez = (p0, p1, p2, t) => {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
  ];
};

/** Multifoil (cusped) arch — the scalloped Rajasthani opening. */
export const cuspedArch = (x, base, w, h, lobes = 7) => {
  const spring = base - h * 0.42;
  const apex = [x + w / 2, base - h];
  const at = (t) =>
    t <= 0.5
      ? qbez([x, spring], [x, base - h * 0.94], apex, t / 0.5)
      : qbez(apex, [x + w, base - h * 0.94], [x + w, spring], (t - 0.5) / 0.5);

  const d = [`M${x} ${base}`, `L${x} ${spring}`];
  for (let i = 1; i <= lobes; i++) {
    const [px, py] = at(i / lobes);
    const [qx, qy] = at((i - 1) / lobes);
    const r = (Math.hypot(px - qx, py - qy) * 0.62).toFixed(1);
    d.push(`A${r} ${r} 0 0 0 ${px.toFixed(1)} ${py.toFixed(1)}`);
  }
  d.push(`L${x + w} ${base}`, "Z");
  return d.join(" ");
};

/** Gavaksha — the horseshoe chaitya-arch motif carved over niches and bands. */
export const gavaksha = (cx, base, w, h) => {
  const half = w / 2;
  return [
    `M${cx - half} ${base}`,
    `L${cx - half} ${base - h * 0.34}`,
    `C${cx - half} ${base - h * 1.02} ${cx + half} ${base - h * 1.02} ${cx + half} ${base - h * 0.34}`,
    `L${cx + half} ${base}`,
    `L${cx + half * 0.5} ${base}`,
    `L${cx + half * 0.5} ${base - h * 0.4}`,
    `C${cx + half * 0.5} ${base - h * 0.74} ${cx - half * 0.5} ${base - h * 0.74} ${cx - half * 0.5} ${base - h * 0.4}`,
    `L${cx - half * 0.5} ${base}`,
    "Z",
  ].join(" ");
};
