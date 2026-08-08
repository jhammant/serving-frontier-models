#!/usr/bin/env node
/* Validate every widget spec in js/content.js.
 *
 * Widget specs come from LLM agents, so their arithmetic has to be checked
 * mechanically before it goes in front of a reader: an expression that
 * silently yields NaN, or references a control that does not exist, would
 * misteach. This evaluates every output and every chart series at the
 * defaults and at each preset, and reports anything that is not a finite
 * number.
 */
global.window = {};
require('./js/content.js');
const C = global.window.CONTENT;

let errors = 0, warnings = 0, checked = 0;
const bad = [];

function note(level, wid, msg) {
  if (level === 'ERROR') errors++; else warnings++;
  bad.push(`  [${level}] ${wid}: ${msg}`);
}

for (const ch of C.chapters) {
  for (const w of ch.widgets || []) {
    const ctlIds = (w.controls || []).map((c) => c.id);
    const outIds = (w.outputs || []).map((o) => o.id);

    // control sanity
    for (const c of w.controls || []) {
      if (!/^[A-Za-z_$][\w$]*$/.test(c.id)) note('ERROR', w.id, `control id "${c.id}" is not a valid JS identifier`);
      if (c.type === 'slider') {
        if (!isFinite(c.min) || !isFinite(c.max)) note('WARN', w.id, `slider ${c.id} missing min/max`);
        else if (c.min >= c.max) note('ERROR', w.id, `slider ${c.id} has min >= max`);
        if (c.logScale && c.min <= 0) note('ERROR', w.id, `slider ${c.id} is logScale but min <= 0`);
        const d = Number(c.default);
        if (isFinite(d) && isFinite(c.min) && (d < c.min || d > c.max)) note('WARN', w.id, `slider ${c.id} default ${d} outside [${c.min}, ${c.max}]`);
      }
    }
    if (new Set(ctlIds).size !== ctlIds.length) note('ERROR', w.id, 'duplicate control ids');

    const coerce = (c, v) => c.type === 'toggle'
      ? (v === true || v === 'true' || v === 1 || v === '1' ? 1 : 0)
      : (isFinite(Number(v)) ? Number(v) : 0);

    const evalAll = (state, label) => {
      const scope = ctlIds.map((id) => state[id]);
      const names = ctlIds.slice();
      const vals = {};
      (w.outputs || []).forEach((o, i) => {
        let fn;
        try {
          fn = new Function(...names, `"use strict"; return (${o.js});`);
        } catch (e) {
          note('ERROR', w.id, `output "${o.id}" will not compile: ${e.message} — js: ${o.js}`);
          names.push(o.id); scope.push(NaN); vals[o.id] = NaN;
          return;
        }
        let v;
        try { v = fn(...scope); } catch (e) {
          note('ERROR', w.id, `output "${o.id}" threw at ${label}: ${e.message}`);
          v = NaN;
        }
        checked++;
        if (typeof v !== 'number' || !isFinite(v)) {
          note(o.isHeadline ? 'ERROR' : 'WARN', w.id, `output "${o.id}" = ${v} at ${label} — js: ${o.js}`);
        }
        names.push(o.id); scope.push(v); vals[o.id] = v;
      });
      return { vals, scope };
    };

    // defaults
    const dflt = {};
    for (const c of w.controls || []) dflt[c.id] = coerce(c, c.default);
    const { scope } = evalAll(dflt, 'defaults');

    // chart series over the swept axis
    const v = w.visual || {};
    if ((v.series || []).length) {
      const ax = v.xAxis || {};
      const ctl = (w.controls || []).find((c) => c.id === ax.controlId);
      const xMin = isFinite(ax.min) ? ax.min : (ctl ? ctl.min : 1);
      const xMax = isFinite(ax.max) ? ax.max : (ctl ? ctl.max : 100);
      const xLog = ax.log !== undefined ? ax.log : (ctl ? !!ctl.logScale : false);
      if (!isFinite(xMin) || !isFinite(xMax)) {
        note('WARN', w.id, `chart x-axis has no usable range (controlId "${ax.controlId}")`);
      } else {
        v.series.forEach((s, si) => {
          let fn;
          try {
            fn = new Function('x', ...ctlIds, ...outIds, `"use strict"; return (${s.js});`);
          } catch (e) {
            note('ERROR', w.id, `series "${s.label}" will not compile: ${e.message} — js: ${s.js}`);
            return;
          }
          let finite = 0;
          for (let i = 0; i <= 40; i++) {
            const t = i / 40;
            const x = xLog && xMin > 0
              ? Math.pow(10, Math.log10(xMin) + t * (Math.log10(xMax) - Math.log10(xMin)))
              : xMin + t * (xMax - xMin);
            let y;
            try { y = fn(x, ...scope); } catch { y = NaN; }
            checked++;
            if (typeof y === 'number' && isFinite(y)) finite++;
          }
          if (finite === 0) note('ERROR', w.id, `series "${s.label}" is never finite across the x range — js: ${s.js}`);
          else if (finite < 20) note('WARN', w.id, `series "${s.label}" finite at only ${finite}/41 sampled points`);
        });
      }
    }

    // presets
    (w.presets || []).forEach((p) => {
      const st = { ...dflt };
      for (const k in p.values) {
        const c = (w.controls || []).find((x) => x.id === k);
        if (!c) { note('WARN', w.id, `preset "${p.label}" sets unknown control "${k}"`); continue; }
        st[k] = coerce(c, p.values[k]);
      }
      evalAll(st, `preset "${p.label}"`);
    });

    // provenance: at least one preset should cite the lecture
    if ((w.presets || []).length && !(w.presets || []).some((p) => p.sourceClaim)) {
      note('WARN', w.id, 'no preset cites a claim from the lecture');
    }
    if (!isFinite(w.linkedTimestampSec)) note('WARN', w.id, 'no linked timestamp');
  }
}

const total = C.chapters.reduce((a, c) => a + (c.widgets || []).length, 0);
console.log(`checked ${checked} expression evaluations across ${total} widgets`);
if (bad.length) {
  console.log(`\n${errors} error(s), ${warnings} warning(s):\n`);
  console.log(bad.join('\n'));
} else {
  console.log('all widget math evaluates finite at defaults, presets and across every chart range');
}
process.exit(errors ? 1 : 0);
