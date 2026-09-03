#!/usr/bin/env python3
"""Assert every documented contrast ratio in app/src/theme.ts, on both schemes.

The palette comments carry measured WCAG ratios, and until this existed they
were measured by hand and then trusted forever. Several had drifted by the time
a second scheme was added -- small amounts, but a documented ratio nobody checks
is worse than no ratio at all, because it gets quoted in a review.

Dark mode is the reason this became necessary rather than nice to have. Adding
a second palette doubles every pair, and the failure mode is silent: a hex that
looks fine on a laptop can be a 3:1 body text on a phone in daylight, and
nothing in the build catches it.

The rules below are WCAG 2.1:

  1.4.3  normal text 4.5:1, large text (>=18pt, or >=14pt bold) 3:1
  1.4.11 the boundary of an interactive element 3:1

`line` is asserted from the other direction -- it must stay *below* 1.5:1. It is
decorative, and if it ever became legible it would be a second `border`, which
collapses the distinction `stroke.hairline` and `stroke.control` are built on.

Run from the repo root:  ./scripts/check-contrast.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

THEME = Path(__file__).resolve().parent.parent / "app" / "src" / "theme.ts"


def relative_luminance(hex_color: str) -> float:
    value = hex_color.lstrip("#")
    channels = [int(value[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    linear = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def ratio(a: str, b: str) -> float:
    la, lb = relative_luminance(a), relative_luminance(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def read_palettes() -> dict[str, dict[str, str]]:
    """Pull both schemes out of theme.ts.

    Deliberately parses the real file rather than keeping a copy of the hexes
    here. A checker with its own copy of the values it checks passes forever.
    """
    source = THEME.read_text()
    start = source.index("export const palettes")
    body = source[start:]

    schemes: dict[str, dict[str, str]] = {}
    for name in ("light", "dark"):
        opened = re.search(rf"^  {name}: \{{$", body, re.MULTILINE)
        if opened is None:
            sys.exit(f"could not find the {name} palette in {THEME}")
        closed = body.index("\n  },", opened.end())
        block = body[opened.end() : closed]
        schemes[name] = dict(re.findall(r"(\w+): '(#[0-9A-Fa-f]{6})'", block))
    return schemes


# (foreground, background, minimum, why). Applied to both schemes -- a pair that
# holds in light and fails in dark is exactly what this is for.
TEXT_PAIRS = [
    ("ink", "canvas", 4.5, "body text on the page ground"),
    ("ink", "surface", 4.5, "body text on a card"),
    ("ink", "accentSoft", 4.5, "body text on the recommended card"),
    ("inkMuted", "canvas", 4.5, "secondary text on the page ground"),
    ("inkMuted", "surface", 4.5, "secondary text on a card"),
    ("inkMuted", "accentSoft", 4.5, "secondary text on the recommended card"),
    ("accent", "canvas", 3.0, "the accent at heading sizes"),
    ("accent", "surface", 3.0, "the accent at heading sizes, on a card"),
    ("accent", "accentSoft", 3.0, "the accent on its own tinted card"),
    ("accentInk", "accent", 4.5, "text on an accent fill"),
    ("accentText", "canvas", 4.5, "small accent text -- the disclosure chevrons"),
    ("accentText", "surface", 4.5, "small accent text on a card"),
    ("accentText", "accentSoft", 4.5, "small accent text on the recommended card"),
    ("slateInk", "slate", 4.5, "the primary button's label, and a selected chip's"),
    ("flag", "flagBg", 4.5, "a data-quality warning in its own block"),
    ("flag", "canvas", 4.5, "a data-quality warning inline"),
    ("flag", "surface", 4.5, "a data-quality warning on a card"),
]

# WCAG 1.4.11. `border` is the only thing telling a member a control is there --
# an unselected chip is surface-on-canvas, which is invisible without it.
CONTROL_PAIRS = [
    ("border", "canvas", 3.0, "a chip or input outline on the page ground"),
    ("border", "surface", 3.0, "a chip or input outline on a card"),
    ("slate", "canvas", 3.0, "a filled control against the page ground"),
]

# Asserted from below: decorative, and must stay that way.
DECORATIVE_MAX = [
    ("line", "surface", 1.5, "hairlines must not become a second border"),
    ("line", "canvas", 1.5, "hairlines must not become a second border"),
]


def main() -> int:
    schemes = read_palettes()
    failures: list[str] = []
    checks = 0

    for scheme, palette in schemes.items():
        missing = {
            name
            for pairs in (TEXT_PAIRS, CONTROL_PAIRS, DECORATIVE_MAX)
            for fg, bg, _, _ in pairs
            for name in (fg, bg)
        } - set(palette)
        if missing:
            failures.append(f"{scheme}: palette is missing {', '.join(sorted(missing))}")
            continue

        for fg, bg, floor, why in TEXT_PAIRS + CONTROL_PAIRS:
            checks += 1
            measured = ratio(palette[fg], palette[bg])
            if measured < floor:
                failures.append(
                    f"{scheme}: {fg} on {bg} is {measured:.2f}:1, needs {floor}:1 -- {why}"
                )

        for fg, bg, ceiling, why in DECORATIVE_MAX:
            checks += 1
            measured = ratio(palette[fg], palette[bg])
            if measured > ceiling:
                failures.append(
                    f"{scheme}: {fg} on {bg} is {measured:.2f}:1, must stay under "
                    f"{ceiling}:1 -- {why}"
                )

        # DESIGN.md section 6 bans shadow, so a card lifts off its ground by
        # value alone. It has to lift in the same direction in both schemes, or
        # a card reads as a hole punched in the page.
        checks += 1
        if relative_luminance(palette["surface"]) <= relative_luminance(palette["canvas"]):
            failures.append(
                f"{scheme}: surface must be lighter than canvas -- with no shadow, "
                "the value step is the only thing lifting a card"
            )

    for line in failures:
        print(f"FAIL  {line}")
    if failures:
        print(f"\n{len(failures)} of {checks} contrast checks failed")
        return 1

    print(f"{checks} contrast checks pass across {len(schemes)} schemes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
