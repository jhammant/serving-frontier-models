#!/usr/bin/env python3
"""Assemble js/content.js from the mining workflow's journal.

Reads every structured result the workflow agents produced, matches each
one to its chapter, and emits the single data file the webapp consumes.
Re-runnable: pick up new widget results as designers finish.
"""
import json
import os
import re
import sys

RUN = sys.argv[1] if len(sys.argv) > 1 else "wf_71f25bb4-4b3"
BASE = os.path.expanduser(
    "~/.claude/projects/-Users-jhammant-dev-SclaingRoutedModels/"
    "d6007218-70a5-4740-ac35-ea0cdb609f9e/subagents/workflows"
)
JOURNAL = os.path.join(BASE, RUN, "journal.jsonl")
OUT = "/Users/jhammant/dev/SclaingRoutedModels/js/content.js"

CHAPTERS = [
    ("01-batch-size-cost-speed", "How batch size sets both the price of a token and the speed you get it", 0),
    ("02-moe-rack-layout", "How a mixture-of-experts model is laid out across a rack of GPUs", 1919),
    ("03-pipeline-parallelism", "How pipeline parallelism spreads layers across racks", 2822),
    ("04-pipelining-not-wise", 'Why Ilya said "pipelining is not wise"', 3807),
    ("05-overtrained-rl-chinchilla", "Because of RL, models may be 100× over-trained past Chinchilla", 4729),
    ("06-long-context-kv-cost", "Reading long-context memory costs straight off the API price list", 5572),
    ("07-nn-cryptography", "Convergent evolution between neural nets and cryptography", 7432),
]
DURATION = 8020


def slug_key(s):
    """Normalise a slug so '05-overtrained-rl-chinchilla' == 'overtrained-rl-chinchilla'."""
    return re.sub(r"^\d+-", "", (s or "").strip().lower())


def load_results():
    mined, widgets = {}, {}
    if not os.path.exists(JOURNAL):
        sys.exit(f"no journal at {JOURNAL}")
    for line in open(JOURNAL):
        try:
            d = json.loads(line)
        except json.JSONDecodeError:
            continue
        if d.get("type") != "result":
            continue
        r = d.get("result")
        if not isinstance(r, dict):
            continue
        key = slug_key(r.get("chapterSlug"))
        if "widgets" in r:
            widgets.setdefault(key, []).extend(r.get("widgets") or [])
        elif "segments" in r:
            mined[key] = r
    return mined, widgets


def match(store, slug):
    """Match a chapter slug against agent-reported slugs, tolerating drift."""
    k = slug_key(slug)
    if k in store:
        return store[k]
    for other, v in store.items():
        if other in k or k in other:
            return v
        a, b = set(k.split("-")), set(other.split("-"))
        if len(a & b) >= 2:
            return v
    return None


def clean_segments(segs, start, end):
    """Keep segments in order, inside the chapter, and strictly increasing."""
    out, last = [], -1
    for s in sorted(segs or [], key=lambda x: x.get("startSec", 0)):
        t = int(s.get("startSec", start))
        t = max(start, min(t, end - 5))
        if t <= last:
            t = last + 5
        if t >= end:
            continue
        last = t
        out.append({
            "startSec": t,
            "title": s.get("title", "").strip(),
            "gist": s.get("gist", "").strip(),
            "whyItMatters": (s.get("whyItMatters") or "").strip(),
        })
    return out


def clamp_sec(v, start, end, default):
    try:
        t = int(v)
    except (TypeError, ValueError):
        return default
    return t if start <= t < end else default


