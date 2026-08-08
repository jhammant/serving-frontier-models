/* ============================================================
   diagrams.js — the drawings that a generic xy-chart cannot make.

   These are the blackboard pictures: a rack with its NVSwitch
   spine and all-to-all traffic, the pipeline bubble gantt, the
   memory-tier ladder, and the Feistel/RevNet invertible layer.

   Each renderer receives {spec, state, values, cfg} and returns
   an <svg>. They read control values by trying a list of likely
   ids, so they keep working whatever the spec names them.
   ============================================================ */

// Wrapped in an IIFE: these are classic scripts sharing one global scope, and
// charts.js already declares `el` there.
(() => {
const { el } = Charts;

/** Read a control value by any of several candidate names. */
function pick(state, names, fallback) {
  for (const n of names) {
    if (state[n] !== undefined && isFinite(state[n])) return state[n];
  }
  // loose match: first key containing one of the names, case-insensitive
  const keys = Object.keys(state);
  for (const n of names) {
    const k = keys.find((k) => k.toLowerCase().includes(n.toLowerCase()));
    if (k && isFinite(state[k])) return state[k];
  }
  return fallback;
}

function text(x, y, str, o = {}) {
  return el('text', {
    x, y, fill: o.fill || 'currentColor', 'fill-opacity': o.op !== undefined ? o.op : .8,
    'font-size': o.size || 11, 'text-anchor': o.anchor || 'start',
    'font-family': o.mono ? 'var(--mono)' : 'inherit',
    'font-weight': o.weight || 400,
  }, str);
}

/* ───────────────────────── rack / MoE all-to-all ───────────────────────── */

function rackDiagram({ state }) {
  const racks = Math.max(1, Math.round(pick(state, ['racks', 'numRacks', 'rackCount', 'pipelineStages'], 1)));
  const gpus = Math.max(2, Math.round(pick(state, ['gpusPerRack', 'scaleUpSize', 'gpus', 'expertParallel'], 8)));
  const totalExperts = Math.round(pick(state, ['totalExperts', 'numExperts', 'experts'], 256));
  const activeExperts = Math.round(pick(state, ['activeExperts', 'topK', 'expertsActive'], 8));
  const cablesPerGpu = pick(state, ['cablesPerGpu', 'cablesPerXpu', 'cables'], 0);

  // more GPUs in the rack -> visibly more cable into the same switch spine
  const shown = Math.max(4, Math.min(racks > 1 ? 8 : 16, Math.round(gpus / 8) * 2));
  const W = 620;
  const rackW = Math.min(268, (W - 30) / racks - 14);
  const H = 262;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Mixture-of-experts laid out across GPU racks' });

  const crossFrac = racks > 1 ? (racks - 1) / racks : 0;

  for (let r = 0; r < racks; r++) {
    const x0 = 14 + r * (rackW + 14);
    const g = el('g');

    // rack shell
    g.appendChild(el('rect', {
      x: x0, y: 26, width: rackW, height: 176, rx: 8,
      fill: 'currentColor', 'fill-opacity': .03,
      stroke: 'var(--c-net)', 'stroke-opacity': .45, 'stroke-width': 1.5,
    }));
    g.appendChild(text(x0 + rackW / 2, 18, `Rack ${r + 1}`, { anchor: 'middle', size: 10.5, weight: 700, fill: 'var(--c-net)', op: .95 }));

    // NVSwitch spine down the middle
    const sx = x0 + rackW / 2;
    g.appendChild(el('rect', { x: sx - 26, y: 100, width: 52, height: 28, rx: 5, fill: 'var(--c-net)', 'fill-opacity': .22, stroke: 'var(--c-net)', 'stroke-opacity': .8 }));
    g.appendChild(text(sx, 118, 'switch', { anchor: 'middle', size: 9.5, fill: 'var(--c-net)', op: 1, weight: 700 }));

    // GPUs: half above the spine, half below
    const per = Math.ceil(shown / 2);
    const cellW = (rackW - 24) / per;
    for (let i = 0; i < shown; i++) {
      const row = i < per ? 0 : 1;
      const col = i % per;
      const gx = x0 + 12 + col * cellW + cellW / 2;
      const gy = row === 0 ? 52 : 168;
      const active = i < Math.max(1, Math.round(shown * Math.min(1, activeExperts / Math.max(1, totalExperts) * gpus)));

      // one drawn strand per few real cables — the bundle thickens as the rack grows
      const strands = Math.max(1, Math.min(5, Math.round(cablesPerGpu / 18) || 1));
      for (let c = 0; c < strands; c++) {
        const off = (c - (strands - 1) / 2) * 2.2;
        g.appendChild(el('line', {
          x1: gx + off, y1: row === 0 ? gy + 12 : gy - 12, x2: sx + off * 2, y2: row === 0 ? 100 : 128,
          stroke: 'var(--c-net)', 'stroke-opacity': active ? .6 : .18, 'stroke-width': active ? 1.4 : .9,
        }));
      }
      g.appendChild(el('rect', {
        x: gx - cellW / 2 + 3, y: gy - 12, width: cellW - 6, height: 24, rx: 4,
        fill: active ? 'var(--c-good)' : 'currentColor',
        'fill-opacity': active ? .22 : .06,
        stroke: active ? 'var(--c-good)' : 'currentColor',
        'stroke-opacity': active ? .7 : .18,
      }));
      g.appendChild(text(gx, gy + 4, 'E', { anchor: 'middle', size: 10, mono: true, op: active ? .95 : .35, fill: active ? 'var(--c-good)' : 'currentColor' }));
    }
    svg.appendChild(g);

    // cross-rack link
    if (r < racks - 1) {
      const lx = x0 + rackW, rx = lx + 14;
      svg.appendChild(el('path', {
        d: `M ${lx} 114 L ${rx} 114`,
        stroke: 'var(--c-total)', 'stroke-width': 3, 'stroke-dasharray': '3 3', 'stroke-opacity': .9,
      }));
    }
  }

  // legend / verdict strip
  const verdict = racks === 1
    ? 'All-to-all stays on the fast scale-up fabric. This is the good case.'
    : `${Math.round(crossFrac * 100)}% of routed tokens must cross the rack boundary on a link ~8× slower.`;
  svg.appendChild(el('rect', {
    x: 14, y: 214, width: W - 28, height: 34, rx: 7,
    fill: racks === 1 ? 'var(--c-good)' : 'var(--c-total)', 'fill-opacity': .1,
    stroke: racks === 1 ? 'var(--c-good)' : 'var(--c-total)', 'stroke-opacity': .35,
  }));
  svg.appendChild(text(26, 229, racks === 1 ? '✓ one scale-up domain' : '✕ split across racks', {
    size: 10.5, weight: 700, fill: racks === 1 ? 'var(--c-good)' : 'var(--c-total)', op: 1,
  }));
  svg.appendChild(text(26, 242, verdict, { size: 11, op: .72 }));

  return svg;
}

/* ───────────────────────── pipeline bubble gantt ───────────────────────── */

function ganttTimeline({ state }) {
  const stages = Math.max(1, Math.min(8, Math.round(pick(state, ['stages', 'pipelineStages', 'numStages', 'racks'], 4))));
  const micro = Math.max(1, Math.min(16, Math.round(pick(state, ['micro', 'microbatches', 'numMicrobatches', 'microBatches'], stages))));
  const training = pick(state, ['sync', 'training', 'isTraining', 'showBackward', 'backward'], 0) >= 1;

  const W = 620;
  const rowH = 30, padL = 74, padT = 26;
  const slots = training ? micro * 2 + stages : micro + stages;
  const cellW = Math.max(11, Math.min(40, (W - padL - 18) / slots));
  const H = padT + stages * rowH + 54;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Pipeline schedule showing bubbles' });

  svg.appendChild(text(padL, 15, training ? 'Training — forward, hard stop, then backward' : 'Inference decode — the loop wraps straight around', { size: 10.5, op: .6 }));

  let bubbles = 0, busy = 0;

  for (let s = 0; s < stages; s++) {
    const y = padT + s * rowH;
    svg.appendChild(text(padL - 10, y + rowH / 2 + 4, `rack ${s + 1}`, { anchor: 'end', size: 10.5, mono: true, op: .55 }));
    svg.appendChild(el('rect', { x: padL, y: y + 3, width: slots * cellW, height: rowH - 8, rx: 3, fill: 'currentColor', 'fill-opacity': .035 }));

    for (let t = 0; t < slots; t++) {
      const x = padL + t * cellW;
      // forward pass m occupies stage s at time m + s
      const fwdM = t - s;
      const fwdOk = fwdM >= 0 && fwdM < micro;
      // backward: after the barrier at micro + stages, runs in reverse stage order
      const bwdStart = micro + stages;
      const bwdM = t - bwdStart - (stages - 1 - s);
      const bwdOk = training && bwdM >= 0 && bwdM < micro;

      if (fwdOk || bwdOk) {
        busy++;
        svg.appendChild(el('rect', {
          x: x + 1, y: y + 5, width: cellW - 2, height: rowH - 12, rx: 2.5,
          fill: bwdOk ? 'var(--c-kv)' : 'var(--c-memory)', 'fill-opacity': .8,
        }));
        if (cellW >= 18) {
          svg.appendChild(text(x + cellW / 2, y + rowH / 2 + 3.5, String(bwdOk ? bwdM : fwdM), {
            anchor: 'middle', size: 9.5, mono: true, op: .95, fill: 'var(--slate-900)', weight: 700,
          }));
        }
      } else {
        bubbles++;
        svg.appendChild(el('rect', {
          x: x + 1, y: y + 5, width: cellW - 2, height: rowH - 12, rx: 2.5,
          fill: 'var(--c-total)', 'fill-opacity': .14,
          stroke: 'var(--c-total)', 'stroke-opacity': .22, 'stroke-dasharray': '2 2',
        }));
      }
    }
  }

  if (training) {
    const bx = padL + (micro + stages) * cellW;
    svg.appendChild(el('line', { x1: bx, y1: padT, x2: bx, y2: padT + stages * rowH, stroke: 'var(--c-compute)', 'stroke-width': 2, 'stroke-dasharray': '4 3' }));
    svg.appendChild(text(bx + 4, padT - 4, 'batch barrier', { size: 9.5, fill: 'var(--c-compute)', op: 1, weight: 700 }));
  }

  const util = busy / (busy + bubbles);
  const fy = padT + stages * rowH + 14;
  svg.appendChild(el('rect', { x: padL, y: fy, width: (W - padL - 18) * util, height: 8, rx: 4, fill: 'var(--c-good)', 'fill-opacity': .8 }));
  svg.appendChild(el('rect', { x: padL + (W - padL - 18) * util, y: fy, width: (W - padL - 18) * (1 - util), height: 8, rx: 4, fill: 'var(--c-total)', 'fill-opacity': .3 }));
  svg.appendChild(text(padL - 10, fy + 7.5, 'busy', { anchor: 'end', size: 10, op: .5 }));
  svg.appendChild(text(padL, fy + 26, `${(util * 100).toFixed(0)}% of rack-time doing work · ${bubbles} bubble slots`, { size: 11, op: .7 }));
  svg.appendChild(text(W - 18, fy + 26, training ? 'backward' : 'forward', { anchor: 'end', size: 10, op: .5 }));

  return svg;
}

/* ───────────────────────── memory tier ladder ───────────────────────── */

const TIERS = [
  { name: 'HBM',          drain: 0.02,   note: 'on-package, ~20 ms to read all of it', color: 'var(--c-compute)' },
  { name: 'DDR (host)',   drain: 5,      note: 'order of seconds', color: 'var(--c-memory)' },
  { name: 'Flash',        drain: 60,     note: 'order of a minute', color: 'var(--c-kv)' },
  { name: 'Spinning disk',drain: 3600,   note: 'order of an hour', color: 'var(--c-total)' },
];

function memoryStack({ state }) {
  const holdSec = pick(state, ['holdSeconds', 'holdTime', 'cacheTtl', 'ttl', 'seconds'], 300);

  const W = 620, rowH = 46, padT = 30;
  const H = padT + TIERS.length * rowH + 42;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Memory tiers by drain time' });

  svg.appendChild(text(14, 16, 'Pick the tier whose drain time ≈ how long you hold the KV cache', { size: 11, op: .62 }));

  // choose the tier whose drain time is closest (in log space) to the hold time
  let best = 0, bestD = Infinity;
  TIERS.forEach((t, i) => {
    const d = Math.abs(Math.log10(t.drain) - Math.log10(Math.max(holdSec, 1e-3)));
    if (d < bestD) { bestD = d; best = i; }
  });

  const lo = Math.log10(0.01), hi = Math.log10(7200);
  const barX = 190, barW = W - barX - 92;
  const pos = (s) => barX + (Math.log10(Math.max(s, 0.01)) - lo) / (hi - lo) * barW;

  TIERS.forEach((t, i) => {
    const y = padT + i * rowH;
    const on = i === best;
    svg.appendChild(el('rect', {
      x: 12, y: y + 3, width: W - 24, height: rowH - 8, rx: 7,
      fill: on ? t.color : 'currentColor', 'fill-opacity': on ? .1 : .03,
      stroke: on ? t.color : 'currentColor', 'stroke-opacity': on ? .55 : .1,
    }));
    svg.appendChild(text(24, y + 20, t.name, { size: 13, weight: 700, op: on ? 1 : .6, fill: on ? t.color : 'currentColor' }));
    svg.appendChild(text(24, y + 34, t.note, { size: 10.5, op: .45 }));

    // drain-time position on the log axis
    const px = pos(t.drain);
    svg.appendChild(el('line', { x1: barX, y1: y + rowH / 2, x2: barX + barW, y2: y + rowH / 2, stroke: 'currentColor', 'stroke-opacity': .08 }));
    svg.appendChild(el('circle', { cx: px, cy: y + rowH / 2, r: on ? 7 : 4.5, fill: t.color, 'fill-opacity': on ? .95 : .45 }));
    svg.appendChild(text(W - 76, y + rowH / 2 + 4, fmtDur(t.drain), { size: 10.5, mono: true, op: on ? .95 : .5, fill: on ? t.color : 'currentColor' }));
  });

  // the reader's hold time as a vertical line across the ladder
  const hx = pos(holdSec);
  svg.appendChild(el('line', { x1: hx, y1: padT - 4, x2: hx, y2: padT + TIERS.length * rowH, stroke: 'var(--chalk)', 'stroke-width': 2, 'stroke-dasharray': '4 3', 'stroke-opacity': .8 }));
  svg.appendChild(text(hx, H - 24, `hold for ${fmtDur(holdSec)}`, { anchor: 'middle', size: 10.5, mono: true, op: .9 }));
  svg.appendChild(text(14, H - 6, `→ store it in ${TIERS[best].name}`, { size: 11.5, weight: 700, fill: TIERS[best].color, op: 1 }));

  return svg;
}

function fmtDur(s) {
  if (s < 1) return (s * 1000).toFixed(0) + ' ms';
  if (s < 90) return s.toFixed(s < 10 ? 1 : 0) + ' s';
  if (s < 5400) return (s / 60).toFixed(s < 600 ? 1 : 0) + ' min';
  return (s / 3600).toFixed(1) + ' h';
}

/* ───────────────────────── Feistel / RevNet ───────────────────────── */

function feistel({ state }) {
  const inverse = pick(state, ['inverse', 'reverse', 'backward', 'direction'], 0) >= 1;
  const W = 620, H = 250;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Feistel / reversible layer construction' });

  const dir = inverse ? -1 : 1;
  const colX = inverse ? [470, 300, 130] : [130, 300, 470];
  const c = inverse ? 'var(--c-kv)' : 'var(--c-memory)';

  svg.appendChild(text(14, 18, inverse
    ? 'Running it backwards: recover x, then y = z − f(x). Nothing had to be stored.'
    : 'Forwards: z = y + f(x), and x is carried through so the step stays invertible.',
    { size: 11.5, op: .7 }));

  const box = (x, y, w, h, label, fill, stroke) => {
    const g = el('g');
    g.appendChild(el('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 6, fill, 'fill-opacity': .18, stroke, 'stroke-opacity': .75, 'stroke-width': 1.5 }));
    g.appendChild(text(x, y + 5, label, { anchor: 'middle', size: 14, mono: true, weight: 700, fill: stroke, op: 1 }));
    return g;
  };
  const arrow = (x1, y1, x2, y2, color, dash) => el('path', {
    d: `M ${x1} ${y1} L ${x2} ${y2}`, stroke: color, 'stroke-width': 2,
    'stroke-opacity': .8, 'stroke-dasharray': dash || null, 'marker-end': 'url(#ah)',
  });

  const defs = el('defs');
  const mk = el('marker', { id: 'ah', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
  mk.appendChild(el('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'currentColor', 'fill-opacity': .7 }));
  defs.appendChild(mk);
  svg.appendChild(defs);

  const yTop = 68, yBot = 168;

  // inputs
  svg.appendChild(box(colX[0], yTop, 54, 34, 'x', 'var(--c-compute)', 'var(--c-compute)'));
  svg.appendChild(box(colX[0], yBot, 54, 34, 'y', 'var(--c-good)', 'var(--c-good)'));

  // f
  svg.appendChild(box(colX[1], yTop, 78, 40, 'f( x )', c, c));
  svg.appendChild(text(colX[1], yTop - 28, 'the transformer layer — need not be invertible', { anchor: 'middle', size: 10, op: .5 }));

  // adder
  svg.appendChild(el('circle', { cx: colX[1], cy: yBot, r: 17, fill: 'currentColor', 'fill-opacity': .06, stroke: 'currentColor', 'stroke-opacity': .4 }));
  svg.appendChild(text(colX[1], yBot + 6, inverse ? '−' : '+', { anchor: 'middle', size: 19, weight: 700, op: .85 }));

  // outputs
  svg.appendChild(box(colX[2], yTop, 66, 34, inverse ? 'x' : 'out x', 'var(--c-compute)', 'var(--c-compute)'));
  svg.appendChild(box(colX[2], yBot, 66, 34, inverse ? 'y' : 'z', 'var(--c-good)', 'var(--c-good)'));

  const s = dir > 0 ? 1 : -1;
  svg.appendChild(arrow(colX[0] + s * 27, yTop, colX[1] - s * 39, yTop, 'var(--c-compute)'));
  svg.appendChild(arrow(colX[1] + s * 39, yTop, colX[2] - s * 33, yTop, 'var(--c-compute)'));
  svg.appendChild(arrow(colX[0] + s * 27, yBot, colX[1] - s * 17, yBot, 'var(--c-good)'));
  svg.appendChild(arrow(colX[1] + s * 17, yBot, colX[2] - s * 33, yBot, 'var(--c-good)'));
  // f's output drops into the adder
  svg.appendChild(arrow(colX[1], yTop + 20, colX[1], yBot - 17, c, '4 3'));

  svg.appendChild(el('rect', { x: 14, y: 206, width: W - 28, height: 34, rx: 7, fill: c, 'fill-opacity': .08, stroke: c, 'stroke-opacity': .3 }));
  svg.appendChild(text(26, 227, inverse
    ? 'Because the layer inverts, training never has to keep activations in HBM — spend compute, save memory.'
    : 'Borrowed from cryptography (Feistel networks) and re-used in RevNets. The whole network becomes reversible.',
    { size: 11, op: .78 }));

  return svg;
}

/* ───────────────────────── registry ───────────────────────── */

const RENDERERS = {
  'rack-diagram': rackDiagram,
  'gantt-timeline': ganttTimeline,
  'memory-stack': memoryStack,
  feistel,
  'custom': null,
};

/** A spec may say kind:"custom"; work out which drawing it means. */
function sniff(ctx) {
  const hay = [
    ctx.spec && ctx.spec.id, ctx.spec && ctx.spec.title,
    ctx.cfg && ctx.cfg.description,
  ].join(' ').toLowerCase();
  if (/feistel|revnet|reversible|invertib/.test(hay)) return 'feistel';
  if (/rack|all-to-all|nvswitch|nvlink|scale-up|expert parallel/.test(hay)) return 'rack-diagram';
  if (/bubble|pipeline schedule|gantt|micro-?batch/.test(hay)) return 'gantt-timeline';
  if (/memory tier|hbm|ddr|flash|spinning disk|drain time/.test(hay)) return 'memory-stack';
  return null;
}

window.Diagrams = {
  render(kind, ctx) {
    // an explicit renderer name on the spec wins, then the kind, then a sniff
    const name = (ctx.cfg && ctx.cfg.renderer) || (kind !== 'custom' ? kind : null) || sniff(ctx);
    const fn = name && RENDERERS[name];
    if (!fn) return null;
    try { return fn(ctx); } catch (e) { console.error('diagram failed:', name, e); return null; }
  },
  pick,
};
})();
