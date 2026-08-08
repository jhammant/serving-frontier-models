/* ============================================================
   widgets.js — spec-driven interactive models.

   A widget spec declares controls, output expressions, a visual,
   and presets. This turns that into a live, independent instance:
   several copies of the same spec can be on the page at once
   (one in Follow mode, one in the Lecture, one in Models) without
   sharing state.
   ============================================================ */

const FMT = {
  int: (v) => isFinite(v) ? Math.round(v).toLocaleString() : '—',
  '0.0': (v) => isFinite(v) ? v.toFixed(1) : '—',
  '0.00': (v) => isFinite(v) ? v.toFixed(2) : '—',
  '0.000': (v) => isFinite(v) ? v.toFixed(3) : '—',
  sci: (v) => isFinite(v) ? v.toExponential(2).replace('e+', '×10^').replace('e-', '×10^-') : '—',
  usd: (v) => isFinite(v) ? (Math.abs(v) < 0.01 ? '$' + v.toFixed(5) : '$' + v.toFixed(2)) : '—',
  pct: (v) => isFinite(v) ? (v * 100).toFixed(1) + '%' : '—',
  x: (v) => isFinite(v) ? v.toFixed(v < 10 ? 1 : 0) + '×' : '—',
  auto: (v) => Charts.fmtAxis(v),
};

function fmtValue(v, format) {
  if (typeof v === 'string') return v;
  if (v === null || v === undefined || (typeof v === 'number' && !isFinite(v))) return '—';
  const f = FMT[format];
  return f ? f(v) : Charts.fmtAxis(v);
}

/** Compile a spec expression once. Bare control/output ids are in scope. */
function compile(expr, names) {
  try {
    // eslint-disable-next-line no-new-func
    return new Function(...names, `"use strict"; return (${expr});`);
  } catch (e) {
    console.warn('widget expression failed to compile:', expr, e);
    return () => NaN;
  }
}

class Widget {
  constructor(spec, host, opts = {}) {
    this.spec = spec;
    this.host = host;
    this.opts = opts;
    this.state = {};
    this.controlIds = (spec.controls || []).map((c) => c.id);

    for (const c of spec.controls || []) this.state[c.id] = this.coerce(c, c.default);

    // Pre-compile every expression against [controls..., outputs so far...]
    const names = this.controlIds.slice();
    this.outputFns = (spec.outputs || []).map((o) => {
      const fn = compile(o.js, names.slice());
      names.push(o.id);
      return fn;
    });
    this.seriesFns = ((spec.visual && spec.visual.series) || []).map((s) =>
      compile(s.js, ['x', ...this.controlIds, ...(spec.outputs || []).map((o) => o.id)]));

    this.build();
    this.update();
  }

  coerce(c, v) {
    if (c.type === 'toggle') return (v === true || v === 'true' || v === 1 || v === '1') ? 1 : 0;
    const n = Number(v);
    return isFinite(n) ? n : 0;
  }

  /** Evaluate outputs in declaration order; each may reference earlier ones. */
  evaluate() {
    const scope = this.controlIds.map((id) => this.state[id]);
    const vals = {};
    (this.spec.outputs || []).forEach((o, i) => {
      let v;
      try { v = this.outputFns[i](...scope); } catch { v = NaN; }
      vals[o.id] = v;
      scope.push(v);
    });
    this._scope = scope;
    return vals;
  }

