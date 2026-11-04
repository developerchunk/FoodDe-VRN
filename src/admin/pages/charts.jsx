import { useEffect, useRef, useState } from "react";
import { bucketLabel, n0, niceMax } from "./chartFormat";
import "./analytics.css";

/**
 * The pieces the super admin's report pages are drawn from: headline tiles,
 * single-series columns and plain tables. Brand teal for the data, ink for
 * everything else.
 */

export function Delta({ now, prev, invert }) {
  if (prev == null || n0(prev) === 0) return <span className="adm-an-delta">—</span>;
  const change = (n0(now) - n0(prev)) / n0(prev);
  const up = change > 0;
  const good = invert ? !up : up;
  if (Math.abs(change) < 0.005) return <span className="adm-an-delta">no change</span>;
  return (
    <span className={`adm-an-delta ${good ? "is-good" : "is-bad"}`}>
      {up ? "▲" : "▼"} {Math.abs(Math.round(change * 100))}%
    </span>
  );
}

export function Tile({ label, value, now, prev, invert, foot }) {
  return (
    <div className="adm-an-tile">
      <span className="adm-an-tile__label">{label}</span>
      <strong className="adm-an-tile__value">{value}</strong>
      <span className="adm-an-tile__foot">
        {now !== undefined && <Delta now={now} prev={prev} invert={invert} />} {foot}
      </span>
    </div>
  );
}

/**
 * Columns over time, one series. Hover or focus a column for its exact value;
 * a hidden table carries the same numbers for screen readers.
 */
/* Drawn at the container's real width, so axis text stays 11px on a phone
   instead of being scaled down with a fixed viewBox. */
function useWidth(fallback) {
  const ref = useRef(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function Columns({ title, series, unit, valueOf, format, integer }) {
  const [hover, setHover] = useState(null);
  const [plotRef, W] = useWidth(720);
  const H = 220;
  const pad = { l: 52, r: 8, t: 12, b: 28 };
  const values = series.map(valueOf);
  const max = niceMax(Math.max(0, ...values));
  const band = (W - pad.l - pad.r) / Math.max(series.length, 1);
  const barW = Math.min(24, Math.max(3, band - 2));
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  /* A count has no half orders: drop a fractional middle tick. */
  const ticks = [0, max / 2, max].filter((t) => !integer || Number.isInteger(t));
  /* Label every nth bucket so the axis never collides with itself. */
  const every = Math.ceil(series.length / Math.max(3, Math.floor(W / 80)));
  const peak = values.indexOf(Math.max(...values));

  return (
    <figure className="adm-an-chart">
      <figcaption>{title}</figcaption>
      <div className="adm-an-chart__plot" ref={plotRef}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="adm-an-grid" />
              <text x={pad.l - 8} y={y(t) + 4} className="adm-an-axis" textAnchor="end">
                {format(t, true)}
              </text>
            </g>
          ))}
          {series.map((b, i) => {
            const v = values[i];
            const x = pad.l + band * i + (band - barW) / 2;
            const top = y(v);
            const h = Math.max(0, H - pad.b - top);
            const r = Math.min(4, h, barW / 2);
            return (
              <g key={b.at}>
                {h > 0 && (
                  /* 4px rounded data-end, square at the baseline */
                  <path
                    className={`adm-an-bar ${hover === i ? "is-hover" : ""}`}
                    d={`M${x},${H - pad.b} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${H - pad.b} Z`}
                  />
                )}
                {i % every === 0 && (
                  <text x={pad.l + band * i + band / 2} y={H - 8} className="adm-an-axis" textAnchor="middle">
                    {bucketLabel(b.at, unit)}
                  </text>
                )}
                {/* the hit target is the whole column of the band, not the bar */}
                <rect
                  x={pad.l + band * i}
                  y={pad.t}
                  width={band}
                  height={H - pad.t - pad.b}
                  fill="transparent"
                  tabIndex={0}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  aria-label={`${bucketLabel(b.at, unit, true)}: ${format(v)}`}
                />
              </g>
            );
          })}
          {values[peak] > 0 && hover == null && (
            /* The one direct label: the busiest bucket. Anchored inward near
               either edge so it is never clipped. */
            <text
              x={pad.l + band * peak + band / 2}
              y={Math.max(pad.t + 10, y(values[peak]) - 6)}
              className="adm-an-peak"
              textAnchor={peak > series.length * 0.85 ? "end" : peak < series.length * 0.15 ? "start" : "middle"}
            >
              {format(values[peak])}
            </text>
          )}
        </svg>
        {hover != null && (
          <div
            className="adm-an-tip"
            style={{ left: Math.min(Math.max(pad.l + band * hover + band / 2, 70), W - 70) }}
            role="status"
          >
            <span>{bucketLabel(series[hover].at, unit, true)}</span>
            <strong>{format(values[hover])}</strong>
          </div>
        )}
      </div>
      <table className="sr-only">
        <tbody>
          {series.map((b, i) => (
            <tr key={b.at}>
              <th>{bucketLabel(b.at, unit, true)}</th>
              <td>{format(values[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/* A sortable-looking but deliberately plain table: the numbers are the point. */
export function Table({ title, sub, columns, rows, empty, limit }) {
  const [all, setAll] = useState(false);
  const shown = limit && !all ? rows.slice(0, limit) : rows;
  return (
    <section className="adm-an-section">
      <h2>{title}</h2>
      {sub && <p className="adm-muted">{sub}</p>}
      {rows.length === 0 ? (
        <p className="adm-state">{empty}</p>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.label} className={c.num ? "num" : ""}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.id ?? r.code ?? i} className={r.is_active === false || r.is_available === false ? "is-off" : ""}>
                  {columns.map((c, j) => (
                    <td
                      key={c.label}
                      className={j === 0 ? "adm-cell-main" : c.num ? "num" : ""}
                      data-label={j === 0 ? undefined : c.label}
                    >
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {limit && rows.length > limit && (
        <button type="button" className="btn btn-ghost adm-btn-sm adm-an-more" onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </section>
  );
}
