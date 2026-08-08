# The Physics of Serving a Frontier Model

An interactive explainer for Dwarkesh Patel's blackboard lecture with **Reiner Pope**
(CEO of MatX, previously TPU architecture at Google):
[*How GPT, Claude, and Gemini are actually trained and served*](https://www.youtube.com/watch?v=xmkSf5IS-zw)
— 2h14m, seven chapters.

The lecture derives the economics of frontier AI from two quantities: how long it takes
to move bytes, and how long it takes to multiply them. This page turns the whiteboard
back on — the curves he draws are live, and every one links back to the moment he
draws it.

## Two ways to use it

**Follow mode** (default) — the video drives. At each moment the explainer for *that*
point swaps in: what he's arguing, why it matters, the pull quote, and the interactive
model for that beat, mounted live. It auto-advances as the video plays.

**Standalone** — ignore the player entirely:

| View | What it is |
| --- | --- |
| **Lecture** | All 7 chapters and 66 beats in order, with every model inline |
| **Models** | All 21 interactive models on their own, each linking back to its timestamp |
| **Numbers** | Every one of the 166 quantities he cites, searchable, click to jump |
| **Glossary** | 87 terms, defined in the sense the lecture uses them |

## Running it

```bash
python3 -m http.server 8123
open http://localhost:8123/
```

Serve over HTTP rather than opening the file directly — the YouTube IFrame API needs a
real origin. Deep-link into any moment with `?t=<seconds>`, e.g.
<http://localhost:8123/?t=966>.

Keyboard: `space` play/pause · `←`/`→` or `j`/`l` ±15s · `n`/`p` next/previous beat.

If the embed is blocked or you're offline, the page still works — timestamp buttons open
YouTube at the right moment instead.

## What's in the models

Each model is a spec — controls, output expressions, a chart or diagram, and named
scenarios drawn from the lecture — rendered by a generic engine. Highlights:

- **The two-line roofline.** Step time and cost per token against batch size, log-log.
  Reproduces his first drawing exactly: flat weight-fetch line, compute and KV as lines
  through the origin, total as the max. Presets for *Fast Mode*, *no batching at all*,
  and *200K context*.
- **The balance batch size**, ≈ 300 × sparsity, independent of model scale.
- **One rack or two** — the all-to-all cliff when half the tokens hit a fabric 8× slower.
- **The pipeline bubble** — a live Gantt showing why training pays for the bubble and
  inference doesn't.
- **Inverting the price list** — how 200K-token price breaks imply ~2 KB of KV per token.
- **Why output costs 5×** — cost per token as *t* ÷ pass length.
- **100× over-trained** — equalise training, RL and inference cost, read off the ratio.

## How it was built

The transcript was pulled with `yt-dlp`, split by chapter, and mined by a 14-agent
workflow: one analyst per chapter extracting the argument, the numbers, the mechanisms
and the quotes; then one designer per chapter turning that into implementable model
specs. `build_content.py` assembles the results into `js/content.js`.

```bash
python3 build_content.py     # rebuild content from the workflow journal
node validate_widgets.js     # check every expression evaluates finite
```

`validate_widgets.js` matters: the specs are machine-authored, so every output
expression and chart series is evaluated at its defaults, at every preset, and across
every chart's full x-range. Anything that yields `NaN`, `Infinity` or fails to compile
is an error. Current state: **3,223 evaluations across 21 models, all clean.**

## Layout

```
index.html            shell and the five views
css/app.css           chalk-on-slate design system
js/content.js         generated — chapters, beats, numbers, glossary, model specs
js/player.js          YouTube IFrame API wrapper; degrades to deep links
js/app.js             beat flattening, playback sync, view routing
js/widgets.js         spec -> live model (controls, outputs, presets, derivations)
js/charts.js          dependency-free SVG plotter, log/linear axes
js/diagrams.js        bespoke drawings: rack fabric, pipeline Gantt, memory tiers, Feistel
build_content.py      workflow journal -> content.js
validate_widgets.js   math validator
```

No dependencies, no build step. The only network request is the YouTube player.

## Provenance

Every number in the models is the presenter's own unless the model says otherwise;
scenario buttons carry the claim they reproduce. Chapter prose is a summary of the
lecture, not a transcript — quotes are verbatim and timestamped.