def main():
    mined, widgets = load_results()
    print(f"mined chapters: {len(mined)} | widget sets: {len(widgets)}")

    chapters, total_widgets = [], 0
    for i, (slug, title, start) in enumerate(CHAPTERS):
        end = CHAPTERS[i + 1][2] if i + 1 < len(CHAPTERS) else DURATION
        m = match(mined, slug) or {}
        ws = match(widgets, slug) or []

        segs = clean_segments(m.get("segments"), start, end)
        if not segs:
            segs = [{"startSec": start, "title": title, "gist": m.get("thesis", ""), "whyItMatters": ""}]

        for w in ws:
            w["linkedTimestampSec"] = clamp_sec(w.get("linkedTimestampSec"), start, end, start)
        total_widgets += len(ws)

        chapters.append({
            "slug": slug,
            "title": title,
            "start": start,
            "thesis": m.get("thesis", ""),
            "segments": segs,
            "keyNumbers": [
                {
                    "value": str(n.get("value", "")),
                    "unit": n.get("unit", ""),
                    "meaning": n.get("meaning", ""),
                    "atSec": clamp_sec(n.get("atSec"), start, end, start),
                }
                for n in (m.get("keyNumbers") or [])
                if n.get("meaning")
            ],
            "mechanisms": m.get("mechanisms") or [],
            "quotes": [
                {
                    "atSec": clamp_sec(q.get("atSec"), start, end, start),
                    "speaker": q.get("speaker", "Reiner Pope"),
                    "text": q.get("text", "").strip(),
                }
                for q in (m.get("quotes") or [])
                if q.get("text")
            ][:3],
            "misconceptions": m.get("misconceptions") or [],
            "jargon": m.get("jargon") or [],
            "widgets": ws,
        })
        print(f"  ch{i+1} {slug}: {len(segs)} beats, {len(ws)} widgets, "
              f"{len(chapters[-1]['keyNumbers'])} numbers, {len(chapters[-1]['quotes'])} quotes")

    content = {
        "video": {
            "id": "xmkSf5IS-zw",
            "duration": DURATION,
            "title": "How GPT, Claude, and Gemini are actually trained and served",
            "guest": "Reiner Pope",
            "host": "Dwarkesh Patel",
        },
        "heroStats": HERO_STATS,
        "arc": ARC,
        "chapters": chapters,
    }

    body = json.dumps(content, indent=2, ensure_ascii=False)
    with open(OUT, "w") as f:
        f.write(
            "/* AUTO-GENERATED by build_content.py — do not hand-edit.\n"
            "   Source: the full transcript of youtube.com/watch?v=xmkSf5IS-zw,\n"
            "   mined chapter-by-chapter and turned into interactive model specs. */\n\n"
            "window.CONTENT = " + body + ";\n"
        )
    print(f"\nwrote {OUT} — {len(chapters)} chapters, {total_widgets} widgets, "
          f"{sum(len(c['segments']) for c in chapters)} beats")


HERO_STATS = [
    {"value": "~300", "label": "FLOPs-per-byte ratio of a modern GPU — the dimensionless constant the whole lecture hinges on"},
    {"value": "300 × sparsity", "label": "the batch size where memory and compute finally balance"},
    {"value": "~20 ms", "label": "time to read the whole of HBM once — why a decode step lasts as long as it does"},
    {"value": "~100×", "label": "how far past Chinchilla-optimal frontier models are plausibly over-trained"},
]

ARC = [
    {"html": "Two clocks govern everything: <b>the time to move the bytes</b> and <b>the time to multiply them</b>. Write both down and take the max.", "atSec": 157},
    {"html": "Batching amortises the weight fetch. Below a certain batch size you pay to drag the whole model out of memory for almost nobody — cost per token goes nearly vertical.", "atSec": 780},
    {"html": "Set the two clocks equal and the balance batch size falls out: <b>≈ 300 × sparsity</b>, independent of model scale.", "atSec": 966},
    {"html": "That's why sparsity is nearly free on compute — but it costs memory capacity, which forces the experts out across a whole rack.", "atSec": 1700},
    {"html": "All-to-all routing fits a rack's switch fabric perfectly, and falls off a cliff the moment it crosses a rack boundary onto a link <b>8× slower</b>.", "atSec": 2140},
    {"html": "Pipelining across racks shrinks the weight footprint — but the KV cache footprint refuses to shrink with it. That's the catch behind Ilya's line.", "atSec": 4272},
    {"html": "Equalise training, RL and inference cost and the token budgets come out roughly equal — implying models are around <b>100× over-trained</b>.", "atSec": 4729},
    {"html": "Finally, run the argument backwards: the published API price list tells you the KV bytes per token, and why context stalled at 200k.", "atSec": 5572},
]

if __name__ == "__main__":
    main()
