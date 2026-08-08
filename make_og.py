#!/usr/bin/env python3
"""Generate the Open Graph card (og.png, 1200x630).

The chart on the card is not decoration: it is the same roofline the page
teaches, computed here from the same equations and the same DeepSeek-V3 /
Blackwell NVL72 defaults the flagship model ships with.

    python3 make_og.py     # writes og.svg and og.png
"""
import math
import subprocess

W, H = 1200, 630

# ── hardware + model, matching the roofline widget's defaults ──
NGPU = 72            # Blackwell NVL72
PFLOPS = 10e15       # dense FP4 per GPU
BW = 8e12            # HBM bytes/s per GPU
N_TOT = 671e9        # DeepSeek-V3 total params
N_ACT = 37e9         # active per token
CTX = 16_000         # context length
KV_B = 35e3          # KV bytes per token

t_compute = lambda B: 2 * N_ACT * B / (PFLOPS * NGPU)
t_weights = lambda B: N_TOT * 0.5 / (BW * NGPU)
t_kv      = lambda B: B * CTX * KV_B / (BW * NGPU)
t_total   = lambda B: max(t_compute(B), t_weights(B) + t_kv(B))

# ── chart frame (right-hand side of the card, bleeding off the edge) ──
CX, CY, CW, CH = 632, 132, 620, 372
B_MIN, B_MAX = 1.0, 1e5
Y_MIN, Y_MAX = 1e-4, 3e1          # seconds, log

lx = lambda b: CX + (math.log10(b) - math.log10(B_MIN)) / (math.log10(B_MAX) - math.log10(B_MIN)) * CW
ly = lambda t: CY + CH - (math.log10(t) - math.log10(Y_MIN)) / (math.log10(Y_MAX) - math.log10(Y_MIN)) * CH


def path(fn, n=180):
    pts = []
    for i in range(n + 1):
        b = 10 ** (math.log10(B_MIN) + i / n * (math.log10(B_MAX) - math.log10(B_MIN)))
        y = fn(b)
        if y <= 0:
            continue
        px, py = lx(b), ly(y)
        if py < CY - 40 or py > CY + CH + 40:
            continue
        pts.append(f"{px:.1f} {py:.1f}")
    return "M " + " L ".join(pts)


def balance_batch():
    """The batch size where the weight fetch is finally amortised.

    This is Pope's '300 x sparsity' result, and it compares compute against the
    WEIGHT fetch only — he drops the KV term explicitly to get a clean answer.
    Including KV there is no crossover at long context: the KV slope per
    sequence exceeds the compute slope, so memory wins at every batch size.
    That is the same fact the page's 'balance context length' output reports.
    """
    return N_TOT * 0.5 * PFLOPS / (2 * N_ACT * BW)


BAL = balance_batch()

grid = []
for e in range(-4, 2):
    y = ly(10.0 ** e)
    grid.append(f'<line x1="{CX}" y1="{y:.1f}" x2="{CX+CW}" y2="{y:.1f}" '
                f'stroke="#e9e7de" stroke-opacity="0.055" stroke-width="1"/>')
for e in range(0, 6):
    x = lx(10.0 ** e)
    grid.append(f'<line x1="{x:.1f}" y1="{CY}" x2="{x:.1f}" y2="{CY+CH}" '
                f'stroke="#e9e7de" stroke-opacity="0.055" stroke-width="1"/>')

