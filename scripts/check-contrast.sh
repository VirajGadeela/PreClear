#!/usr/bin/env bash
#
# The palette exists twice now: theme.ts declares a light and a dark value for
# every colour role, and "every value is checked against WCAG rather than
# chosen by eye" stops being enforceable the moment there are two grounds per
# token. This is the parity check for that — it re-measures every role against
# every ground it can actually sit on, in both themes, and fails if one is
# below its floor.
#
# Four grounds, not two. Measuring against canvas and surface only is how the
# pre-2026-09-03 `border` shipped at 2.83:1 on the recommended card's tint,
# below the 3:1 WCAG 1.4.11 asks of a control boundary. A control drawn on
# accentSoft is still a control.
#
# Floors:
#   4.5:1  text under 18px                    (WCAG 1.4.3)
#   3.0:1  boundary of an interactive element (WCAG 1.4.11)
#   3.0:1  text 18px+ or 14px+ bold           (WCAG 1.4.3, large text)
#
# Run from the repo root:  ./scripts/check-contrast.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 - "$ROOT/app/src/theme.ts" <<'PYEOF'
import re, sys, pathlib

src = pathlib.Path(sys.argv[1]).read_text()

def grab(name):
    """Pull one palette object out of theme.ts by its declaration."""
    m = re.search(rf'const {name}[^=]*= \{{(.*?)\n\}}', src, re.S)
    if not m:
        sys.exit(f"check-contrast: could not find `{name}` in theme.ts")
    return dict(re.findall(r"(\w+):\s*'(#[0-9A-Fa-f]{6}|transparent)'", m.group(1)))

THEMES = {'light': grab('LIGHT'), 'dark': grab('DARK')}

def lin(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def lum(h):
    h = h.lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)

def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)

GROUNDS = ['canvas', 'surface', 'accentSoft', 'flagBg']

# role -> (floor, why). Roles absent here are grounds or fills measured below.
ROLES = {
    'ink':        (4.5, 'primary text'),
    'inkMuted':   (4.5, 'secondary text'),
    'accentText': (4.5, 'accent hue at text sizes under 18px'),
    'flag':       (4.5, 'data-quality warnings'),
    'border':     (3.0, 'interactive boundary, WCAG 1.4.11'),
    'accent':     (3.0, 'large text and fills only, never small text'),
}

# Explicit fill pairings that are not role-against-ground.
PAIRS = [
    ('accentInk', 'accent', 4.5, 'label on the accent fill'),
    ('slateInk',  'slate',  4.5, 'label on a slate fill'),
    ('slate',     'canvas', 3.0, 'the non-recommended route fill'),
]

failures = []
checked = 0

for theme, P in THEMES.items():
    missing = set(THEMES['light']) - set(P)
    if missing:
        failures.append(f"{theme}: missing role(s) {sorted(missing)}")
    for role, (floor, why) in ROLES.items():
        for ground in GROUNDS:
            r = ratio(P[role], P[ground])
            checked += 1
            if r < floor:
                failures.append(
                    f"{theme}: {role} ({P[role]}) on {ground} ({P[ground]}) "
                    f"= {r:.2f}:1, needs {floor}:1 — {why}")
    for fg, bg, floor, why in PAIRS:
        r = ratio(P[fg], P[bg])
        checked += 1
        if r < floor:
            failures.append(
                f"{theme}: {fg} ({P[fg]}) on {bg} ({P[bg]}) "
                f"= {r:.2f}:1, needs {floor}:1 — {why}")

if failures:
    print("Contrast failures:\n")
    for f in failures:
        print(f"  {f}")
    print(f"\n{len(failures)} of {checked} measured pairs are below their floor.")
    sys.exit(1)

print(f"All {checked} measured pairs clear their WCAG floor "
      f"({len(THEMES)} themes x {len(ROLES)} roles x {len(GROUNDS)} grounds, "
      f"plus {len(PAIRS)} fill pairings).")
PYEOF