  build() {
    const s = this.spec;
    const root = document.createElement('section');
    root.className = 'widget';
    root.id = this.opts.domId || ('w-' + s.id);
    root.dataset.widget = s.id;

    // head
    const head = document.createElement('div');
    head.className = 'w-head';
    const kick = document.createElement('div');
    kick.className = 'w-kicker';
    kick.innerHTML = `<span class="w-badge">Interactive</span>`;
    if (isFinite(s.linkedTimestampSec)) {
      kick.appendChild(App.cueButton(s.linkedTimestampSec, 'watch him derive this'));
    }
    head.appendChild(kick);
    const h = document.createElement('h4');
    h.textContent = s.title;
    head.appendChild(h);
    if (s.insightItTeaches) {
      const p = document.createElement('p');
      p.className = 'w-insight';
      p.textContent = s.insightItTeaches;
      head.appendChild(p);
    }
    root.appendChild(head);

    // presets
    if ((s.presets || []).length) {
      const pw = document.createElement('div');
      pw.className = 'w-presets';
      pw.innerHTML = '<span>Scenarios</span>';
      s.presets.forEach((p, i) => {
        const b = document.createElement('button');
        b.className = 'preset';
        b.type = 'button';
        b.textContent = p.label;
        if (p.sourceClaim) b.title = p.sourceClaim;
        b.addEventListener('click', () => this.applyPreset(i));
        pw.appendChild(b);
      });
      this.presetBtns = [...pw.querySelectorAll('.preset')];
      root.appendChild(pw);
    }

    // body
    const body = document.createElement('div');
    body.className = 'w-body';

    const ctls = document.createElement('div');
    ctls.className = 'w-controls';
    this.ctlRefs = {};
    for (const c of s.controls || []) ctls.appendChild(this.buildControl(c));
    body.appendChild(ctls);

    const out = document.createElement('div');
    out.className = 'w-out';
    this.headlineEl = document.createElement('div');
    this.headlineEl.className = 'headline';
    out.appendChild(this.headlineEl);
    this.outsEl = document.createElement('ul');
    this.outsEl.className = 'outs';
    out.appendChild(this.outsEl);
    this.visualEl = document.createElement('div');
    out.appendChild(this.visualEl);
    body.appendChild(out);
    root.appendChild(body);

    // derivation
    if ((s.derivationSteps || []).length) {
      const d = document.createElement('details');
      d.className = 'w-foot';
      const sum = document.createElement('summary');
      sum.textContent = 'Show the work — how he gets there';
      d.appendChild(sum);
      const ol = document.createElement('ol');
      ol.className = 'deriv';
      for (const st of s.derivationSteps) {
        const li = document.createElement('li');
        const a = document.createElement('span'); a.className = 'd-step'; a.textContent = st.step;
        const b = document.createElement('span'); b.className = 'd-why'; b.textContent = st.explanation;
        li.append(a, b);
        ol.appendChild(li);
      }
      d.appendChild(ol);
      root.appendChild(d);
    }

    // preset provenance note
    const sourced = (s.presets || []).filter((p) => p.sourceClaim);
    if (sourced.length) {
      const n = document.createElement('div');
      n.className = 'w-note';
      n.innerHTML = '<b>From the lecture:</b> ' + sourced.map((p) =>
        `“${escapeHtml(p.sourceClaim)}”`).join(' · ');
      root.appendChild(n);
    }

    this.host.appendChild(root);
    this.root = root;
  }

  buildControl(c) {
    const wrap = document.createElement('div');
    wrap.className = 'ctl';

    if (c.type === 'toggle') {
      const lab = document.createElement('label');
      lab.className = 'ctl-toggle';
      const inp = document.createElement('input');
      inp.type = 'checkbox';
      inp.checked = !!this.state[c.id];
      inp.addEventListener('change', () => { this.state[c.id] = inp.checked ? 1 : 0; this.clearPreset(); this.update(); });
      lab.append(inp, Object.assign(document.createElement('span'), { textContent: c.label }));
      wrap.appendChild(lab);
      this.ctlRefs[c.id] = { input: inp, kind: 'toggle' };
    } else if (c.type === 'select') {
      const lab = document.createElement('label');
      lab.innerHTML = `<span>${escapeHtml(c.label)}</span>`;
      wrap.appendChild(lab);
      const sel = document.createElement('select');
      for (const o of c.options || []) {
        const op = document.createElement('option');
        op.value = o.value; op.textContent = o.label;
        sel.appendChild(op);
      }
      sel.value = String(this.state[c.id]);
      sel.addEventListener('change', () => { this.state[c.id] = Number(sel.value); this.clearPreset(); this.update(); });
      wrap.appendChild(sel);
      this.ctlRefs[c.id] = { input: sel, kind: 'select' };
    } else {
      const lab = document.createElement('label');
      const name = document.createElement('span'); name.textContent = c.label;
      const val = document.createElement('b');
      lab.append(name, val);
      wrap.appendChild(lab);

      const inp = document.createElement('input');
      inp.type = 'range';
      const log = !!c.logScale && c.min > 0;
      const min = c.min !== undefined ? c.min : 0;
      const max = c.max !== undefined ? c.max : 100;
      if (log) {
        inp.min = 0; inp.max = 1000; inp.step = 1;
        inp.value = String(Math.round((Math.log10(this.state[c.id]) - Math.log10(min)) / (Math.log10(max) - Math.log10(min)) * 1000));
      } else {
        inp.min = min; inp.max = max;
        inp.step = c.step !== undefined ? c.step : (max - min) / 100;
        inp.value = String(this.state[c.id]);
      }
      inp.setAttribute('aria-label', c.label);
      const read = () => {
        let v;
        if (log) {
          const t = Number(inp.value) / 1000;
          v = Math.pow(10, Math.log10(min) + t * (Math.log10(max) - Math.log10(min)));
          const step = c.step;
          if (step && step >= 1) v = Math.round(v / step) * step;
          else v = Number(v.toPrecision(3));
        } else v = Number(inp.value);
        this.state[c.id] = v;
        this.clearPreset();
        val.textContent = Charts.fmtAxis(v) + (c.unit ? ' ' + c.unit : '');
        this.scheduleUpdate();
      };
      inp.addEventListener('input', read);
      wrap.appendChild(inp);
      if (c.hint) {
        const hint = document.createElement('span');
        hint.className = 'ctl-hint'; hint.textContent = c.hint;
        wrap.appendChild(hint);
      }
      this.ctlRefs[c.id] = { input: inp, kind: 'slider', valEl: val, log, min, max, unit: c.unit };
    }
    return wrap;
  }