SANS = "Helvetica Neue, Helvetica, Arial, sans-serif"
MONO = "SF Mono, Menlo, Monaco, monospace"

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
  <defs>
    <radialGradient id="g1" cx="14%" cy="0%" r="70%">
      <stop offset="0%" stop-color="#6fd3d6" stop-opacity="0.13"/>
      <stop offset="100%" stop-color="#6fd3d6" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g2" cx="88%" cy="12%" r="65%">
      <stop offset="0%" stop-color="#f2c14e" stop-opacity="0.11"/>
      <stop offset="100%" stop-color="#f2c14e" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="{W}" height="{H}" fill="#0d1214"/>
  <rect width="{W}" height="{H}" fill="url(#g1)"/>
  <rect width="{W}" height="{H}" fill="url(#g2)"/>

  <!-- ── the roofline, from the real equations ── -->
  <g>
    {"".join(grid)}
    <line x1="{CX}" y1="{CY+CH}" x2="{CX+CW}" y2="{CY+CH}" stroke="#e9e7de" stroke-opacity="0.2" stroke-width="1.5"/>

    <!-- balance point: memory-bound to the left, compute-bound to the right -->
    <line x1="{lx(BAL):.1f}" y1="{CY}" x2="{lx(BAL):.1f}" y2="{CY+CH}"
          stroke="#9ccc65" stroke-width="2" stroke-dasharray="6 5" stroke-opacity="0.75"/>
    <text x="{lx(BAL)-12:.1f}" y="{CY+18}" font-family="{MONO}" font-size="16" font-weight="700"
          fill="#9ccc65" text-anchor="end">B ≈ 300 × sparsity</text>
    <circle cx="{lx(BAL):.1f}" cy="{ly(t_total(BAL)):.1f}" r="7" fill="#9ccc65" stroke="#0d1214" stroke-width="3"/>

    <path d="{path(t_kv)}"      fill="none" stroke="#b39ddb" stroke-width="3.5" stroke-opacity="0.85" stroke-linecap="round"/>
    <path d="{path(t_compute)}" fill="none" stroke="#6fd3d6" stroke-width="3.5" stroke-opacity="0.85" stroke-linecap="round"/>
    <path d="{path(t_weights)}" fill="none" stroke="#ef8354" stroke-width="3.5" stroke-opacity="0.85" stroke-linecap="round"/>
    <path d="{path(t_total)}"   fill="none" stroke="#f2c14e" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>

    <text x="{CX}" y="{CY+CH+72}" font-family="{MONO}" font-size="15" fill="#7f8781">step time vs batch size · log–log</text>
  </g>

  <!-- ── text ── -->
  <text x="72" y="118" font-family="{SANS}" font-size="19" font-weight="700"
        letter-spacing="3.4" fill="#f2c14e">INTERACTIVE EXPLAINER</text>

  <text x="72" y="212" font-family="{SANS}" font-size="66" font-weight="700"
        letter-spacing="-2.2" fill="#e9e7de">Why a token costs</text>
  <text x="72" y="284" font-family="{SANS}" font-size="66" font-weight="700"
        letter-spacing="-2.2" fill="#e9e7de">what it costs</text>

  <text x="72" y="342" font-family="{SANS}" font-size="24" fill="#b3b6ae">Reiner Pope × Dwarkesh Patel — two hours</text>
  <text x="72" y="378" font-family="{SANS}" font-size="24" fill="#b3b6ae">at a blackboard, made playable.</text>

  <text x="72" y="446" font-family="{SANS}" font-size="20" fill="#7f8781">Scrub the video. The explainer follows.</text>

  <!-- stat chips -->
  <g font-family="{MONO}" font-size="17" font-weight="700">
    <rect x="72"  y="486" width="150" height="44" rx="10" fill="#f2c14e" fill-opacity="0.13" stroke="#f2c14e" stroke-opacity="0.4"/>
    <text x="147" y="514" fill="#f2c14e" text-anchor="middle">21 live models</text>

    <rect x="234" y="486" width="128" height="44" rx="10" fill="#6fd3d6" fill-opacity="0.11" stroke="#6fd3d6" stroke-opacity="0.35"/>
    <text x="298" y="514" fill="#6fd3d6" text-anchor="middle">7 chapters</text>

    <rect x="374" y="486" width="150" height="44" rx="10" fill="#b39ddb" fill-opacity="0.11" stroke="#b39ddb" stroke-opacity="0.35"/>
    <text x="449" y="514" fill="#b39ddb" text-anchor="middle">166 numbers</text>
  </g>
</svg>
'''

with open("og.svg", "w") as f:
    f.write(svg)

subprocess.run(["rsvg-convert", "-w", str(W), "-h", str(H), "-o", "og.png", "og.svg"], check=True)
print(f"balance batch B* = {BAL:,.0f} | 300 x sparsity = {300*N_TOT/N_ACT:,.0f} | sparsity {N_TOT/N_ACT:.1f}x")
print("wrote og.svg and og.png")
