/* ============================================================
   charts.js — small dependency-free SVG plotter.
   Draws the curves Reiner draws on the blackboard: a swept x
   axis, several series, log axes where the quantity spans
   orders of magnitude, and a crosshair that reports values.
   ============================================================ */

const SERIES_COLORS = [
  'var(--c-compute)', 'var(--c-memory)', 'var(--c-total)',
  'var(--c-kv)', 'var(--c-good)', 'var(--c-net)',
];

const NS = 'http://www.w3.org/2000/svg';
function el(name, attrs = {}, text) {
  const n = document.createElementNS(NS, name);
  for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
  if (text !== undefined) n.textContent = text;
  return n;
}

/** Human-readable number for axis ticks and readouts. */
function fmtAxis(v) {
  if (!isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e12) return (v / 1e12).toFixed(a >= 1e13 ? 0 : 1) + 'T';
  if (a >= 1e9) return (v / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k';
  if (a >= 10) return v.toFixed(0);
  if (a >= 1) return v.toFixed(1);
  if (a >= 0.01) return v.toFixed(3);
  return v.toExponential(1);
}

function logTicks(min, max) {
  const out = [];
  const lo = Math.floor(Math.log10(min)), hi = Math.ceil(Math.log10(max));
  for (let e = lo; e <= hi; e++) {
    const v = Math.pow(10, e);
    if (v >= min * 0.999 && v <= max * 1.001) out.push(v);
  }
  if (out.length > 8) return out.filter((_, i) => i % 2 === 0);
  return out;
}

function linTicks(min, max, n = 5) {
  const span = max - min;
  if (span <= 0) return [min];
  const raw = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max * 1.0001; v += step) out.push(v);
  return out;
}

/**
 * Render an xy chart.
 * @param {object} cfg
 *   cfg.xLabel, cfg.yLabel, cfg.xMin, cfg.xMax, cfg.xLog, cfg.yLog
 *   cfg.series: [{label, color, fn(x)->y, dashed, width}]
 *   cfg.markers: [{x, label, color}]  vertical reference lines
 *   cfg.cursorX: highlight this x
 */
function renderChart(cfg) {
  const W = 620, H = 300;
  const M = { t: 14, r: 16, b: 40, l: 58 };
  const iw = W - M.l - M.r, ih = H - M.t - M.b;
  const N = 240;

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `${cfg.yLabel || 'y'} against ${cfg.xLabel || 'x'}`,
  });

  const xLog = !!cfg.xLog;
  let xMin = cfg.xMin, xMax = cfg.xMax;
  if (xLog) { xMin = Math.max(xMin, 1e-12); xMax = Math.max(xMax, xMin * 10); }

  const tx = (v) => xLog
    ? M.l + (Math.log10(v) - Math.log10(xMin)) / (Math.log10(xMax) - Math.log10(xMin)) * iw
    : M.l + (v - xMin) / (xMax - xMin) * iw;

  // sample every series
  const xs = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    xs.push(xLog
      ? Math.pow(10, Math.log10(xMin) + t * (Math.log10(xMax) - Math.log10(xMin)))
      : xMin + t * (xMax - xMin));
  }
  const data = cfg.series.map((s) => xs.map((x) => {
    let y;
    try { y = s.fn(x); } catch { y = NaN; }
    return (typeof y === 'number' && isFinite(y)) ? y : null;
  }));

  // y range
  let yMin = Infinity, yMax = -Infinity;
  for (const row of data) for (const y of row) {
    if (y === null) continue;
    if (cfg.yLog && y <= 0) continue;
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }
  if (!isFinite(yMin) || !isFinite(yMax)) { yMin = 0; yMax = 1; }
  const yLog = !!cfg.yLog && yMin > 0;
  if (yLog) { yMax *= 1.6; yMin /= 1.6; }
  else {
    if (yMax === yMin) { yMax = yMin + 1; }
    const pad = (yMax - yMin) * 0.10;
    yMax += pad;
    yMin = cfg.yZero === false ? yMin - pad : Math.min(0, yMin);
  }

  const ty = (v) => yLog
    ? M.t + ih - (Math.log10(v) - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin)) * ih
    : M.t + ih - (v - yMin) / (yMax - yMin) * ih;

  // grid + axes
  const g = el('g');
  const yT = yLog ? logTicks(yMin, yMax) : linTicks(yMin, yMax, 5);
  for (const v of yT) {
    const y = ty(v);
    if (!isFinite(y)) continue;
    g.appendChild(el('line', { x1: M.l, x2: M.l + iw, y1: y, y2: y, stroke: 'currentColor', 'stroke-opacity': v === 0 ? .22 : .08 }));
    g.appendChild(el('text', { x: M.l - 8, y: y + 3.5, 'text-anchor': 'end', fill: 'currentColor', 'fill-opacity': .5, 'font-size': 10, 'font-family': 'var(--mono)' }, fmtAxis(v)));
  }
  const xT = xLog ? logTicks(xMin, xMax) : linTicks(xMin, xMax, 6);
  for (const v of xT) {
    const x = tx(v);
    if (!isFinite(x)) continue;
    g.appendChild(el('line', { x1: x, x2: x, y1: M.t, y2: M.t + ih, stroke: 'currentColor', 'stroke-opacity': .07 }));
    g.appendChild(el('text', { x, y: M.t + ih + 15, 'text-anchor': 'middle', fill: 'currentColor', 'fill-opacity': .5, 'font-size': 10, 'font-family': 'var(--mono)' }, fmtAxis(v)));
  }
  g.appendChild(el('line', { x1: M.l, x2: M.l, y1: M.t, y2: M.t + ih, stroke: 'currentColor', 'stroke-opacity': .25 }));
  g.appendChild(el('line', { x1: M.l, x2: M.l + iw, y1: M.t + ih, y2: M.t + ih, stroke: 'currentColor', 'stroke-opacity': .25 }));
  svg.appendChild(g);

  // axis labels
  if (cfg.xLabel) svg.appendChild(el('text', { x: M.l + iw / 2, y: H - 5, 'text-anchor': 'middle', fill: 'currentColor', 'fill-opacity': .62, 'font-size': 11 }, cfg.xLabel));
  if (cfg.yLabel) svg.appendChild(el('text', { x: 12, y: M.t + ih / 2, 'text-anchor': 'middle', fill: 'currentColor', 'fill-opacity': .62, 'font-size': 11, transform: `rotate(-90 12 ${M.t + ih / 2})` }, cfg.yLabel));

  // vertical markers (balance points, the "Goldilocks" line, etc.)
  for (const m of cfg.markers || []) {
    if (!isFinite(m.x) || m.x < xMin || m.x > xMax) continue;
    const x = tx(m.x);
    svg.appendChild(el('line', { x1: x, x2: x, y1: M.t, y2: M.t + ih, stroke: m.color || 'var(--c-good)', 'stroke-width': 1.5, 'stroke-dasharray': '4 4', 'stroke-opacity': .8 }));
    if (m.label) {
      const flip = x > M.l + iw - 90;
      svg.appendChild(el('text', {
        x: flip ? x - 6 : x + 6, y: M.t + 12, 'text-anchor': flip ? 'end' : 'start',
        fill: m.color || 'var(--c-good)', 'font-size': 10, 'font-weight': 700, 'font-family': 'var(--mono)',
      }, m.label));
    }
  }

  // series
  cfg.series.forEach((s, si) => {
    const row = data[si];
    let d = '', pen = false;
    for (let i = 0; i <= N; i++) {
      const y = row[i];
      if (y === null || (yLog && y <= 0)) { pen = false; continue; }
      const px = tx(xs[i]), py = Math.max(M.t - 20, Math.min(M.t + ih + 20, ty(y)));
      if (!isFinite(px) || !isFinite(py)) { pen = false; continue; }
      d += (pen ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1) + ' ';
      pen = true;
    }
    if (!d) return;
    svg.appendChild(el('path', {
      d, fill: 'none',
      stroke: s.color || SERIES_COLORS[si % SERIES_COLORS.length],
      'stroke-width': s.width || (s.emphasis ? 3 : 2),
      'stroke-dasharray': s.dashed ? '5 4' : null,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      'stroke-opacity': s.faint ? .5 : 1,
    }));
  });

  // cursor: where the reader's current control value sits
  if (isFinite(cfg.cursorX) && cfg.cursorX >= xMin && cfg.cursorX <= xMax) {
    const x = tx(cfg.cursorX);
    svg.appendChild(el('line', { x1: x, x2: x, y1: M.t, y2: M.t + ih, stroke: 'currentColor', 'stroke-opacity': .3, 'stroke-width': 1 }));
    cfg.series.forEach((s, si) => {
      let y; try { y = s.fn(cfg.cursorX); } catch { return; }
      if (!isFinite(y) || (yLog && y <= 0)) return;
      const py = ty(y);
      if (!isFinite(py) || py < M.t - 2 || py > M.t + ih + 2) return;
      svg.appendChild(el('circle', {
        cx: x, cy: py, r: 3.6,
        fill: s.color || SERIES_COLORS[si % SERIES_COLORS.length],
        stroke: 'var(--slate-900)', 'stroke-width': 1.5,
      }));
    });
  }

  return svg;
}