  setControl(id, value) {
    const ref = this.ctlRefs[id];
    const c = (this.spec.controls || []).find((x) => x.id === id);
    if (!ref || !c) return;
    const v = this.coerce(c, value);
    this.state[id] = v;
    if (ref.kind === 'toggle') ref.input.checked = !!v;
    else if (ref.kind === 'select') ref.input.value = String(v);
    else if (ref.log) ref.input.value = String(Math.round((Math.log10(Math.max(v, ref.min)) - Math.log10(ref.min)) / (Math.log10(ref.max) - Math.log10(ref.min)) * 1000));
    else ref.input.value = String(v);
  }

  applyPreset(i) {
    const p = (this.spec.presets || [])[i];
    if (!p) return;
    for (const k in p.values) this.setControl(k, p.values[k]);
    this.activePreset = i;
    this.update();
    if (p.atSec !== undefined && this.opts.seekOnPreset !== false) { /* no auto-seek; user opts in via cue */ }
  }

  clearPreset() { this.activePreset = -1; }

  /** Coalesce rapid input (dragging a slider) into one redraw per frame. */
  scheduleUpdate() {
    if (this._raf) return;
    const run = () => { this._raf = 0; this.update(); };
    // rAF is frozen in a background tab; a timer still fires.
    this._raf = document.hidden ? setTimeout(run, 0) : requestAnimationFrame(run);
  }

  update() {
    const vals = this.evaluate();

    // slider readouts
    for (const c of this.spec.controls || []) {
      const ref = this.ctlRefs[c.id];
      if (ref && ref.valEl) {
        ref.valEl.textContent = Charts.fmtAxis(this.state[c.id]) + (c.unit ? ' ' + c.unit : '');
      }
    }

    // preset highlight
    if (this.presetBtns) this.presetBtns.forEach((b, i) => b.classList.toggle('on', i === this.activePreset));

    // headline + secondary outputs
    const outs = this.spec.outputs || [];
    const head = outs.filter((o) => o.isHeadline);
    const rest = outs.filter((o) => !o.isHeadline);

    this.headlineEl.innerHTML = '';
    this.headlineEl.hidden = head.length === 0;
    for (const o of head) {
      const d = document.createElement('div');
      d.className = 'hl';
      const b = document.createElement('b');
      b.textContent = fmtValue(vals[o.id], o.format) + (o.unit ? ' ' + o.unit : '');
      const s = document.createElement('span');
      s.textContent = o.label;
      d.append(b, s);
      this.headlineEl.appendChild(d);
    }

    this.outsEl.innerHTML = '';
    this.outsEl.hidden = rest.length === 0;
    for (const o of rest) {
      const li = document.createElement('li');
      const s = document.createElement('span');
      s.textContent = o.label;
      if (o.note) { const i2 = document.createElement('i'); i2.textContent = o.note; s.appendChild(i2); }
      const b = document.createElement('b');
      b.textContent = fmtValue(vals[o.id], o.format) + (o.unit ? ' ' + o.unit : '');
      li.append(s, b);
      this.outsEl.appendChild(li);
    }

    this.renderVisual(vals);
  }

