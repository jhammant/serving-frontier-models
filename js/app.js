/* ============================================================
   app.js — wiring.

   Flattens the chapters into one ordered list of beats, then keeps
   three things in step with playback: the Follow stage (the
   explainer for wherever the video is), the table of contents, and
   the scrubber. Everything is also usable standalone — the Lecture,
   Models, Numbers and Glossary views ignore the player entirely.
   ============================================================ */

const App = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => Widgets.escapeHtml(s);

  let C, beats = [], activeBeat = -1, followEnabled = true, currentView = 'follow';
  let stageWidgets = [];
  /* The intro holds the stage until the reader actually starts — otherwise the
     first tick at t=0 would replace it with beat 1 before they've read it. */
  let started = false;

  function markStarted() {
    if (started) return;
    started = true;
    if (currentView === 'follow') { activeBeat = -1; onTick(Player.time, Player.playing); }
  }

  /* ── time helpers ── */
  function hms(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
             : `${m}:${String(s).padStart(2, '0')}`;
  }

  /** The ▶ chip used everywhere to jump the video. */
  function cueButton(sec, label) {
    const b = document.createElement('button');
    b.className = 'cue';
    b.type = 'button';
    b.dataset.sec = sec;
    b.textContent = label || hms(sec);
    b.title = `Jump the video to ${hms(sec)}`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      markStarted();
      Player.seek(sec);
      toast(`Jumped to ${hms(sec)}`);
    });
    return b;
  }

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 1800);
  }

  /* ── flatten ── */
  function buildBeats() {
    beats = [];
    C.chapters.forEach((ch, ci) => {
      (ch.segments || []).forEach((sg) => {
        beats.push({ ...sg, chapter: ch, chapterIndex: ci });
      });
    });
    beats.sort((a, b) => a.startSec - b.startSec);
    beats.forEach((b, i) => {
      b.index = i;
      b.endSec = i + 1 < beats.length ? beats[i + 1].startSec : C.video.duration;
    });

    // attach quotes + widgets to the beat whose window contains them
    const place = (item, sec) => {
      let b = beats[0];
      for (const x of beats) if (sec >= x.startSec) b = x; else break;
      return b;
    };
    C.chapters.forEach((ch) => {
      (ch.quotes || []).forEach((q) => {
        const b = place(q, q.atSec);
        (b.quotes || (b.quotes = [])).push(q);
      });
      (ch.widgets || []).forEach((w) => {
        const sec = isFinite(w.linkedTimestampSec) ? w.linkedTimestampSec : ch.start;
        const b = place(w, sec);
        (b.widgets || (b.widgets = [])).push(w);
      });
    });
  }

  function beatAt(t) {
    if (!beats.length) return -1;
    let lo = 0, hi = beats.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (beats[mid].startSec <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }

  /* ── left rail: TOC ── */
  function buildTOC() {
    const toc = $('toc');
    toc.innerHTML = '';
    C.chapters.forEach((ch, ci) => {
      const d = document.createElement('div');
      d.className = 'toc-ch';
      d.dataset.ci = ci;

      const b = document.createElement('button');
      b.type = 'button';
      b.title = ch.title;
      b.innerHTML = `<span class="toc-num">${ci + 1}</span>`
        + `<span class="toc-label">${esc(ch.title)}</span>`
        + `<span class="toc-time">${hms(ch.start)}</span>`;
      b.addEventListener('click', () => { markStarted(); Player.seek(ch.start); });
      d.appendChild(b);

      const ul = document.createElement('ul');
      ul.className = 'toc-segs';
      (ch.segments || []).forEach((sg) => {
        const li = document.createElement('li');
        const sb = document.createElement('button');
        sb.type = 'button';
        sb.textContent = sg.title;
        sb.title = sg.title;
        sb.dataset.sec = sg.startSec;
        sb.addEventListener('click', () => { markStarted(); Player.seek(sg.startSec); });
        li.appendChild(sb);
        ul.appendChild(li);
      });
      d.appendChild(ul);
      toc.appendChild(d);
    });
  }

  /* ── left rail: scrubber ── */
  function buildScrubber() {
    const dur = C.video.duration;
    const chWrap = $('scrubChapters');
    chWrap.innerHTML = '';
    C.chapters.forEach((ch, i) => {
      const end = i + 1 < C.chapters.length ? C.chapters[i + 1].start : dur;
      const s = document.createElement('span');
      s.style.width = ((end - ch.start) / dur * 100) + '%';
      s.dataset.ci = i;
      s.title = ch.title;
      chWrap.appendChild(s);
    });

    const marks = $('scrubMarks');
    marks.innerHTML = '';
    beats.forEach((b) => {
      const i = document.createElement('i');
      i.className = 'seg';
      i.style.left = (b.startSec / dur * 100) + '%';
      marks.appendChild(i);
    });
    C.chapters.forEach((ch) => (ch.widgets || []).forEach((w) => {
      const i = document.createElement('i');
      i.style.left = ((w.linkedTimestampSec || ch.start) / dur * 100) + '%';
      i.title = w.title;
      marks.appendChild(i);
    }));

    const sc = $('scrubber'), tip = $('scrubTip');
    const secFromEvent = (e) => {
      const r = sc.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, ((e.touches ? e.touches[0].clientX : e.clientX) - r.left) / r.width));
      return x * dur;
    };
    sc.addEventListener('click', (e) => { markStarted(); Player.seek(secFromEvent(e)); });
    sc.addEventListener('mousemove', (e) => {
      const s = secFromEvent(e);
      const r = sc.getBoundingClientRect();
      tip.hidden = false;
      tip.style.left = (((e.clientX - r.left) / r.width) * 100) + '%';
      const bi = beatAt(s);
      tip.textContent = hms(s) + (beats[bi] ? ' · ' + beats[bi].title.slice(0, 42) : '');
    });
    sc.addEventListener('mouseleave', () => { tip.hidden = true; });
    sc.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { Player.nudge(-15); e.preventDefault(); }
      if (e.key === 'ArrowRight') { Player.nudge(15); e.preventDefault(); }
    });
  }

  /* ── hero ── */
  function buildHero() {
    const hs = $('heroStats');
    hs.innerHTML = '';
    (C.heroStats || []).forEach((s) => {
      const d = document.createElement('div');
      d.className = 'hstat';
      d.innerHTML = `<b>${esc(s.value)}</b><span>${esc(s.label)}</span>`;
      hs.appendChild(d);
    });

    const arc = $('arcList');
    arc.innerHTML = '';
    (C.arc || []).forEach((a) => {
      const li = document.createElement('li');
      li.innerHTML = a.html || esc(a.text);
      if (isFinite(a.atSec)) li.appendChild(cueButton(a.atSec));
      arc.appendChild(li);
    });
  }

  /* ── the Follow stage ── */
  function renderStage(bi) {
    const stage = $('followStage');
    stageWidgets.forEach((w) => w.destroy());
    stageWidgets = [];
    stage.innerHTML = '';

    if (bi < 0 || !beats[bi]) { renderIntro(stage); return; }
    const b = beats[bi];
    const card = document.createElement('div');
    card.className = 'stage-card';
    // Animate in only if the browser is actually painting frames.
    if (!document.hidden) requestAnimationFrame(() => card.classList.add('stage-card--enter'));

    const time = document.createElement('div');
    time.className = 'sc-time';
    const dot = document.createElement('span');
    dot.className = 'sc-dot' + (Player.playing ? '' : ' paused');
    const live = document.createElement('span');
    live.className = 'sc-live';
    live.textContent = Player.playing ? 'Live' : 'Paused';
    time.append(dot, live, cueButton(b.startSec, hms(b.startSec)));
    card.appendChild(time);

    const h = document.createElement('h2');
    h.textContent = b.title;
    card.appendChild(h);

    const g = document.createElement('p');
    g.className = 'sc-gist';
    g.textContent = b.gist;
    card.appendChild(g);

    if (b.whyItMatters) {
      const w = document.createElement('div');
      w.className = 'sc-why';
      w.innerHTML = `<b>So what</b><span>${esc(b.whyItMatters)}</span>`;
      card.appendChild(w);
    }

    (b.quotes || []).forEach((q) => card.appendChild(quoteEl(q)));
    stage.appendChild(card);

    (b.widgets || []).forEach((spec) => {
      stageWidgets.push(Widgets.mount(spec, stage, { domId: 'stage-' + spec.id }));
    });

    // the chapter's machinery, always reachable from the stage
    const ch = b.chapter;
    if ((ch.mechanisms || []).length) {
      const det = document.createElement('details');
      det.className = 'mech';
      det.innerHTML = `<summary>The machinery behind this chapter<span class="mech-kicker">${ch.mechanisms.length} relationship${ch.mechanisms.length > 1 ? 's' : ''}</span></summary>`;
      const inn = document.createElement('div');
      inn.className = 'mech-in';
      ch.mechanisms.forEach((m) => inn.appendChild(mechEl(m)));
      det.appendChild(inn);
      stage.appendChild(det);
    }

    // header + up-next
    $('fhKicker').textContent = `Chapter ${b.chapterIndex + 1} · ${hms(ch.start)}`;
    $('fhChapter').textContent = ch.title;
    $('fhCount').textContent = `${bi + 1}/${beats.length}`;
    $('fhNav').hidden = false;
    $('fhProgress').style.width = ((bi + 1) / beats.length * 100) + '%';

    const nx = beats[bi + 1];
    const nextWrap = $('stageNext');
    if (nx) {
      nextWrap.hidden = false;
      const btn = $('upNext');
      btn.innerHTML = `<span>${esc(nx.title)}</span><em>${hms(nx.startSec)}</em>`;
      btn.onclick = () => { markStarted(); Player.seek(nx.startSec); };
    } else nextWrap.hidden = true;
  }

  /** The landing state: what this page is, and how to drive it. */
  function renderIntro(stage) {
    const nWidgets = C.chapters.reduce((a, c) => a + (c.widgets || []).length, 0);
    const nNums = C.chapters.reduce((a, c) => a + (c.keyNumbers || []).length, 0);
    const nTerms = new Set(C.chapters.flatMap((c) => (c.jargon || []).map((j) => j.term.toLowerCase()))).size;

    stage.innerHTML = `
      <div class="intro">
        <p class="intro-lede">Reiner Pope spends two hours at a blackboard deriving what a token costs
        from two things: how long it takes to <b>move</b> the bytes, and how long it takes to
        <b>multiply</b> them.</p>
        <p class="intro-sub">This page is that lecture with the whiteboard switched back on.
        Every curve he draws is a live model you can drag.</p>

        <div class="steps">
          <div class="step"><span class="step-n">1</span><span>
            <b>Press play — the explainer follows the video</b>
            <span>As he moves through the argument, this panel keeps pace: what he's claiming
            right now, why it matters, and the interactive model for that exact moment.</span>
          </span></div>
          <div class="step"><span class="step-n">2</span><span>
            <b>Drag the sliders — the numbers are his</b>
            <span>Each model starts from the figures he uses on the board, with named scenarios
            you can click to reproduce his claims. Open <em>Show the work</em> to see the derivation.</span>
          </span></div>
          <div class="step"><span class="step-n">3</span><span>
            <b>Or ignore the video entirely</b>
            <span>Everything also works standalone — read the whole lecture, or open any single
            model on its own. Any <em>▶ timestamp</em> jumps the video to that moment.</span>
          </span></div>
        </div>

        <div class="intro-cta">
          <button class="btn-primary" id="introPlay">▶ Start from the beginning</button>
          <button class="btn-ghost" id="introLecture">Read it instead</button>
          <button class="btn-ghost" id="introModels">Jump to the models</button>
        </div>

        <div class="intro-grid">
          <button class="ig" data-go="lecture"><b>${C.chapters.length}</b><span>chapters, ${beats.length} beats — the full argument in order</span></button>
          <button class="ig" data-go="models"><b>${nWidgets}</b><span>interactive models, usable on their own</span></button>
          <button class="ig" data-go="numbers"><b>${nNums}</b><span>numbers he cites, each linked to the second he says it</span></button>
          <button class="ig" data-go="glossary"><b>${nTerms}</b><span>terms defined the way this lecture uses them</span></button>
        </div>

        <p class="intro-note">Chapter prose summarises the lecture; quotes are verbatim and
        timestamped. Numbers in the models are his own unless a model says otherwise.
        Source: <a href="https://www.youtube.com/watch?v=${C.video.id}" target="_blank" rel="noopener">${esc(C.video.title)}</a>,
        ${esc(C.video.host)} × ${esc(C.video.guest)}.</p>
      </div>`;

    stage.querySelector('#introPlay').onclick = () => { markStarted(); Player.seek(0); };
    stage.querySelector('#introLecture').onclick = () => setView('lecture');
    stage.querySelector('#introModels').onclick = () => setView('models');
    stage.querySelectorAll('.ig').forEach((b) => { b.onclick = () => setView(b.dataset.go); });

    $('fhKicker').textContent = 'Start here';
    $('fhChapter').textContent = 'How this page works';
    $('fhCount').textContent = '';
    $('fhProgress').style.width = '0%';
    $('stageNext').hidden = true;
    $('fhNav').hidden = true;
  }

  function quoteEl(q) {
    const d = document.createElement('div');
    d.className = 'pullq';
    const bq = document.createElement('blockquote');
    bq.textContent = q.text;
    const f = document.createElement('footer');
    const c = document.createElement('cite');
    c.textContent = q.speaker || 'Reiner Pope';
    f.append(c, cueButton(q.atSec));
    d.append(bq, f);
    return d;
  }

  function mechEl(m) {
    const wrap = document.createElement('div');
    const t = document.createElement('p');
    t.innerHTML = `<b style="color:var(--chalk)">${esc(m.name)}.</b> ${esc(m.plainExplanation)}`;
    wrap.appendChild(t);
    if (m.formula && m.formula.toLowerCase() !== 'qualitative') {
      const f = document.createElement('pre');
      f.className = 'formula';
      f.textContent = m.formula;
      wrap.appendChild(f);
    }
    if ((m.variables || []).length) {
      const ul = document.createElement('ul');
      ul.className = 'vars';
      m.variables.forEach((v) => {
        const li = document.createElement('li');
        li.innerHTML = `<code>${esc(v.sym)}</code><span>${esc(v.meaning)}${v.typicalValue ? ` — <b>${esc(v.typicalValue)}</b>` : ''}</span>`;
        ul.appendChild(li);
      });
      wrap.appendChild(ul);
    }
    return wrap;
  }

  /* ── Lecture view: everything, in order ── */
  function buildLecture() {
    const root = $('lecture');
    root.innerHTML = '';
    C.chapters.forEach((ch, ci) => {
      const sec = document.createElement('section');
      sec.className = 'chapter';
      sec.id = 'ch-' + ci;

      const head = document.createElement('div');
      head.className = 'ch-head';
      const eb = document.createElement('div');
      eb.className = 'ch-eyebrow';
      eb.innerHTML = `<span class="ch-n">Chapter ${ci + 1}</span><span class="ch-time">${hms(ch.start)}</span>`;
      eb.appendChild(cueButton(ch.start, 'play chapter'));
      head.appendChild(eb);
      const h2 = document.createElement('h2');
      h2.textContent = ch.title;
      head.appendChild(h2);
      if (ch.thesis) {
        const p = document.createElement('p');
        p.className = 'ch-thesis';
        p.textContent = ch.thesis;
        head.appendChild(p);
      }
      sec.appendChild(head);

      (ch.segments || []).forEach((sg) => {
        const b = beats.find((x) => x.startSec === sg.startSec && x.chapterIndex === ci) || sg;
        const d = document.createElement('div');
        d.className = 'seg';
        d.dataset.sec = sg.startSec;
        const sh = document.createElement('div');
        sh.className = 'seg-head';
        const h3 = document.createElement('h3');
        h3.textContent = sg.title;
        sh.append(h3, cueButton(sg.startSec));
        d.appendChild(sh);
        const p = document.createElement('p');
        p.className = 'seg-body';
        p.textContent = sg.gist;
        if (sg.whyItMatters) {
          const w = document.createElement('span');
          w.className = 'seg-why';
          w.innerHTML = `<b>So what:</b> ${esc(sg.whyItMatters)}`;
          p.appendChild(w);
        }
        d.appendChild(p);
        sec.appendChild(d);

        (b.quotes || []).forEach((q) => sec.appendChild(quoteEl(q)));
        (b.widgets || []).forEach((spec) => {
          const slot = document.createElement('div');
          slot.dataset.pending = spec.id;
          sec.appendChild(slot);
          lazyMount(slot, spec, 'lec-');
        });
      });

      if ((ch.misconceptions || []).length) {
        const m = document.createElement('div');
        m.className = 'misc';
        ch.misconceptions.forEach((x) => {
          m.innerHTML += `<div class="misc-row wrong"><div class="misc-tag">Not this</div><div class="misc-txt">${esc(x.wrongBelief)}</div></div>`
            + `<div class="misc-row right"><div class="misc-tag">Actually</div><div class="misc-txt">${esc(x.correction)}</div></div>`;
        });
        sec.appendChild(m);
      }

      if ((ch.mechanisms || []).length) {
        const det = document.createElement('details');
        det.className = 'mech';
        det.innerHTML = `<summary>The machinery — formulas and variables<span class="mech-kicker">${ch.mechanisms.length}</span></summary>`;
        const inn = document.createElement('div');
        inn.className = 'mech-in';
        ch.mechanisms.forEach((mm) => inn.appendChild(mechEl(mm)));
        det.appendChild(inn);
        sec.appendChild(det);
      }

      root.appendChild(sec);
    });
  }

  /* Deferred widget mounting.
     Building 21 charts in one go janks the view switch, so slots are filled a
     few per frame once their view is actually on screen. (An
     IntersectionObserver would be the obvious tool, but its callbacks are
     deferred while the tab is backgrounded, which makes mounting unreliable
     and untestable — a plain frame-chunked queue always runs.) */
  const pending = [];

  /* rAF is frozen while the tab is backgrounded, which would strand the queue
     until the reader came back. Timers still run, so fall back to one. */
  const nextFrame = (cb) => (document.hidden ? setTimeout(cb, 0) : requestAnimationFrame(cb));

  function lazyMount(wrap, spec, prefix) {
    wrap._spec = spec;
    wrap._prefix = prefix;
    pending.push(wrap);
  }

  function mountSlot(wrap) {
    if (!wrap._spec) return;
    const spec = wrap._spec;
    delete wrap._spec;
    delete wrap.dataset.pending;
    Widgets.mount(spec, wrap, { domId: wrap._prefix + spec.id });
  }

  let flushing = false;
  function flushPending(root) {
    const queue = pending.filter((w) => w._spec && (!root || root.contains(w)));
    if (!queue.length || flushing) return;
    flushing = true;
    const step = () => {
      const batch = queue.splice(0, 3);
      batch.forEach(mountSlot);
      if (queue.length) nextFrame(step);
      else {
        flushing = false;
        // anything left over (another view) can wait for its own switch
        for (let i = pending.length - 1; i >= 0; i--) if (!pending[i]._spec) pending.splice(i, 1);
      }
    };
    nextFrame(step);
  }

  /** Mount one slot immediately, by widget id (used when jumping to a model). */
  function mountById(id) {
    const w = pending.find((x) => x._spec && x._spec.id === id);
    if (w) mountSlot(w);
  }

  /* ── Models view: every widget, standalone ── */
  function buildModels() {
    const root = $('modelIndex');
    root.innerHTML = '';
    C.chapters.forEach((ch, ci) => {
      (ch.widgets || []).forEach((spec) => {
        const wrap = document.createElement('div');
        const head = document.createElement('button');
        head.className = 'mi';
        head.type = 'button';
        head.innerHTML = `<span><b>${esc(spec.title)}</b><span>Chapter ${ci + 1} — ${esc(ch.title)}</span></span><em>${hms(spec.linkedTimestampSec || ch.start)}</em>`;
        head.addEventListener('click', () => {
          mountById(spec.id);
          const w = document.getElementById('mdl-' + spec.id);
          if (w) w.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        wrap.appendChild(head);
        // Mount on first approach — 21 charts built at once makes the view
        // switch janky, and most are off-screen anyway.
        wrap.dataset.pending = spec.id;
        lazyMount(wrap, spec, 'mdl-');
        root.appendChild(wrap);
      });
    });
  }

  /* ── Numbers view ── */
  function buildNumbers() {
    const root = $('numberTable');
    const render = (q) => {
      root.innerHTML = '';
      const ql = (q || '').toLowerCase();
      let shown = 0;
      C.chapters.forEach((ch, ci) => {
        const rows = (ch.keyNumbers || []).filter((n) =>
          !ql || (n.value + ' ' + (n.unit || '') + ' ' + n.meaning).toLowerCase().includes(ql));
        if (!rows.length) return;
        const h = document.createElement('div');
        h.className = 'num-ch';
        h.textContent = `Chapter ${ci + 1} — ${ch.title}`;
        root.appendChild(h);
        rows.forEach((n) => {
          shown++;
          const b = document.createElement('button');
          b.className = 'num-row';
          b.type = 'button';
          b.innerHTML = `<b>${esc(n.value)}${n.unit ? ' ' + esc(n.unit) : ''}</b><span>${esc(n.meaning)}</span><em>${hms(n.atSec)}</em>`;
          b.addEventListener('click', () => { markStarted(); Player.seek(n.atSec); });
          root.appendChild(b);
        });
      });
      if (!shown) root.innerHTML = '<div class="num-ch">No numbers match that filter.</div>';
    };
    render('');
    $('numSearch').addEventListener('input', (e) => render(e.target.value));
  }

  /* ── Glossary view ── */
  function buildGlossary() {
    const root = $('glossary');
    const all = [];
    const seen = new Set();
    C.chapters.forEach((ch) => (ch.jargon || []).forEach((j) => {
      const k = j.term.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      all.push(j);
    }));
    all.sort((a, b) => a.term.localeCompare(b.term));
    const render = (q) => {
      const ql = (q || '').toLowerCase();
      root.innerHTML = '';
      const rows = all.filter((j) => !ql || (j.term + ' ' + j.definition).toLowerCase().includes(ql));
      if (!rows.length) { root.innerHTML = '<div class="glos"><dt>No match</dt><dd>Try another term.</dd></div>'; return; }
      rows.forEach((j) => {
        const d = document.createElement('dl');
        d.className = 'glos';
        d.innerHTML = `<dt>${esc(j.term)}</dt><dd>${esc(j.definition)}</dd>`;
        root.appendChild(d);
      });
    };
    render('');
    $('glosSearch').addEventListener('input', (e) => render(e.target.value));
  }

  /* ── sync ── */
  function onTick(t, playing) {
    const dur = C.video.duration;
    const pct = Math.max(0, Math.min(100, t / dur * 100)) + '%';
    $('scrubber').style.setProperty('--pct', pct);
    $('scrubber').setAttribute('aria-valuenow', Math.floor(t));
    $('clockNow').textContent = hms(t);
    $('btnPlay').textContent = playing ? 'Pause' : 'Play';

    if (playing) started = true;
    if (!started) return;   // leave the intro on the stage

    const bi = beatAt(t);
    if (bi !== activeBeat) {
      activeBeat = bi;
      if (currentView === 'follow') renderStage(bi);
      highlight(bi);
      if (followEnabled && currentView === 'lecture') scrollLectureTo(bi);
    } else if (currentView === 'follow') {
      const dot = document.querySelector('#followStage .sc-dot');
      const live = document.querySelector('#followStage .sc-live');
      if (dot) dot.classList.toggle('paused', !playing);
      if (live) live.textContent = playing ? 'Live' : 'Paused';
    }
  }

  function highlight(bi) {
    const b = beats[bi];
    if (!b) return;
    document.querySelectorAll('.toc-ch').forEach((d, i) => d.classList.toggle('on', i === b.chapterIndex));
    document.querySelectorAll('.toc-segs button').forEach((x) => {
      const on = Number(x.dataset.sec) === b.startSec;
      x.classList.toggle('on', on);
      if (on && followEnabled) x.scrollIntoView({ block: 'nearest' });
    });
    document.querySelectorAll('#scrubChapters span').forEach((s, i) => s.classList.toggle('on', i === b.chapterIndex));
    document.querySelectorAll('#lecture .seg').forEach((d) => d.classList.toggle('on', Number(d.dataset.sec) === b.startSec));

    // In Follow view the stage already shows this beat in full — don't say it twice.
    $('nowPlaying').hidden = currentView === 'follow';
    $('npChapter').textContent = `Chapter ${b.chapterIndex + 1} · ${hms(b.startSec)}`;
    $('npTitle').textContent = b.title;
  }

  function scrollLectureTo(bi) {
    const b = beats[bi];
    if (!b) return;
    const d = document.querySelector(`#lecture .seg[data-sec="${b.startSec}"]`);
    if (d) d.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function scrollToChapter(ci) {
    setView('lecture');
    requestAnimationFrame(() => {
      const s = document.getElementById('ch-' + ci);
      if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* ── views ── */
  function setView(v) {
    currentView = v;
    ['follow', 'lecture', 'models', 'numbers', 'glossary'].forEach((name) => {
      const el2 = $('view-' + name);
      if (el2) el2.hidden = name !== v;
    });
    document.querySelectorAll('.tnav').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    if (v === 'follow') renderStage(activeBeat);
    if (v === 'lecture' || v === 'models') flushPending($('view-' + v));
    $('nowPlaying').hidden = v === 'follow' || activeBeat < 0;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ── init ── */
  function init() {
    C = window.CONTENT;
    if (!C || !C.chapters) { console.error('content missing'); return; }

    buildBeats();
    buildHero();
    buildTOC();
    buildScrubber();
    buildLecture();
    buildModels();
    buildNumbers();
    buildGlossary();

    $('clockEnd').textContent = hms(C.video.duration);
    $('tocCount').textContent = `${C.chapters.length} chapters · ${beats.length} beats`;

    document.querySelectorAll('.tnav[data-view]').forEach((b) =>
      b.addEventListener('click', () => setView(b.dataset.view)));

    $('btnHelp').addEventListener('click', () => {
      setView('follow');
      activeBeat = -1;
      renderStage(-1);
    });

    $('btnPlay').addEventListener('click', () => { markStarted(); Player.toggle(); });
    $('btnBack').addEventListener('click', () => { markStarted(); Player.nudge(-15); });
    $('btnFwd').addEventListener('click', () => { markStarted(); Player.nudge(15); });
    $('followToggle').addEventListener('change', (e) => { followEnabled = e.target.checked; });
    $('fPrev').addEventListener('click', () => { markStarted(); const b = beats[Math.max(0, activeBeat - 1)]; if (b) Player.seek(b.startSec); });
    $('fNext').addEventListener('click', () => { markStarted(); const b = beats[Math.min(beats.length - 1, activeBeat + 1)]; if (b) Player.seek(b.startSec); });

    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      if (e.key === ' ') { e.preventDefault(); Player.toggle(); }
      else if (e.key === 'ArrowLeft' && !e.metaKey) { e.preventDefault(); Player.nudge(-15); }
      else if (e.key === 'ArrowRight' && !e.metaKey) { e.preventDefault(); Player.nudge(15); }
      else if (e.key === 'j') Player.nudge(-15);
      else if (e.key === 'l') Player.nudge(15);
      else if (e.key === 'n') { const b = beats[Math.min(beats.length - 1, activeBeat + 1)]; if (b) Player.seek(b.startSec); }
      else if (e.key === 'p') { const b = beats[Math.max(0, activeBeat - 1)]; if (b) Player.seek(b.startSec); }
    });

    Player.onTick(onTick);

    // deep link: ?t=1234 or #t=1234
    const m = /[?#]t=(\d+)/.exec(location.href);
    if (m) {
      const sec = Number(m[1]);
      activeBeat = beatAt(sec);
      renderStage(activeBeat);
      highlight(activeBeat);
      setTimeout(() => Player.seek(sec, false), 1200);
    } else {
      renderStage(-1);
    }

    setView('follow');
  }

  return { init, cueButton, hms, toast, get beats() { return beats; } };
})();

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