/** A simple horizontal bar comparison (for cost-tier style visuals). */
function renderBars(cfg) {
  const rows = cfg.rows.filter((r) => isFinite(r.value));
  const W = 620, rowH = 34, M = { t: 8, r: 70, b: 8, l: cfg.labelW || 150 };
  const H = M.t + rows.length * rowH + M.b;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': cfg.label || 'comparison' });
  const iw = W - M.l - M.r;
  const log = !!cfg.log;
  const vals = rows.map((r) => Math.abs(r.value)).filter((v) => v > 0);
  const max = Math.max(...vals, 1e-30);
  const min = Math.min(...vals, max);
  const width = (v) => {
    if (v <= 0) return 0;
    if (!log) return (v / max) * iw;
    const lo = Math.log10(Math.min(min, max / 1e4)), hi = Math.log10(max);
    return Math.max(2, (Math.log10(v) - lo) / (hi - lo) * iw);
  };

  rows.forEach((r, i) => {
    const y = M.t + i * rowH;
    svg.appendChild(el('text', { x: M.l - 10, y: y + rowH / 2 + 4, 'text-anchor': 'end', fill: 'currentColor', 'fill-opacity': .72, 'font-size': 11.5 }, r.label));
    svg.appendChild(el('rect', { x: M.l, y: y + 7, width: iw, height: rowH - 16, rx: 4, fill: 'currentColor', 'fill-opacity': .05 }));
    svg.appendChild(el('rect', {
      x: M.l, y: y + 7, width: width(Math.abs(r.value)), height: rowH - 16, rx: 4,
      fill: r.color || SERIES_COLORS[i % SERIES_COLORS.length], 'fill-opacity': r.faint ? .45 : .85,
    }));
    svg.appendChild(el('text', {
      x: M.l + iw + 8, y: y + rowH / 2 + 4, fill: r.color || 'currentColor',
      'fill-opacity': .95, 'font-size': 11, 'font-family': 'var(--mono)', 'font-weight': 600,
    }, r.display !== undefined ? r.display : fmtAxis(r.value)));
  });
  return svg;
}

window.Charts = { renderChart, renderBars, fmtAxis, SERIES_COLORS, el };