  renderVisual(vals) {
    const v = this.spec.visual || {};
    this.visualEl.innerHTML = '';

    // A bespoke diagram takes over entirely.
    if (v.kind && v.kind !== 'xy-chart' && v.kind !== 'bar-comparison' && v.kind !== 'none') {
      const custom = window.Diagrams && Diagrams.render(v.kind, {
        spec: this.spec, state: this.state, values: vals, cfg: v,
      });
      if (custom) {
        const box = document.createElement('div');
        box.className = 'diagram';
        box.appendChild(custom);
        this.visualEl.appendChild(box);
        if (v.description) {
          const cap = document.createElement('div');
          cap.className = 'dg-cap';
          cap.textContent = v.description;
          this.visualEl.appendChild(cap);
        }
        return;
      }
    }

    // A bespoke visual we could not draw: fall back to a chart if the spec
    // gave us series, otherwise at least show what it was meant to depict.
    const bespoke = v.kind && !['xy-chart', 'bar-comparison', 'none'].includes(v.kind);
    if (bespoke && (v.series || []).length && (v.xAxis || {}).controlId) {
      v = { ...v, kind: 'xy-chart' };
    } else if (bespoke) {
      if (v.description) {
        const cap = document.createElement('div');
        cap.className = 'dg-cap';
        cap.textContent = v.description;
        this.visualEl.appendChild(cap);
      }
      return;
    }

    if (v.kind === 'bar-comparison') {
      let rows = (v.series || []).map((s, i) => {
        let val;
        try { val = this.seriesFns[i](0, ...this._scope); } catch { val = NaN; }
        return { label: s.label, value: val, color: Charts.SERIES_COLORS[i % 6] };
      });
      // Spec declared bars but gave no series: chart the outputs instead,
      // restricted to a single unit so the bars stay comparable.
      if (!rows.length) {
        const outs = (this.spec.outputs || []).filter((o) => isFinite(vals[o.id]) && vals[o.id] > 0);
        const tally = {};
        outs.forEach((o) => { const u = o.unit || ''; tally[u] = (tally[u] || 0) + 1; });
        const unit = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
        rows = outs.filter((o) => (o.unit || '') === unit).slice(0, 6).map((o, i) => ({
          label: o.label.length > 34 ? o.label.slice(0, 33) + '…' : o.label,
          value: vals[o.id],
          display: fmtValue(vals[o.id], o.format) + (o.unit ? ' ' + o.unit : ''),
          color: Charts.SERIES_COLORS[i % 6],
        }));
      }
      const box = document.createElement('div');
      box.className = 'chartbox';
      box.appendChild(Charts.renderBars({ rows, log: !!v.log }));
      this.visualEl.appendChild(box);
      return;
    }

    if (v.kind !== 'xy-chart' || !(v.series || []).length) return;

    const ax = v.xAxis || {};
    const ctl = (this.spec.controls || []).find((c) => c.id === ax.controlId);
    const xMin = ax.min !== undefined ? ax.min : (ctl ? ctl.min : 1);
    const xMax = ax.max !== undefined ? ax.max : (ctl ? ctl.max : 100);
    const xLog = ax.log !== undefined ? ax.log : (ctl ? !!ctl.logScale : false);

    const series = v.series.map((s, i) => ({
      label: s.label,
      color: s.color || Charts.SERIES_COLORS[i % 6],
      emphasis: /max|total|actual|binding|what you pay/i.test(s.label),
      dashed: /ignor|without|naive|hypothetical/i.test(s.label),
      fn: (x) => this.seriesFns[i](x, ...this._scope),
    }));

    const markers = [];
    for (const o of this.spec.outputs || []) {
      if (o.marker && isFinite(vals[o.id])) markers.push({ x: vals[o.id], label: o.markerLabel || o.label, color: 'var(--c-good)' });
    }
    if (v.markerOutputId && isFinite(vals[v.markerOutputId])) {
      markers.push({ x: vals[v.markerOutputId], label: v.markerLabel || 'balance', color: 'var(--c-good)' });
    }

    // A spec may declare the log axis either on the visual or on every series.
    const yLog = v.yLog !== undefined
      ? !!v.yLog
      : v.series.length > 0 && v.series.every((s) => s.log);

    const box = document.createElement('div');
    box.className = 'chartbox';
    box.appendChild(Charts.renderChart({
      xLabel: ax.label || (ctl ? ctl.label : ''),
      yLabel: v.yLabel || '',
      xMin, xMax, xLog, yLog, yZero: v.yZero,
      series, markers,
      cursorX: ctl ? this.state[ctl.id] : undefined,
    }));
    const leg = document.createElement('div');
    leg.className = 'legend';
    series.forEach((s) => {
      const i = document.createElement('i');
      i.style.color = s.color;
      i.append(Object.assign(document.createElement('span'), { textContent: s.label, style: 'color:var(--chalk-dim)' }));
      leg.appendChild(i);
    });
    box.appendChild(leg);
    this.visualEl.appendChild(box);
    if (v.description) {
      const cap = document.createElement('div');
      cap.className = 'dg-cap';
      cap.textContent = v.description;
      this.visualEl.appendChild(cap);
    }
  }

  destroy() { if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root); }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

window.Widgets = {
  mount(spec, host, opts) { return new Widget(spec, host, opts); },
  escapeHtml,
  fmtValue,
};
